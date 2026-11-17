import assert from 'node:assert/strict';
import { migrateOwnedV2Attachments } from '../js/attachment-migration.js';

const row = (id, senderUid = 'alice') => ({ id, senderUid, v: 2, ciphertext: 'body', salt: 'salt', iv: 'iv' });
const rows = [row('attach_0001'), row('attach_0002', 'bob'), row('attach_0003')];
const bodies = {
  attach_0001: { text: 'arquivo um', media: { path: 'private/old1.bin', salt: 's1', iv: 'i1', type: 'image/png', name: 'um.png', size: 3 } },
  attach_0002: { text: 'recebido', media: { path: 'private/old2.bin', salt: 's2', iv: 'i2' } },
  attach_0003: { text: 'sem anexo', media: null }
};
let decryptedAttachments = 0;
let encryptedAttachments = 0;
let uploaded = [];
let persisted = [];
let cleaned = [];
const callbacks = {
  decryptLegacyMessage: async message => structuredClone(bodies[message.id]),
  decryptLegacyAttachment: async media => { decryptedAttachments++; return new Uint8Array([1, 2, 3]); },
  encryptV3Attachment: async ({ bytes, messageId, media }) => {
    encryptedAttachments++;
    return { cipher: new Uint8Array([9, 8, 7, 6]), envelope: { v: 3, purpose: 'attachment', messageId }, type: media.type, name: media.name, size: bytes.length };
  },
  uploadV3Attachment: async (id, data) => { const path = `private/${id}.v3.bin`; uploaded.push(path); return path; },
  encryptV3Message: async (body, messageId) => ({ v: 3, purpose: 'message', messageId, body }),
  persistV3Message: async (id, patch) => persisted.push({ id, patch }),
  cleanupUploadedAttachment: async path => cleaned.push(path)
};

const preview = await migrateOwnedV2Attachments({ messages: rows, ownerUid: 'alice', ...callbacks, dryRun: true });
assert.equal(preview.eligible, 1);
assert.equal(preview.migrated, 0);
assert.equal(decryptedAttachments, 0);
assert.equal(uploaded.length, 0);

const result = await migrateOwnedV2Attachments({ messages: rows, ownerUid: 'alice', ...callbacks });
assert.equal(result.migrated, 1);
assert.equal(result.failed, 0);
assert.equal(result.skipped, 2);
assert.equal(decryptedAttachments, 1);
assert.equal(encryptedAttachments, 1);
assert.equal(persisted.length, 1);
assert.equal(persisted[0].patch.v, 3);
assert.equal(persisted[0].patch.envelope.body.media.path, 'private/attach_0001.v3.bin');
assert.equal(persisted[0].patch.envelope.body.media.envelope.v, 3);
assert.equal(cleaned.length, 0, 'arquivo novo não é removido após persistência bem-sucedida');

let failedPersist = false;
const partial = await migrateOwnedV2Attachments({
  messages: [row('attach_0004')], ownerUid: 'alice',
  ...callbacks,
  decryptLegacyMessage: async () => ({ text: 'falha', media: { path: 'private/old4.bin', salt: 's4', iv: 'i4', type: 'image/png', name: 'quatro.png', size: 3 } }),
  uploadV3Attachment: async () => 'private/fail.v3.bin',
  persistV3Message: async () => { failedPersist = true; throw new Error('firestore offline'); },
  cleanupUploadedAttachment: async path => cleaned.push(path)
});
assert.equal(partial.failed, 1);
assert.equal(failedPersist, true);
assert.ok(cleaned.includes('private/fail.v3.bin'));
console.log('OK: migração de anexos V2→V3 com prévia, recifragem do arquivo e da mensagem, preservação do original e limpeza de upload órfão.');
