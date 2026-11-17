import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { hardenEcdsaPrivateKey } from '../js/crypto-key-hardening.js';

const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicKeyJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
const result = await hardenEcdsaPrivateKey({ privateKey: pair.privateKey, publicKeyJwk, binding: 'test-account' });
assert.equal(result.changed, true);
assert.equal(result.privateKey.extractable, false);
const challenge = new TextEncoder().encode('same-key-proof');
const signature = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, result.privateKey, challenge);
assert.equal(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, signature, challenge), true);
const unchanged = await hardenEcdsaPrivateKey({ privateKey: result.privateKey, publicKeyJwk, binding: 'test-account' });
assert.equal(unchanged.changed, false);
const other = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const wrongPublic = await webcrypto.subtle.exportKey('jwk', other.publicKey);
await assert.rejects(() => hardenEcdsaPrivateKey({ privateKey: pair.privateKey, publicKeyJwk: wrongPublic, binding: 'test-account' }), /não corresponde/);
console.log('PASS: legacy ECDSA root key hardening preserves key identity, proves public/private match and disables future export');
