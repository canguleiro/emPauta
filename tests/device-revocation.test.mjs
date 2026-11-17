import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertDeviceRevocationAllowed } from '../js/device-revocation-policy.js';

assert.equal(assertDeviceRevocationAllowed({ activeDeviceIds: ['a', 'b'], currentDeviceId: 'a', targetDeviceId: 'b' }), true);
assert.throws(() => assertDeviceRevocationAllowed({ activeDeviceIds: ['a'], currentDeviceId: 'a', targetDeviceId: 'a' }), /não é permitido revogar o aparelho em uso/i);
assert.throws(() => assertDeviceRevocationAllowed({ activeDeviceIds: ['a'], currentDeviceId: 'a', targetDeviceId: 'b' }), /não está ativo/i);
assert.throws(() => assertDeviceRevocationAllowed({ activeDeviceIds: ['a', 'b'], currentDeviceId: 'a', targetDeviceId: 'a' }), /aparelho em uso/i);
assert.throws(() => assertDeviceRevocationAllowed({ activeDeviceIds: ['a'], currentDeviceId: 'a', targetDeviceId: 'a' }), /aparelho em uso/i);
assert.throws(() => assertDeviceRevocationAllowed({ activeDeviceIds: ['a', 'b'], currentDeviceId: 'x', targetDeviceId: 'b' }), /este aparelho não está ativo/i);

const management = await readFile(new URL('../js/device-management.js', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const rules = await readFile(new URL('../firebase/firestore.rules', import.meta.url), 'utf8');
assert.match(management, /export async function revokeAuthorizedDevice/);
assert.match(management, /transaction\.get\(devicesRef\)/);
assert.match(management, /state: 'revoked'/);
assert.match(management, /device-revoke-btn/);
assert.match(app, /refreshCurrentDeviceAuthorization/);
assert.match(app, /Date\.now\(\) - ownDeviceAuthorizationCheckedAt < 5000/);
assert.match(html, /revogação abaixo é cooperativa/);
assert.match(rules, /request\.resource\.data\.state == 'revoked'/);
assert.match(rules, /resource\.data\.state == 'active'/);
console.log('OK: bloqueio cooperativo impede auto-revogação/último aparelho, atualiza inventário e revalida sessão V3.');
