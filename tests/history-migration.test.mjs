import assert from 'node:assert/strict';
import { migrateOwnedV2History } from '../js/history-migration.js';

const base = (id, senderUid = 'alice', extra = {}) => ({
  id, senderUid, v: 2, ciphertext: 'cipher', salt: 'salt', iv: 'iv', ...extra
});
const rows = [base('message_0001'), base('message_0002', 'bob'), base('message_0003', 'alice', { media: { path: 'private/file.bin' } }), base('message_0004')];
let decrypted = 0;
let encrypted = 0;
const writes = [];
const callbacks = {
  decryptLegacyMessage: async row => { decrypted++; return { text: `texto ${row.id}` }; },
  encryptV3Message: async (body, id) => { encrypted++; return { v: 3, messageId: id, purpose: 'message', opaque: true }; },
  persistV3Message: async (id, patch) => { writes.push({ id, patch }); }
};

const preview = await migrateOwnedV2History({ messages: rows, ownerUid: 'alice', ...callbacks, dryRun: true });
assert.equal(preview.eligible, 2);
assert.equal(preview.migrated, 0);
assert.equal(decrypted, 2, 'prévia abre em memória os corpos V2 para identificar anexos');
assert.equal(writes.length, 0);

const result = await migrateOwnedV2History({ messages: rows, ownerUid: 'alice', ...callbacks });
assert.equal(result.scanned, 4);
assert.equal(result.migrated, 2);
assert.equal(result.skipped, 2);
assert.equal(result.failed, 0);
assert.equal(decrypted, 4);
assert.equal(encrypted, 2);
assert.equal(writes.length, 2);
assert.deepEqual(writes[0].patch, { envelope: { v: 3, messageId: 'message_0001', purpose: 'message', opaque: true }, v: 3 });

let failWrites = 0;
const partial = await migrateOwnedV2History({
  messages: [base('message_0005'), base('message_0006')], ownerUid: 'alice',
  decryptLegacyMessage: async () => ({ text: 'x' }),
  encryptV3Message: async (_, id) => ({ v: 3, messageId: id, purpose: 'message' }),
  persistV3Message: async () => { failWrites++; if (failWrites === 1) throw new Error('offline'); }
});
assert.equal(partial.migrated, 1);
assert.equal(partial.failed, 1);
console.log('OK: migração histórica V2→V3 com prévia, escopo por remetente, anexos preservados e falha parcial segura.');

const embeddedAttachment = await migrateOwnedV2History({
  messages: [base('message_0007')], ownerUid: 'alice',
  decryptLegacyMessage: async () => ({ text: 'tem anexo', media: { path: 'private/legacy.bin' } }),
  encryptV3Message: async () => { throw new Error('não deve cifrar'); },
  persistV3Message: async () => { throw new Error('não deve gravar'); },
  dryRun: true
});
assert.equal(embeddedAttachment.eligible, 0, 'mensagem com mídia embutida no corpo V2 não entra na migração de texto');
assert.equal(embeddedAttachment.skipped, 1);
