import assert from 'node:assert/strict';
import { createAccountRootIdentity, createDeviceIdentity } from '../js/device-pairing.js';
import { createRootRotationBundle } from '../js/device-root-rotation.js';
import { synchronizeOfflineDeviceRoot } from '../js/device-root-rotation-sync.js';

const uid = 'offline-sync-user';
const root = await createAccountRootIdentity(); root.rootEpoch = 1;
const device = await createDeviceIdentity(uid, root.privateKey);
const bundle = await createRootRotationBundle({ uid, oldRootIdentity: root, activeCertificates: [device.certificate] });
const response = { uid, fromEpoch: 1, currentEpoch: 2, transitions: [{ uid, rootEpoch: 2, bundle: { transition: bundle.transition, certificates: bundle.certificates } }] };
const auth = { currentUser: { async getIdToken() { return 'token'; } } };
const fetchImpl = async (url, options) => {
  assert.match(url, /fromEpoch=1$/);
  assert.equal(options.headers.Authorization, 'Bearer token');
  return { ok: true, async json() { return response; } };
};
let applied = null;
const vault = {
  async loadAccountRoot() { return { publicKeyJwk: root.publicKeyJwk, rootEpoch: 1, privateKey: null }; },
  async loadLocalDevice() { return { privateKey: device.privateKey, certificate: device.certificate }; },
  async applyVerifiedPublicRootAndDeviceCertificate(id, deviceId, update) { applied = { id, deviceId, update }; }
};
const result = await synchronizeOfflineDeviceRoot({ uid, deviceId: device.deviceId, auth, endpoint: 'https://rotation.example', fetchImpl, vault });
assert.equal(result.status, 'synchronized');
assert.equal(result.rootEpoch, 2);
assert.equal(applied.update.certificate.rootEpoch, 2);

const authorityVault = { ...vault, async loadAccountRoot() { return { publicKeyJwk: root.publicKeyJwk, rootEpoch: 1, privateKey: {} }; }, async applyVerifiedPublicRootAndDeviceCertificate() { throw new Error('must not apply'); } };
const authority = await synchronizeOfflineDeviceRoot({ uid, deviceId: device.deviceId, auth, endpoint: 'https://rotation.example', fetchImpl, vault: authorityVault });
assert.equal(authority.status, 'authority-recovery-required');

const outsiderVault = { ...vault, async loadLocalDevice() { return { privateKey: device.privateKey, certificate: { ...device.certificate, deviceId: 'other-device' } }; } };
const outsider = await synchronizeOfflineDeviceRoot({ uid, deviceId: 'other-device', auth, endpoint: 'https://rotation.example', fetchImpl, vault: outsiderVault });
assert.equal(outsider.status, 'device-not-in-rotated-inventory');

const badFetch = async () => ({ ok: true, async json() { return { ...response, currentEpoch: 3 }; } });
const rejected = await synchronizeOfflineDeviceRoot({ uid, deviceId: device.deviceId, auth, endpoint: 'https://rotation.example', fetchImpl: badFetch, vault });
assert.equal(rejected.status, 'rejected');
assert.equal(rejected.reason, 'server-head-mismatch');
console.log('PASS: offline device chain fetch, validation-before-write, atomic public-only promotion, authority-device protection and inventory enforcement');
