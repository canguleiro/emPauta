import assert from 'node:assert/strict';
import { createAccountRootIdentity, createDeviceIdentity } from '../../js/device-pairing.js';
import { createRootRotationBundle } from '../../js/device-root-rotation.js';
import { validateRotationCommit, commitRootRotation, createHttpHandler } from '../../backend/root-rotation/rotation-service.mjs';

const uid = 'SntSaG8ImRg3pbjAmC6pGqESCLH3';
const oldRoot = await createAccountRootIdentity();
oldRoot.rootEpoch = 1;
const localDevices = await Promise.all([1, 2, 3].map(() => createDeviceIdentity(uid, oldRoot.privateKey)));
const bundle = await createRootRotationBundle({ uid, oldRootIdentity: oldRoot, activeCertificates: localDevices.map(d => d.certificate) });
const deviceRecords = Object.fromEntries(localDevices.map(d => [d.deviceId, {
  ownerUid: uid, deviceId: d.deviceId, certificate: d.certificate, state: 'active'
}]));
const rootRecord = { ownerUid: uid, algorithm: 'ECDSA-P256-SHA256', publicKeyJwk: oldRoot.publicKeyJwk, rootEpoch: 1 };

const valid = await validateRotationCommit({ uid, bundle, rootRecord, deviceRecords });
assert.equal(valid.valid, true);
assert.equal(valid.rootEpoch, 2);
assert.equal((await validateRotationCommit({ uid: 'other', bundle, rootRecord, deviceRecords })).reason, 'uid-or-protocol');
assert.equal((await validateRotationCommit({ uid, bundle, rootRecord: { ...rootRecord, rootEpoch: 2 }, deviceRecords })).reason, 'rollback-or-replay');
const incomplete = { ...deviceRecords };
delete incomplete[Object.keys(incomplete)[0]];
assert.equal((await validateRotationCommit({ uid, bundle, rootRecord, deviceRecords: incomplete })).reason, 'active-inventory-changed');
const revoked = structuredClone(deviceRecords);
revoked[Object.keys(revoked)[0]].state = 'revoked';
assert.equal((await validateRotationCommit({ uid, bundle, rootRecord, deviceRecords: revoked })).reason, 'active-inventory-changed');
const altered = structuredClone(bundle);
altered.certificates[0].ecdhPublicKey.x = 'tampered';
assert.equal((await validateRotationCommit({ uid, bundle: altered, rootRecord, deviceRecords })).reason, 'certificate-digest');

let committed = false;
const store = { async commit(commitUid, validateAndBuild) {
  assert.equal(commitUid, uid);
  const writes = await validateAndBuild({ root: rootRecord, devices: deviceRecords });
  committed = true;
  assert.equal(writes.root.rootEpoch, 2);
  assert.equal(Object.keys(writes.devices).length, 3);
  assert.equal(writes.transitionRecord.rootEpoch, 2);
  return { rootEpoch: writes.root.rootEpoch, newRootPublicKeyJwk: writes.root.publicKeyJwk };
}, async readChain(readUid, fromEpoch) { return { uid: readUid, fromEpoch, currentEpoch: 2, transitions: [{ rootEpoch: 2 }] }; } };
const result = await commitRootRotation({ uid, bundle, store });
assert.equal(result.rootEpoch, 2);
assert.equal(committed, true);

const handler = createHttpHandler({ auth: { async verifyIdToken(token) { if (token !== 'valid') throw new Error('bad token'); return { uid }; } }, store, allowedUids: [uid, 'tWliIiH06KhVgEg4zqIZo5IeLyZ2'] });
async function request({ authorization = 'Bearer valid', body = { bundle }, method = 'POST', url = '/v1/root-rotations/commit' } = {}) {
  const chunks = [Buffer.from(JSON.stringify(body))];
  const req = { method, url, headers: { authorization }, async *[Symbol.asyncIterator]() { yield* chunks; } };
  let status; let response;
  const res = { writeHead(code) { status = code; }, end(value) { response = JSON.parse(value); } };
  await handler(req, res);
  return { status, response };
}
assert.equal((await request()).status, 200);
assert.equal((await request({ authorization: 'Bearer invalid' })).status, 401);
const deniedHandler = createHttpHandler({ auth: { async verifyIdToken() { return { uid: 'outsider' }; } }, store, allowedUids: [uid] });
const deniedRes = { writeHead(code) { this.status = code; }, end() {} };
await deniedHandler({ method: 'POST', url: '/v1/root-rotations/commit', headers: { authorization: 'Bearer valid' }, async *[Symbol.asyncIterator]() { yield Buffer.from('{}'); } }, deniedRes);
assert.equal(deniedRes.status, 403);
assert.equal((await request({ body: {} })).status, 400);
assert.equal((await request({ method: 'GET' })).status, 404);
const chainReq = { method: 'GET', url: '/v1/root-rotations/chain?fromEpoch=1', headers: { authorization: 'Bearer valid' }, async *[Symbol.asyncIterator]() {} };
let chainStatus; let chainBody;
await handler(chainReq, { writeHead(code) { chainStatus = code; }, end(value) { chainBody = JSON.parse(value); } });
assert.equal(chainStatus, 200); assert.equal(chainBody.currentEpoch, 2);
const badChainReq = { ...chainReq, url: '/v1/root-rotations/chain?fromEpoch=0' };
await handler(badChainReq, { writeHead(code) { chainStatus = code; }, end(value) { chainBody = JSON.parse(value); } });
assert.equal(chainStatus, 400);
console.log('PASS: backend rotation validation, exact active inventory, replay protection, tamper rejection, atomic commit contract and authenticated HTTP endpoint');
