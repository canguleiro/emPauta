import assert from 'node:assert/strict';
import { createAccountRootIdentity, createDeviceIdentity } from '../js/device-pairing.js';
import { createRootRotationBundle } from '../js/device-root-rotation.js';
import { commitRootRotation, createHttpHandler } from '../backend/root-rotation/rotation-service.mjs';
import { synchronizeOfflineDeviceRoot } from '../js/device-root-rotation-sync.js';

// Simula duas contas independentes, três aparelhos e um deles offline durante a rotação.
const uidA = 'rotation-e2e-account-a';
const uidB = 'rotation-e2e-account-b';
const auth = { currentUser: { async getIdToken() { return 'test-token'; } } };

function createMemoryStore() {
  const roots = new Map();
  const devices = new Map();
  const transitions = new Map();
  return {
    roots, devices, transitions,
    async commit(uid, build) {
      const root = roots.get(uid);
      const inventory = devices.get(uid);
      const writes = await build({ root, devices: inventory });
      // Mesmo commit lógico: raiz, certificados e transição avançam juntos.
      roots.set(uid, writes.root);
      devices.set(uid, writes.devices);
      transitions.set(uid, [...(transitions.get(uid) || []), writes.transitionRecord]);
      return { rootEpoch: writes.root.rootEpoch, newRootPublicKeyJwk: writes.root.publicKeyJwk };
    },
    async readChain(uid, fromEpoch) {
      const list = (transitions.get(uid) || []).filter(item => item.rootEpoch > fromEpoch);
      return { uid, fromEpoch, currentEpoch: roots.get(uid)?.rootEpoch || 1, transitions: list };
    }
  };
}

const store = createMemoryStore();
const accounts = new Map();
for (const uid of [uidA, uidB]) {
  const root = await createAccountRootIdentity(); root.rootEpoch = 1;
  const devices = await Promise.all([1, 2, 3].map(() => createDeviceIdentity(uid, root.privateKey)));
  const records = Object.fromEntries(devices.map(d => [d.deviceId, { ownerUid: uid, deviceId: d.deviceId, certificate: d.certificate, state: 'active' }]));
  store.roots.set(uid, { ownerUid: uid, algorithm: 'ECDSA-P256-SHA256', publicKeyJwk: root.publicKeyJwk, rootEpoch: 1 });
  store.devices.set(uid, records);
  accounts.set(uid, { root, devices });
}

const authVerifier = { async verifyIdToken(token) { if (token !== 'test-token') throw new Error('invalid token'); return { uid: uidA }; } };
const handler = createHttpHandler({ auth: authVerifier, store, allowedUids: [uidA, uidB] });
async function invokeHandler(method, url, body) {
  const req = { method, url, headers: { authorization: 'Bearer test-token' }, async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)); } };
  let status = 0, payload;
  await handler(req, { writeHead(code) { status = code; }, end(value) { payload = JSON.parse(value); } });
  return { status, payload };
}

// Gera e efetiva rotação para a conta A com inventário exato.
const a = accounts.get(uidA);
const bundleA = await createRootRotationBundle({ uid: uidA, oldRootIdentity: a.root, activeCertificates: a.devices.map(d => d.certificate) });
const committed = await commitRootRotation({ uid: uidA, bundle: bundleA, store });
assert.equal(committed.rootEpoch, 2);
assert.equal(store.transitions.get(uidA).length, 1);
assert.equal(store.roots.get(uidB).rootEpoch, 1, 'a rotação da conta A não pode alterar a conta B');

// Adaptador HTTP simulado liga o cliente offline ao mesmo handler autenticado.
const fetchImpl = async (url, options) => {
  const parsed = new URL(url);
  const body = options.body ? JSON.parse(options.body) : undefined;
  const result = await invokeHandler(options.method || 'GET', parsed.pathname + parsed.search, body);
  return { ok: result.status >= 200 && result.status < 300, status: result.status, async json() { return result.payload; } };
};

// Aparelho 2 esteve offline: valida a transição assinada e atualiza somente a âncora pública/certificado.
const offlineDevice = a.devices[1];
let localApplied = null;
const offlineVault = {
  async loadAccountRoot() { return { publicKeyJwk: a.root.publicKeyJwk, rootEpoch: 1, privateKey: null }; },
  async loadLocalDevice() { return { privateKey: offlineDevice.privateKey, certificate: offlineDevice.certificate }; },
  async applyVerifiedPublicRootAndDeviceCertificate(uid, deviceId, update) { localApplied = { uid, deviceId, update }; }
};
const synced = await synchronizeOfflineDeviceRoot({ uid: uidA, deviceId: offlineDevice.deviceId, auth, endpoint: 'https://rotation.test', fetchImpl, vault: offlineVault });
assert.equal(synced.status, 'synchronized');
assert.equal(synced.rootEpoch, 2);
assert.equal(localApplied.update.certificate.rootEpoch, 2);
assert.equal(localApplied.update.nextRootEpoch, 2);

// Um aparelho que conserva autoridade privada não promove a raiz automaticamente.
const authorityVault = { ...offlineVault, async loadAccountRoot() { return { publicKeyJwk: a.root.publicKeyJwk, rootEpoch: 1, privateKey: a.root.privateKey }; }, async applyVerifiedPublicRootAndDeviceCertificate() { throw new Error('unsafe promotion'); } };
const authority = await synchronizeOfflineDeviceRoot({ uid: uidA, deviceId: offlineDevice.deviceId, auth, endpoint: 'https://rotation.test', fetchImpl, vault: authorityVault });
assert.equal(authority.status, 'authority-recovery-required');

// A ausência no inventário impede atualização, mesmo que a cadeia seja válida.
const outsider = await synchronizeOfflineDeviceRoot({ uid: uidA, deviceId: 'unlisted-device', auth, endpoint: 'https://rotation.test', fetchImpl, vault: { ...offlineVault, async loadLocalDevice() { return { privateKey: offlineDevice.privateKey, certificate: offlineDevice.certificate }; } } });
assert.equal(outsider.status, 'device-not-in-rotated-inventory');

// Resposta autenticada é vinculada ao UID do token; conta B não recebe a cadeia A.
const chainB = await invokeHandler('GET', '/v1/root-rotations/chain?fromEpoch=1');
assert.equal(chainB.status, 200);
assert.equal(chainB.payload.uid, uidA);
assert.equal(chainB.payload.currentEpoch, 2);
assert.equal(store.roots.get(uidB).rootEpoch, 1);
console.log('PASS: end-to-end rotation commit, authenticated chain retrieval, offline device synchronization, authority protection, inventory enforcement and account isolation');
