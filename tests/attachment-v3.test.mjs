import assert from 'node:assert/strict';
import { createAccountRootIdentity, createDeviceIdentity } from '../js/device-pairing.js';
import { encryptForDevices, decryptForDevice, envelopeCiphertextBytes, envelopeMetadata } from '../js/multidevice-envelope.js';

globalThis.btoa ||= value => Buffer.from(value, 'binary').toString('base64');
globalThis.atob ||= value => Buffer.from(value, 'base64').toString('binary');

const rootA = await createAccountRootIdentity();
const rootB = await createAccountRootIdentity();
const roots = { alice: rootA.publicKeyJwk, bob: rootB.publicKeyJwk };
const a1 = { uid: 'alice', ...await createDeviceIdentity('alice', rootA.privateKey) };
const a2 = { uid: 'alice', ...await createDeviceIdentity('alice', rootA.privateKey) };
const b1 = { uid: 'bob', ...await createDeviceIdentity('bob', rootB.privateKey) };
const b2 = { uid: 'bob', ...await createDeviceIdentity('bob', rootB.privateKey) };
const recipients = [a1, a2, b1, b2].map(d => ({ uid: d.uid, certificate: d.certificate }));
const original = new Uint8Array(256 * 1024 + 37);
for (let i = 0; i < original.length; i++) original[i] = (i * 31 + 7) % 256;

const full = await encryptForDevices({
  plaintext: original,
  messageId: 'attachment_test_123',
  purpose: 'attachment',
  senderDevice: a1,
  recipients,
  rootPublicKeys: roots
});
const storageBytes = envelopeCiphertextBytes(full);
const firestoreEnvelope = envelopeMetadata(full);
assert.equal(firestoreEnvelope.v, 3);
assert.equal(firestoreEnvelope.purpose, 'attachment');
assert.equal('ciphertext' in firestoreEnvelope, false, 'Firestore não deve receber os bytes do arquivo');
assert.ok(storageBytes.length > original.length, 'AES-GCM deve acrescentar a tag de autenticação');

for (const device of [a1, a2, b1, b2]) {
  const restored = await decryptForDevice({
    envelope: firestoreEnvelope,
    localDevice: device,
    rootPublicKeys: roots,
    ciphertextBytes: storageBytes
  });
  assert.deepEqual(restored, original);
}

const corrupted = storageBytes.slice();
corrupted[corrupted.length - 1] ^= 1;
await assert.rejects(decryptForDevice({
  envelope: firestoreEnvelope,
  localDevice: b2,
  rootPublicKeys: roots,
  ciphertextBytes: corrupted
}));

const outsiderRoot = await createAccountRootIdentity();
const outsider = { uid: 'outsider', ...await createDeviceIdentity('outsider', outsiderRoot.privateKey) };
await assert.rejects(decryptForDevice({
  envelope: firestoreEnvelope,
  localDevice: outsider,
  rootPublicKeys: { ...roots, outsider: outsiderRoot.publicKeyJwk },
  ciphertextBytes: storageBytes
}), /não possui envelope/);

console.log('OK: anexo V3 cifrado, envelope compacto, quatro instalações autorizadas, adulteração e dispositivo externo bloqueados.');
