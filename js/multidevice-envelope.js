/**
 * CrIArt — envelopes criptográficos multi-dispositivo (V3).
 *
 * Cada conteúdo recebe uma chave AES-256-GCM aleatória. A chave de conteúdo
 * é encapsulada individualmente para cada dispositivo ativo usando ECDH
 * efêmero P-256 + HKDF-SHA-256 + AES-256-GCM. O certificado do remetente
 * acompanha cada envelope e deve ser validado contra a raiz fixada da conta.
 *
 * V2 permanece intocado. Este módulo é uma camada de protocolo isolada;
 * a integração no app só deve ocorrer depois de validar o inventário completo
 * de dispositivos e as regras do Firestore.
 *
 * Limite conhecido: não implementa Double Ratchet/forward secrecy histórico.
 */
import { verifyDeviceCertificate } from './device-pairing.js';

const VERSION = 3;
const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
const ROOT = { name: 'ECDSA', namedCurve: 'P-256' };
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function api() {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto indisponível.');
  return globalThis.crypto;
}
function bytes(n) { return api().getRandomValues(new Uint8Array(n)); }
function b64u(input) {
  const a = input instanceof Uint8Array ? input : new Uint8Array(input);
  let s = ''; for (const x of a) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function unb64u(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+$/.test(s)) throw new Error('Campo Base64URL inválido.');
  const raw = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
function assertIdentity(identity, label) {
  if (!identity?.uid || !identity?.deviceId || !identity?.privateKey || identity.certificate?.uid !== identity.uid || identity.certificate?.deviceId !== identity.deviceId) {
    throw new Error(`${label}: identidade de dispositivo incompleta.`);
  }
}
function assertMessageId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(id)) throw new Error('ID de mensagem inválido.');
}
function aadWrap({ messageId, purpose, senderUid, senderDeviceId, recipientUid, recipientDeviceId }) {
  return encoder.encode(canonical({ v: VERSION, messageId, purpose, senderUid, senderDeviceId, recipientUid, recipientDeviceId }));
}
async function deriveWrapKey(privateKey, peerJwk, salt, info) {
  const peer = await api().subtle.importKey('jwk', peerJwk, ECDH, false, []);
  const bits = await api().subtle.deriveBits({ name: 'ECDH', public: peer }, privateKey, 256);
  const base = await api().subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return api().subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(info) }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function validateDevice(device, roots) {
  if (!device?.uid || !device?.certificate || device.certificate.uid !== device.uid) throw new Error('Destinatário sem certificado válido.');
  const root = roots[device.uid];
  if (!root || !(await verifyDeviceCertificate(device.certificate, device.uid, root))) throw new Error(`Certificado não confiável para a conta ${device.uid}.`);
  if (!device.certificate.ecdhPublicKey || device.certificate.ecdhPublicKey.kty !== 'EC' || device.certificate.ecdhPublicKey.crv !== 'P-256') throw new Error('Chave pública de dispositivo incompatível.');
}

/** Cria envelope V3 para todos os dispositivos ativos indicados. */
export async function encryptForDevices({ plaintext, messageId, purpose = 'message', senderDevice, recipients, rootPublicKeys }) {
  assertMessageId(messageId);
  assertIdentity(senderDevice, 'Remetente');
  if (!['message', 'attachment'].includes(purpose)) throw new Error('Finalidade de envelope inválida.');
  if (!(plaintext instanceof Uint8Array) && !(plaintext instanceof ArrayBuffer)) throw new Error('O conteúdo deve ser Uint8Array ou ArrayBuffer.');
  if (!Array.isArray(recipients) || recipients.length < 1 || recipients.length > 32) throw new Error('Lista de dispositivos inválida.');
  const sender = { uid: senderDevice.uid, deviceId: senderDevice.deviceId, certificate: senderDevice.certificate };
  await validateDevice(sender, rootPublicKeys);
  const unique = new Map();
  for (const d of recipients) {
    await validateDevice(d, rootPublicKeys);
    unique.set(`${d.uid}:${d.certificate.deviceId}`, d);
  }
  const targets = [...unique.values()];
  if (!targets.some(d => d.uid === sender.uid && d.certificate.deviceId === sender.deviceId)) throw new Error('O dispositivo remetente precisa receber uma cópia para sincronização.');

  const contentKey = await api().subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const contentRaw = await api().subtle.exportKey('raw', contentKey);
  const contentIv = bytes(12);
  const contentAad = encoder.encode(canonical({ v: VERSION, messageId, purpose, senderUid: sender.uid, senderDeviceId: sender.deviceId }));
  const plainBytes = plaintext instanceof Uint8Array ? plaintext : new Uint8Array(plaintext);
  const ciphertext = await api().subtle.encrypt({ name: 'AES-GCM', iv: contentIv, additionalData: contentAad }, contentKey, plainBytes);

  const wraps = [];
  for (const target of targets) {
    const recipientDeviceId = target.certificate.deviceId;
    const ephemeral = await api().subtle.generateKey(ECDH, true, ['deriveBits']);
    const ephemeralPublicKey = await api().subtle.exportKey('jwk', ephemeral.publicKey);
    const salt = bytes(16);
    const iv = bytes(12);
    const info = `CrIArt-V3-wrap:${messageId}:${purpose}:${sender.uid}:${sender.deviceId}:${target.uid}:${recipientDeviceId}`;
    const key = await deriveWrapKey(ephemeral.privateKey, target.certificate.ecdhPublicKey, salt, info);
    const aad = aadWrap({ messageId, purpose, senderUid: sender.uid, senderDeviceId: sender.deviceId, recipientUid: target.uid, recipientDeviceId });
    const wrappedKey = await api().subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, contentRaw);
    wraps.push({
      recipientUid: target.uid,
      recipientDeviceId,
      ephemeralPublicKey,
      salt: b64u(salt), iv: b64u(iv), wrappedKey: b64u(wrappedKey)
    });
  }
  return {
    v: VERSION,
    algorithm: 'ECDH-P256-HKDF-SHA256+A256GCM',
    messageId, purpose,
    senderUid: sender.uid,
    senderDeviceId: sender.deviceId,
    senderCertificate: senderDevice.certificate,
    iv: b64u(contentIv),
    ciphertext: b64u(ciphertext),
    wraps
  };
}

