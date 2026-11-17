/**
 * CrIArt — protocolo criptográfico de pareamento (sem backend/Cloud Functions).
 * Web Crypto API. O transporte Firestore é responsabilidade da camada de aplicação.
 * Não aceitar certificados sem verificar a assinatura da identidade raiz.
 */
const PAIRING_VERSION = 1;
const ROOT_ALG = { name: 'ECDSA', namedCurve: 'P-256' };
const DEVICE_ALG = { name: 'ECDH', namedCurve: 'P-256' };
const encoder = new TextEncoder();

function cryptoApi() {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto API indisponível. Use HTTPS.');
  return globalThis.crypto;
}
function b64u(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function unb64u(s) {
  const normalized = s.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function randomId(bytes = 18) {
  return b64u(cryptoApi().getRandomValues(new Uint8Array(bytes)));
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
async function digest(bytes) {
  return new Uint8Array(await cryptoApi().subtle.digest('SHA-256', bytes));
}
async function derivePairingAes(privateKey, peerPublicJwk, salt, info) {
  const peer = await cryptoApi().subtle.importKey('jwk', peerPublicJwk, DEVICE_ALG, false, []);
  const bits = await cryptoApi().subtle.deriveBits({ name: 'ECDH', public: peer }, privateKey, 256);
  const base = await cryptoApi().subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return cryptoApi().subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(info) },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
async function signRoot(rootPrivateKey, value) {
  return b64u(await cryptoApi().subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, rootPrivateKey, encoder.encode(canonical(value))
  ));
}
export async function createAccountRootIdentity() {
  // A chave privada raiz é importada novamente como não exportável. A cópia
  // PKCS#8 existe apenas durante a criação e é sobrescrita após a importação.
  const pair = await cryptoApi().subtle.generateKey(ROOT_ALG, true, ['sign', 'verify']);
  const publicKeyJwk = await cryptoApi().subtle.exportKey('jwk', pair.publicKey);
  const pkcs8 = new Uint8Array(await cryptoApi().subtle.exportKey('pkcs8', pair.privateKey));
  let privateKey;
  try {
    privateKey = await cryptoApi().subtle.importKey('pkcs8', pkcs8, ROOT_ALG, false, ['sign']);
  } finally {
    pkcs8.fill(0);
  }
  return {
    privateKey,
    publicKeyJwk,
    algorithm: 'ECDSA-P256-SHA256',
    version: PAIRING_VERSION
  };
}
export async function createDeviceIdentity(uid, rootPrivateKey) {
  if (!uid || !rootPrivateKey) throw new Error('UID e chave privada raiz são obrigatórios.');
  const pair = await cryptoApi().subtle.generateKey(DEVICE_ALG, true, ['deriveBits']);
  const publicKey = await cryptoApi().subtle.exportKey('jwk', pair.publicKey);
  const privateJwk = await cryptoApi().subtle.exportKey('jwk', pair.privateKey);
  const privateKey = await cryptoApi().subtle.importKey('jwk', privateJwk, DEVICE_ALG, false, ['deriveBits']);
  const body = {
    version: PAIRING_VERSION,
    uid,
    deviceId: randomId(),
    createdAt: Date.now(),
    ecdhPublicKey: publicKey
  };
  return {
    deviceId: body.deviceId,
    privateKey,
    certificate: { ...body, rootSignature: await signRoot(rootPrivateKey, body) }
  };
}
export async function verifyDeviceCertificate(certificate, expectedUid, rootPublicKeyJwk) {
  if (!certificate || certificate.version !== PAIRING_VERSION || certificate.uid !== expectedUid) return false;
  const { rootSignature, ...body } = certificate;
  try {
    const key = await cryptoApi().subtle.importKey('jwk', rootPublicKeyJwk, ROOT_ALG, false, ['verify']);
    return await cryptoApi().subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, key, unb64u(rootSignature), encoder.encode(canonical(body))
    );
  } catch { return false; }
}
export async function createPairingOffer(uid, rootPublicKeyJwk, ttlMs = 180000) {
  if (!uid || !rootPublicKeyJwk) throw new Error('UID e chave pública raiz são obrigatórios.');
  const pair = await cryptoApi().subtle.generateKey(DEVICE_ALG, true, ['deriveBits']);
  const challenge = cryptoApi().getRandomValues(new Uint8Array(32));
  const offer = {
    version: PAIRING_VERSION,
    uid,
    sessionId: randomId(),
    hostEphemeralPublicKey: await cryptoApi().subtle.exportKey('jwk', pair.publicKey),
    rootPublicKeyJwk,
    challenge: b64u(challenge),
    createdAt: Date.now(),
    expiresAt: Date.now() + Math.min(Math.max(ttlMs, 30000), 300000)
  };
  return { offer, privateKey: pair.privateKey };
}
async function pairingCode(secret, challenge) {
  const hash = await digest(new Uint8Array([...new Uint8Array(secret), ...unb64u(challenge)]));
  const n = ((hash[0] << 16) | (hash[1] << 8) | hash[2]) % 1000000;
  return String(n).padStart(6, '0');
}
export async function acceptPairingOffer(offer, expectedUid) {
  if (!offer || offer.version !== PAIRING_VERSION || offer.expiresAt <= Date.now()) throw new Error('QR Code inválido ou expirado.');
  if (!expectedUid || offer.uid !== expectedUid) throw new Error('O QR Code pertence a outra conta.');
  if (!offer.sessionId || !offer.challenge || !offer.hostEphemeralPublicKey || !offer.rootPublicKeyJwk) throw new Error('Oferta de pareamento incompleta.');
  const pair = await cryptoApi().subtle.generateKey(DEVICE_ALG, true, ['deriveBits']);
  const publicKey = await cryptoApi().subtle.exportKey('jwk', pair.publicKey);
  const hostPub = await cryptoApi().subtle.importKey('jwk', offer.hostEphemeralPublicKey, DEVICE_ALG, false, []);
  const secret = await cryptoApi().subtle.deriveBits({ name: 'ECDH', public: hostPub }, pair.privateKey, 256);
  const request = {
    version: PAIRING_VERSION,
    uid: offer.uid,
    sessionId: offer.sessionId,
    clientEphemeralPublicKey: publicKey,
    deviceId: randomId(),
    createdAt: Date.now()
  };
  const devicePair = await cryptoApi().subtle.generateKey(DEVICE_ALG, true, ['deriveBits']);
  request.clientDevicePublicKey = await cryptoApi().subtle.exportKey('jwk', devicePair.publicKey);
  const devicePrivateJwk = await cryptoApi().subtle.exportKey('jwk', devicePair.privateKey);
  const devicePrivateKey = await cryptoApi().subtle.importKey('jwk', devicePrivateJwk, DEVICE_ALG, false, ['deriveBits']);
  return {
    request,
    verificationCode: await pairingCode(secret, offer.challenge),
    context: { secret: new Uint8Array(secret), offer, ephemeralPrivateKey: pair.privateKey, devicePrivateKey, devicePublicKey: request.clientDevicePublicKey }
  };
}
export async function completePairingHost(offerState, request, rootIdentity) {
  const { offer, privateKey } = offerState;
  if (!offer || !request || !rootIdentity?.privateKey || !rootIdentity?.publicKeyJwk) throw new Error('Dados de pareamento incompletos.');
  if (offer.expiresAt <= Date.now() || request.sessionId !== offer.sessionId || request.uid !== offer.uid) throw new Error('Solicitação de pareamento inválida ou expirada.');
  if (!request.deviceId || !request.clientEphemeralPublicKey || !request.clientDevicePublicKey) throw new Error('Solicitação de dispositivo incompleta.');
  if (canonical(rootIdentity.publicKeyJwk) !== canonical(offer.rootPublicKeyJwk)) throw new Error('A identidade raiz local não corresponde à identidade anunciada no QR Code.');
  const secret = await cryptoApi().subtle.deriveBits(
    { name: 'ECDH', public: await cryptoApi().subtle.importKey('jwk', request.clientEphemeralPublicKey, DEVICE_ALG, false, []) },
    privateKey, 256
  );
  const code = await pairingCode(secret, offer.challenge);
  const deviceBody = {
    version: PAIRING_VERSION,
    uid: offer.uid,
    deviceId: request.deviceId,
    createdAt: Date.now(),
    ecdhPublicKey: request.clientDevicePublicKey
  };
  const certificate = { ...deviceBody, rootSignature: await signRoot(rootIdentity.privateKey, deviceBody) };
  const salt = cryptoApi().getRandomValues(new Uint8Array(16));
  const iv = cryptoApi().getRandomValues(new Uint8Array(12));
  const key = await derivePairingAes(privateKey, request.clientEphemeralPublicKey, salt, `CrIArt-pairing-v1:${offer.sessionId}`);
  // A chave privada raiz NUNCA é transferida ao novo aparelho.
  // O host assina o certificado; o cliente recebe apenas o certificado e
  // a chave pública raiz já fixada no QR Code.
  const payload = encoder.encode(JSON.stringify({ payloadVersion: 2, certificate }));
  const ciphertext = await cryptoApi().subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(`${offer.uid}:${offer.sessionId}`) }, key, payload);
  return { verificationCode: code, response: { version: PAIRING_VERSION, uid: offer.uid, sessionId: offer.sessionId, salt: b64u(salt), iv: b64u(iv), ciphertext: b64u(ciphertext), certificate } };
}
export async function finishPairingClient(context, response, expectedVerificationCode) {
  const { offer, devicePrivateKey, devicePublicKey } = context;
  if (response.uid !== offer.uid || response.sessionId !== offer.sessionId || response.version !== PAIRING_VERSION) throw new Error('Resposta de pareamento não corresponde à sessão.');
  const actualCode = await pairingCode(context.secret, offer.challenge);
  if (actualCode !== expectedVerificationCode) throw new Error('Código de segurança divergente. Pareamento cancelado.');
  const key = await derivePairingAes(
    // Derive from the client's ephemeral private key, not the device's long-term key.
    context.ephemeralPrivateKey,
    offer.hostEphemeralPublicKey,
    unb64u(response.salt),
    `CrIArt-pairing-v1:${offer.sessionId}`
  );
  const plain = await cryptoApi().subtle.decrypt(
    { name: 'AES-GCM', iv: unb64u(response.iv), additionalData: encoder.encode(`${offer.uid}:${offer.sessionId}`) },
    key, unb64u(response.ciphertext)
  );
  const payload = JSON.parse(new TextDecoder().decode(plain));
  if (payload?.payloadVersion !== 2 || payload.rootPrivateKeyPkcs8) {
    throw new Error('Resposta de pareamento insegura ou incompatível: a chave privada raiz não pode ser transferida.');
  }
  const valid = await verifyDeviceCertificate(payload.certificate, offer.uid, offer.rootPublicKeyJwk);
  if (!valid || payload.certificate.ecdhPublicKey.x !== devicePublicKey.x || payload.certificate.ecdhPublicKey.y !== devicePublicKey.y) {
    throw new Error('Certificado ou identidade raiz do dispositivo inválido.');
  }
  return { rootPublicKeyJwk: offer.rootPublicKeyJwk, devicePrivateKey, certificate: payload.certificate };
}
export const pairingProtocolVersion = PAIRING_VERSION;
