/**
 * Migração conservadora de anexos históricos V2 para V3.
 * O corpo V2 é aberto em memória para localizar os metadados do anexo;
 * os bytes são descriptografados e recifrados sem persistir conteúdo claro.
 * O arquivo antigo nunca é apagado por este módulo.
 */
const ID_RE = /^[A-Za-z0-9_-]{8,100}$/;

function validateRow(row) {
  if (!row || typeof row !== 'object') throw new Error('Registro de mensagem inválido.');
  if (typeof row.id !== 'string' || !ID_RE.test(row.id)) throw new Error('ID de mensagem inválido.');
  if (row.v !== 2) throw new Error('Somente mensagens V2 podem ser migradas.');
  if (typeof row.senderUid !== 'string' || !row.senderUid) throw new Error('Remetente ausente.');
  if (typeof row.ciphertext !== 'string' || typeof row.salt !== 'string' || typeof row.iv !== 'string') throw new Error('Dados criptográficos V2 incompletos.');
}

function validLegacyMedia(media) {
  return !!media && typeof media.path === 'string' && media.path.length > 0 &&
    typeof media.salt === 'string' && typeof media.iv === 'string' && media.envelope?.v !== 3;
}

export async function migrateOwnedV2Attachments({
  messages, ownerUid, decryptLegacyMessage, decryptLegacyAttachment,
  encryptV3Attachment, uploadV3Attachment, encryptV3Message,
  persistV3Message, cleanupUploadedAttachment = async () => {},
  dryRun = false, maxItems = 10
}) {
  if (!Array.isArray(messages)) throw new Error('A lista de mensagens precisa ser um array.');
  if (!ownerUid) throw new Error('UID da conta migradora ausente.');
  for (const [name, fn] of Object.entries({ decryptLegacyMessage, decryptLegacyAttachment, encryptV3Attachment, uploadV3Attachment, encryptV3Message, persistV3Message })) {
    if (typeof fn !== 'function') throw new Error(`Callback obrigatório ausente: ${name}.`);
  }
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 25) throw new Error('Lote deve conter entre 1 e 25 anexos.');

  const result = { scanned: 0, eligible: 0, migrated: 0, skipped: 0, failed: 0, dryRun, failures: [] };
  const seen = new Set();
  const candidates = [];

  for (const row of messages) {
    result.scanned++;
    try {
      validateRow(row);
      if (seen.has(row.id)) throw new Error('Mensagem duplicada na entrada.');
      seen.add(row.id);
      if (row.senderUid !== ownerUid) { result.skipped++; continue; }
      const body = await decryptLegacyMessage(row);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Corpo V2 inválido.');
      if (!validLegacyMedia(body.media)) { result.skipped++; continue; }
      candidates.push({ row, body, media: body.media });
    } catch (error) {
      result.skipped++;
      result.failures.push({ id: row?.id || null, reason: error?.message || 'Falha ao analisar mensagem.' });
    }
  }

  result.eligible = candidates.length;
  const batch = candidates.slice(0, maxItems);
  if (candidates.length > batch.length) result.skipped += candidates.length - batch.length;
  if (dryRun) return result;

  for (const item of batch) {
    let uploadedPath = null;
    try {
      const plainBytes = await decryptLegacyAttachment(item.media, item.row);
      const encrypted = await encryptV3Attachment({ bytes: plainBytes, messageId: item.row.id, media: item.media });
      if (!encrypted || !(encrypted.cipher instanceof Uint8Array) || encrypted.envelope?.v !== 3 || encrypted.envelope?.purpose !== 'attachment') {
        throw new Error('Anexo V3 gerado em formato inválido.');
      }
      uploadedPath = await uploadV3Attachment(item.row.id, encrypted);
      if (typeof uploadedPath !== 'string' || !uploadedPath) throw new Error('Upload não retornou caminho válido.');

      const nextBody = {
        ...item.body,
        media: {
          path: uploadedPath,
          type: encrypted.type || item.media.type || 'application/octet-stream',
          name: encrypted.name || item.media.name || 'anexo',
          size: Number.isFinite(encrypted.size) ? encrypted.size : item.media.size || plainBytes.byteLength,
          envelope: encrypted.envelope
        }
      };
      const envelope = await encryptV3Message(nextBody, item.row.id);
      if (!envelope || envelope.v !== 3 || envelope.messageId !== item.row.id || envelope.purpose !== 'message') {
        throw new Error('Envelope V3 da mensagem inválido.');
      }
      await persistV3Message(item.row.id, { envelope, v: 3 });
      result.migrated++;
    } catch (error) {
      if (uploadedPath) {
        try { await cleanupUploadedAttachment(uploadedPath, item.row.id); }
        catch (cleanupError) { result.failures.push({ id: item.row.id, reason: `Falha de limpeza do arquivo temporário: ${cleanupError?.message || 'erro'}` }); }
      }
      result.failed++;
      result.failures.push({ id: item.row.id, reason: error?.message || 'Falha desconhecida.' });
    }
  }
  return result;
}
