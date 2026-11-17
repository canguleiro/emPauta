import assert from 'node:assert/strict';
import {
 createAccountRootIdentity, createPairingOffer, acceptPairingOffer,
 completePairingHost, finishPairingClient, verifyDeviceCertificate
} from '../js/device-pairing.js';

const uid='SntSaG8ImRg3pbjAmC6pGqESCLH3';
const otherUid='tWliIiH06KhVgEg4zqIZo5IeLyZ2';
const root=await createAccountRootIdentity();
assert.equal(root.privateKey.extractable,false,'account root private key must be non-extractable');
const offerState=await createPairingOffer(uid,root.publicKeyJwk);

await assert.rejects(() => acceptPairingOffer(offerState.offer, otherUid), /outra conta/);
const client=await acceptPairingOffer(offerState.offer, uid);
const host=await completePairingHost(offerState,client.request,root);
assert.equal(host.verificationCode,client.verificationCode);
const linked=await finishPairingClient(client.context,host.response,client.verificationCode);
assert.equal(linked.certificate.uid,uid);
assert.equal(linked.rootPublicKeyJwk.x,root.publicKeyJwk.x);
assert.equal('rootPrivateKey' in linked,false,'a chave privada raiz não pode ser transferida ao novo aparelho');
assert.equal(linked.certificate.deviceId,client.request.deviceId);
assert.equal(await verifyDeviceCertificate(linked.certificate,uid,root.publicKeyJwk),true);
assert.equal(await verifyDeviceCertificate(linked.certificate,otherUid,root.publicKeyJwk),false);

const forged={...linked.certificate,deviceId:'forged'};
assert.equal(await verifyDeviceCertificate(forged,uid,root.publicKeyJwk),false);
await assert.rejects(() => finishPairingClient(client.context,host.response,'000000'), /divergente/);

const wrongRoot=await createAccountRootIdentity();
await assert.rejects(() => completePairingHost(offerState,client.request,wrongRoot), /não corresponde/);

const expired={...offerState,offer:{...offerState.offer,expiresAt:Date.now()-1}};
await assert.rejects(() => completePairingHost(expired,client.request,root), /expirada/);

// O novo aparelho recebe apenas a raiz pública. A autoridade privada permanece no host.
console.log('PASS: UID binding, ECDH handshake, matching safety code, public-only root distribution, certificate signature, tamper rejection, wrong-code rejection, expiry rejection');
