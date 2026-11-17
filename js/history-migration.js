/**
 * Migração progressiva e conservadora de mensagens históricas V2 para V3.
 * Não acessa Firebase diretamente: o chamador fornece as funções de leitura,
 * descriptografia, criptografia e persistência. Nenhum texto claro é salvo.
 */

const ID_RE = /^[A-Za-z0-9_-]{8,100}$/;

function validateMessage(message) {
  if (!message || typeof message !== 'object') throw new Error('Registro de mensagem inválido.');
  if (typeof message.id !== 'string' || !ID_RE.test(message.id)) throw new Error('ID de mensagem inválido.');
  if (message.v !== 2) throw new Error('Somente mensagens V2 podem ser migradas.');
  if (typeof message.senderUid !== 'string' || !message.senderUid) throw new Error('Remetente da mensagem ausente.');
  if (typeof message.ciphertext !== 'string' || typeof message.salt !== 'string' || typeof message.iv !== 'string') {
    throw new Error('Dados criptográficos V2 incompletos.');
  }
}

/**
 * Migra apenas mensagens enviadas pela conta autenticada e sem anexos.
 * Mensagens recebidas exigem que o outro participante execute a migração;
 * anexos têm uma etapa própria para conversão do conteúdo binário.
 */
export async function migrateOwnedV2History({
  messages,
  ownerUid,
  decryptLegacyMessage,
  encryptV3Message,
  persistV3Message,
  dryRun = false,
  maxItems = 25
}) {
  if (!Array.isArray(messages)) throw new Error('A lista de mensagens precisa ser um array.');
  if (!ownerUid) throw new Error('UID da conta migradora ausente.');
  if (typeof decryptLegacyMessage !== 'function' || typeof encryptV3Message !== 'function' || typeof persistV3Message !== 'function') {
    throw new Error('Callbacks de migração incompletos.');
  }
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 100) throw new Error('Lote deve conter entre 1 e 100 mensagens.');

  const result = { scanned: 0, eligible: 0, migrated: 0, skipped: 0, failed: 0, dryRun, failures: [] };
  const seen = new Set();
  const candidates = [];

  for (const message of messages) {
    result.scanned++;
    try {
      validateMessage(message);
      if (seen.has(message.id)) throw new Error('Mensagem duplicada na entrada.');
      seen.add(message.id);
      if (message.senderUid !== ownerUid || message.media) {
        result.skipped++;
        continue;
      }
      // A mídia histórica fica dentro do corpo cifrado V2, não no documento Firestore.
      // Abrimos o corpo apenas em memória para impedir que um anexo seja migrado
      // pelo fluxo de texto e perca seus metadados próprios de criptografia.
      const plaintext = await decryptLegacyMessage(message);
      if (!plaintext || typeof plaintext !== 'object' || Array.isArray(plaintext)) {
        throw new Error('Conteúdo legado descriptografado possui formato inválido.');
      }
      if (plaintext.media) {
        result.skipped++;
        continue;
      }
      candidates.push({ message, plaintext });
    } catch (error) {
      result.skipped++;
      result.failures.push({ id: message?.id || null, reason: error.message });
    }
  }

  result.eligible = candidates.length;
  const batch = candidates.slice(0, maxItems);
  if (candidates.length > batch.length) result.skipped += candidates.length - batch.length;
  if (dryRun) return result;

  for (const candidate of batch) {
    const { message, plaintext } = candidate;
    try {
      // A nova cifra ocorre em memória, uma mensagem por vez.
      const envelope = await encryptV3Message(plaintext, message.id);
      if (!envelope || envelope.v !== 3 || envelope.messageId !== message.id || envelope.purpose !== 'message') {
        throw new Error('Envelope V3 gerado não corresponde à mensagem.');
      }
      // Persistir somente o envelope V3; nunca persistir o texto claro.
      await persistV3Message(message.id, { envelope, v: 3 });
      result.migrated++;
    } catch (error) {
      result.failed++;
      result.failures.push({ id: message.id, reason: error?.message || 'Falha desconhecida.' });
    }
  }

  return result;
}
