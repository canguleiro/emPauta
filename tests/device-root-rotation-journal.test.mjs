import assert from 'node:assert/strict';
import { createAccountRootIdentity, createDeviceIdentity } from '../js/device-pairing.js';
import { createRootRotationBundle } from '../js/device-root-rotation.js';
import { prepareRootRotationJournal, recoverRootRotationJournal, executeRootRotationCommit, resumePendingRootRotationCommit } from '../js/device-root-rotation-journal.js';

const uid = 'SntSaG8ImRg3pbjAmC6pGqESCLH3';
const oldRoot = await createAccountRootIdentity(); oldRoot.rootEpoch = 1;
const device = await createDeviceIdentity(uid, oldRoot.privateKey);
const bundle = await createRootRotationBundle({ uid, oldRootIdentity: oldRoot, activeCertificates: [device.certificate] });
function memoryAdapter() {
  let pending = null; let root = { ...oldRoot };
  return {
    async savePendingRootRotation(id, value) { assert.equal(id, uid); if (pending) { if (pending.serializedPackage === value.serializedPackage) return; throw new Error('pending-exists'); } pending = value; },
    async loadPendingRootRotation() { return pending; },
    async promotePendingRootRotation(id, remote) {
      assert.equal(id, uid);
      if (!pending || remote.remoteRootEpoch !== pending.rootEpoch || JSON.stringify(remote.remoteRootPublicKeyJwk) !== JSON.stringify(pending.newRootPublicKeyJwk)) throw new Error('remote-mismatch');
      if (root.rootEpoch !== pending.previousRootEpoch || JSON.stringify(root.publicKeyJwk) !== JSON.stringify(pending.oldRootPublicKeyJwk)) throw new Error('old-root-mismatch');
      root = { privateKey: pending.privateKey, publicKeyJwk: pending.newRootPublicKeyJwk, rootEpoch: pending.rootEpoch };
      pending = null;
    },
    snapshot() { return { pending, root }; }
  };
}

const adapter = memoryAdapter();
const prepared = await prepareRootRotationJournal({ uid, bundle, currentRoot: oldRoot, adapter });
assert.equal(prepared.rootEpoch, 2);
assert.ok(adapter.snapshot().pending.privateKey);
assert.equal(adapter.snapshot().root.rootEpoch, 1);
assert.equal((await recoverRootRotationJournal({ uid, remoteRoot: { rootEpoch: 1, publicKeyJwk: oldRoot.publicKeyJwk }, adapter })).status, 'awaiting-server-commit');
assert.equal((await recoverRootRotationJournal({ uid, remoteRoot: { rootEpoch: 9, publicKeyJwk: oldRoot.publicKeyJwk }, adapter })).status, 'conflict');
assert.equal((await recoverRootRotationJournal({ uid, remoteRoot: { rootEpoch: 2, publicKeyJwk: bundle.newRootIdentity.publicKeyJwk }, adapter })).status, 'promoted');
assert.equal(adapter.snapshot().pending, null);
assert.equal(adapter.snapshot().root.rootEpoch, 2);

const adapter2 = memoryAdapter();
const result = await executeRootRotationCommit({
  uid, auth: { currentUser: { async getIdToken() { return 'firebase-token'; } } },
  endpoint: 'https://rotation.example.test', bundle, currentRoot: oldRoot, adapter: adapter2,
  fetchImpl: async (url, options) => {
    assert.match(url, /v1\/root-rotations\/commit$/);
    assert.equal(options.headers.Authorization, 'Bearer firebase-token');
    return { ok: true, async json() { return { ok: true, rootEpoch: 2, rootPublicKeyJwk: bundle.newRootIdentity.publicKeyJwk }; } };
  }
});
assert.deepEqual(result, { committed: true, rootEpoch: 2 });
assert.equal(adapter2.snapshot().pending, null);

const adapter3 = memoryAdapter();
await assert.rejects(() => executeRootRotationCommit({
  uid, auth: { currentUser: { async getIdToken() { return 'token'; } } }, endpoint: 'https://rotation.example.test',
  bundle, currentRoot: oldRoot, adapter: adapter3,
  fetchImpl: async () => { throw new Error('network-down'); }
}), /network-down/);
assert.ok(adapter3.snapshot().pending, 'pending key must survive interrupted network operation');
console.log('PASS: durable rotation journal staging, crash recovery, remote-state matching, safe promotion and interrupted-commit preservation');


const adapter4 = memoryAdapter();
await assert.rejects(() => executeRootRotationCommit({
  uid, auth: { currentUser: { async getIdToken() { return 'token'; } } }, endpoint: 'https://rotation.example.test',
  bundle, currentRoot: oldRoot, adapter: adapter4, fetchImpl: async () => { throw new Error('offline'); }
}), /offline/);
const resumed = await resumePendingRootRotationCommit({
  uid, auth: { currentUser: { async getIdToken() { return 'token'; } } }, endpoint: 'https://rotation.example.test',
  remoteRoot: { rootEpoch: 1, publicKeyJwk: oldRoot.publicKeyJwk }, adapter: adapter4,
  fetchImpl: async () => ({ ok: true, async json() { return { ok: true, rootEpoch: 2, rootPublicKeyJwk: bundle.newRootIdentity.publicKeyJwk }; } })
});
assert.deepEqual(resumed, { status: 'promoted', rootEpoch: 2 });
assert.equal(adapter4.snapshot().pending, null);

const adapter5 = memoryAdapter();
await prepareRootRotationJournal({ uid, bundle, currentRoot: oldRoot, adapter: adapter5 });
const recoveredWithoutResend = await resumePendingRootRotationCommit({
  uid, auth: { currentUser: { async getIdToken() { return 'token'; } } }, endpoint: 'https://rotation.example.test',
  remoteRoot: { rootEpoch: 2, publicKeyJwk: bundle.newRootIdentity.publicKeyJwk }, adapter: adapter5,
  fetchImpl: async () => { throw new Error('must-not-resend'); }
});
assert.deepEqual(recoveredWithoutResend, { status: 'promoted', rootEpoch: 2 });
