import assert from 'node:assert/strict';
import { createAccountRootIdentity, createDeviceIdentity } from '../js/device-pairing.js';
import { encryptJsonForDevices, decryptJsonForDevice } from '../js/multidevice-envelope.js';

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
const value = { text: 'Mensagem de teste multi-dispositivo', reply: null, media: null, createdAtMs: 1760000000000 };
const envelope = await encryptJsonForDevices({
  value, messageId: 'msg_test_12345678', senderDevice: a1, recipients, rootPublicKeys: roots
});
assert.equal(envelope.v, 3);
assert.equal(envelope.wraps.length, 4);
for (const device of [a1, a2, b1, b2]) {
  const decoded = await decryptJsonForDevice({ envelope, localDevice: device, rootPublicKeys: roots });
  assert.deepEqual(decoded, value);
}

const outsiderRoot = await createAccountRootIdentity();
const outsider = { uid: 'outsider', ...await createDeviceIdentity('outsider', outsiderRoot.privateKey) };
await assert.rejects(
  decryptJsonForDevice({ envelope, localDevice: outsider, rootPublicKeys: { ...roots, outsider: outsiderRoot.publicKeyJwk } }),
  /não possui envelope/
);

const altered = structuredClone(envelope);
altered.wraps[0].wrappedKey = (altered.wraps[0].wrappedKey.startsWith('A') ? 'B' : 'A') + altered.wraps[0].wrappedKey.slice(1);
await assert.rejects(decryptJsonForDevice({ envelope: altered, localDevice: a1, rootPublicKeys: roots }));

const forged = structuredClone(envelope);
forged.senderCertificate.rootSignature = (forged.senderCertificate.rootSignature.startsWith('A') ? 'B' : 'A') + forged.senderCertificate.rootSignature.slice(1);
await assert.rejects(decryptJsonForDevice({ envelope: forged, localDevice: b1, rootPublicKeys: roots }), /Certificado do remetente/);

const missingSelf = await assert.rejects(encryptJsonForDevices({
  value, messageId: 'msg_test_87654321', senderDevice: a1,
  recipients: [a2, b1], rootPublicKeys: roots
}), /remetente precisa receber/);
assert.equal(missingSelf, undefined);

console.log('OK: V3 entrega conteúdo a quatro instalações, bloqueia dispositivo não listado e rejeita adulteração/certificado falso.');
