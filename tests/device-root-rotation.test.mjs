import assert from 'node:assert/strict';
import { createAccountRootIdentity, createDeviceIdentity, verifyDeviceCertificate } from '../js/device-pairing.js';
import { createRootRotationBundle, verifyRootRotationBundle } from '../js/device-root-rotation.js';

const uid = 'SntSaG8ImRg3pbjAmC6pGqESCLH3';
const oldRoot = await createAccountRootIdentity();
const devices = await Promise.all([1, 2, 3, 4].map(() => createDeviceIdentity(uid, oldRoot.privateKey)));
const bundle = await createRootRotationBundle({
  uid,
  oldRootIdentity: oldRoot,
  activeCertificates: devices.map(device => device.certificate)
});
assert.equal(bundle.certificates.length, 4);
assert.equal(await verifyRootRotationBundle(bundle, uid, oldRoot.publicKeyJwk), true);
for (const cert of bundle.certificates) {
  assert.equal(await verifyDeviceCertificate(cert, uid, bundle.newRootIdentity.publicKeyJwk), true);
  assert.equal(devices.some(device => device.deviceId === cert.deviceId), true);
}
assert.equal(await verifyRootRotationBundle(bundle, 'other-uid', oldRoot.publicKeyJwk), false);
const forgedTransition = structuredClone(bundle);
forgedTransition.transition.newRootPublicKeyJwk.x = 'forged';
assert.equal(await verifyRootRotationBundle(forgedTransition, uid, oldRoot.publicKeyJwk), false);
const missingDevice = structuredClone(bundle);
missingDevice.certificates.pop();
assert.equal(await verifyRootRotationBundle(missingDevice, uid, oldRoot.publicKeyJwk), false);
const forgedCertificate = structuredClone(bundle);
forgedCertificate.certificates[0].deviceId = 'forged-device';
assert.equal(await verifyRootRotationBundle(forgedCertificate, uid, oldRoot.publicKeyJwk), false);
const wrongOldRoot = await createAccountRootIdentity();
assert.equal(await verifyRootRotationBundle(bundle, uid, wrongOldRoot.publicKeyJwk), false);
await assert.rejects(() => createRootRotationBundle({ uid, oldRootIdentity: oldRoot, activeCertificates: [] }), /entre 1 e 20/);
await assert.rejects(() => createRootRotationBundle({ uid, oldRootIdentity: oldRoot, activeCertificates: [devices[0].certificate, devices[0].certificate] }), /duplicado/);
console.log('PASS: root rotation dual-signature, device certificate reissue, exact inventory binding, tamper rejection, UID binding and old-root continuity');
