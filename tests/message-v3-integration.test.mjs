import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const management = await readFile(new URL('../js/device-management.js', import.meta.url), 'utf8');
const rules = await readFile(new URL('../firebase/firestore.rules', import.meta.url), 'utf8');

assert.match(app, /encryptJsonForDevices/);
assert.match(app, /decryptJsonForDevice/);
assert.match(app, /await encryptMessageV3\(body, id, other\)/);
assert.match(app, /d\.v === 3[\s\S]*?decryptMessageV3\(d\.envelope\)/);
assert.match(app, /: await decryptObject\(d,/); // V2 compatibility path
assert.match(app, /purpose: "attachment"/);
assert.match(app, /envelopeCiphertextBytes/);
assert.match(app, /ciphertextBytes: new Uint8Array\(cipher\)/);
assert.match(app, /Compatibilidade: anexos V2 antigos/);
assert.doesNotMatch(app, /Nenhum arquivo foi enviado/);
assert.match(management, /export async function loadAuthorizedDeviceInventory/);
assert.match(management, /export async function loadPinnedDeviceRoot/);
assert.match(rules, /request\.resource\.data\.envelope\.v == 3/);
assert.match(rules, /request\.resource\.data\.v == 2/);
console.log('OK: integração V3 no app, fallback V2, inventário e regras locais conferidos.');