/** Abre um envelope somente se houver wrapper destinado ao dispositivo local. */
export async function decryptForDevice({ envelope, localDevice, rootPublicKeys, ciphertextBytes = null }) {
  assertIdentity(localDevice, 'Dispositivo local');
  if (!envelope || envelope.v !== VERSION || !['message', 'attachment'].includes(envelope.purpose)) throw new Error('Envelope V3 incompatível.');
  assertMessageId(envelope.messageId);
  if (envelope.senderUid !== envelope.senderCertificate?.uid || envelope.senderDeviceId !== envelope.senderCertificate?.deviceId) throw new Error('Identidade do remetente inconsistente.');
  const senderRoot = rootPublicKeys[envelope.senderUid];
  if (!senderRoot || !(await verifyDeviceCertificate(envelope.senderCertificate, envelope.senderUid, senderRoot))) throw new Error('Certificado do remetente inválido ou não confiável.');
  const localRoot = rootPublicKeys[localDevice.uid];
  if (!localRoot || !(await verifyDeviceCertificate(localDevice.certificate, localDevice.uid, localRoot))) throw new Error('Certificado local inválido.');
  const wrap = envelope.wraps?.find(w => w.recipientUid === localDevice.uid && w.recipientDeviceId === localDevice.deviceId);
  if (!wrap) throw new Error('Esta mensagem não possui envelope para este dispositivo.');
  const info = `CrIArt-V3-wrap:${envelope.messageId}:${envelope.purpose}:${envelope.senderUid}:${envelope.senderDeviceId}:${localDevice.uid}:${localDevice.deviceId}`;
  const key = await deriveWrapKey(localDevice.privateKey, wrap.ephemeralPublicKey, unb64u(wrap.salt), info);
  const aad = aadWrap({ messageId: envelope.messageId, purpose: envelope.purpose, senderUid: envelope.senderUid, senderDeviceId: envelope.senderDeviceId, recipientUid: localDevice.uid, recipientDeviceId: localDevice.deviceId });
  const rawKey = await api().subtle.decrypt({ name: 'AES-GCM', iv: unb64u(wrap.iv), additionalData: aad }, key, unb64u(wrap.wrappedKey));
  const contentKey = await api().subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
  const contentAad = encoder.encode(canonical({ v: VERSION, messageId: envelope.messageId, purpose: envelope.purpose, senderUid: envelope.senderUid, senderDeviceId: envelope.senderDeviceId }));
  const encryptedContent = ciphertextBytes instanceof Uint8Array ? ciphertextBytes : unb64u(envelope.ciphertext);
  const plain = await api().subtle.decrypt({ name: 'AES-GCM', iv: unb64u(envelope.iv), additionalData: contentAad }, contentKey, encryptedContent);
  return new Uint8Array(plain);
}

export async function encryptJsonForDevices(options) {
  const bytes = encoder.encode(JSON.stringify(options.value));
  const envelope = await encryptForDevices({ ...options, plaintext: bytes, purpose: options.purpose || 'message' });
  return envelope;
}
export async function decryptJsonForDevice(options) {
  const bytes = await decryptForDevice(options);
  return JSON.parse(decoder.decode(bytes));
}
export const multiDeviceEnvelopeVersion = VERSION;

/** Extrai os bytes cifrados para armazenamento binário externo (Firebase Storage). */
export function envelopeCiphertextBytes(envelope) {
  if (!envelope || typeof envelope.ciphertext !== 'string') throw new Error('Ciphertext V3 ausente.');
  return unb64u(envelope.ciphertext);
}

/** Remove o ciphertext do envelope antes de persistir metadados no Firestore. */
export function envelopeMetadata(envelope) {
  if (!envelope || envelope.v !== VERSION) throw new Error('Envelope V3 inválido.');
  const { ciphertext, ...metadata } = envelope;
  return metadata;
}
