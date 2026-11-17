import assert from 'node:assert/strict';
import { createAccountRootIdentity, createPairingOffer } from '../js/device-pairing.js';
import { qrSvg } from '../js/vendor/qrcode-render.js';

const root = await createAccountRootIdentity();
const { offer } = await createPairingOffer('test-account-uid', root.publicKeyJwk);
const payload = JSON.stringify({ type: 'criart-pairing', offer });
const svg = qrSvg(payload, 320);
assert.match(svg, /^<svg/);
assert.match(svg, /aria-label="QR Code de pareamento"/);
assert.ok(svg.includes('<path'));
assert.ok(payload.length < 1500, 'A oferta deve permanecer compacta para leitura pelo QR Code.');
console.log('PASS: QR Code local gerado a partir de oferta pública compacta.');
