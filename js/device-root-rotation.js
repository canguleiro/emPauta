/**
 * CrIArt — protocolo offline de rotação da autoridade raiz.
 * Não grava no Firestore nem substitui o cofre local. A aplicação deve
 * validar o bundle e obter confirmação explícita antes de qualquer commit.
 */
import {
  createAccountRootIdentity,
  verifyDeviceCertificate
} from './device-pairing.js';

const ROOT_ALG = { name: 'ECDSA', namedCurve: 'P-256' };
const encoder = new TextEncoder();

function cryptoApi() {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto API indisponível.');
  return globalThis.crypto;
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function b64u(bytes) {
  let raw = '';
  for (const byte of new Uint8Array(bytes)) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function unb64u(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}
async function fingerprint(publicKeyJwk) {
  const digest = await cryptoApi().subtle.digest('SHA-256', encoder.encode(canonical(publicKeyJwk)));
  return b64u(digest);
}
async function sign(privateKey, value) {
  return b64u(await cryptoApi().subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, privateKey, encoder.encode(canonical(value))
  ));
}
async function verify(publicKeyJwk, signature, value) {
  try {
    const key = await cryptoApi().subtle.importKey('jwk', publicKeyJwk, ROOT_ALG, false, ['verify']);
    return await cryptoApi().subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, key, unb64u(signature), encoder.encode(canonical(value))
    );
  } catch { return false; }
}
function assertRoot(identity, label) {
  if (!identity?.privateKey || !identity?.publicKeyJwk || identity.algorithm !== 'ECDSA-P256-SHA256') {
    throw new Error(`${label}: chave privada de autoridade indisponível.`);
  }
}

/**
 * Cria bundle de rotação sem tocar em Firestore/IndexedDB.
 * Cada certificado ativo é reemitido mantendo deviceId e chave ECDH.
 */
export async function createRootRotationBundle({ uid, oldRootIdentity, activeCertificates }) {
  if (!uid || typeof uid !== 'string') throw new Error('UID inválido para rotação.');
  assertRoot(oldRootIdentity, 'Raiz atual');
  if (!Array.isArray(activeCertificates) || activeCertificates.length < 1 || activeCertificates.length > 20) {
    throw new Error('A rotação exige entre 1 e 20 certificados ativos.');
  }
  const seen = new Set();
  for (const cert of activeCertificates) {
    if (!cert || cert.uid !== uid || !cert.deviceId || !cert.ecdhPublicKey || seen.has(cert.deviceId)) {
      throw new Error('Inventário de certificados inválido ou duplicado.');
    }
    seen.add(cert.deviceId);
    if (!(await verifyDeviceCertificate(cert, uid, oldRootIdentity.publicKeyJwk))) {
      throw new Error(`Certificado antigo inválido: ${cert.deviceId}.`);
    }
  }

  const newRootIdentity = await createAccountRootIdentity();
  const rootEpoch = Number.isSafeInteger(oldRootIdentity.rootEpoch) ? oldRootIdentity.rootEpoch + 1 : 2;
  const certificates = [];
  for (const oldCert of [...activeCertificates].sort((a, b) => a.deviceId.localeCompare(b.deviceId))) {
    const body = {
      version: oldCert.version,
      uid,
      deviceId: oldCert.deviceId,
      createdAt: Date.now(),
      ecdhPublicKey: oldCert.ecdhPublicKey,
      rootEpoch
    };
    certificates.push({ ...body, rootSignature: await sign(newRootIdentity.privateKey, body) });
  }

  const transitionBody = {
    protocol: 'criart-root-rotation-v1',
    uid,
    rootEpoch,
    previousRootFingerprint: await fingerprint(oldRootIdentity.publicKeyJwk),
    newRootPublicKeyJwk: newRootIdentity.publicKeyJwk,
    issuedAt: Date.now(),
    deviceIds: certificates.map(cert => cert.deviceId),
    certificatesDigest: b64u(await cryptoApi().subtle.digest('SHA-256', encoder.encode(canonical(certificates))))
  };
  const transition = {
    ...transitionBody,
    oldRootSignature: await sign(oldRootIdentity.privateKey, transitionBody),
    newRootSignature: await sign(newRootIdentity.privateKey, transitionBody)
  };
  return {
    transition,
    certificates,
    newRootIdentity,
    summary: {
      uid,
      rootEpoch,
      deviceCount: certificates.length,
      deviceIds: certificates.map(cert => cert.deviceId),
      previousRootFingerprint: transitionBody.previousRootFingerprint,
      newRootFingerprint: await fingerprint(newRootIdentity.publicKeyJwk)
    }
  };
}

/** Valida o encadeamento antigo→novo e exige correspondência exata do inventário. */
export async function verifyRootRotationBundle(bundle, expectedUid, trustedOldRootPublicKeyJwk) {
  try {
    const transition = bundle?.transition;
    const certificates = bundle?.certificates;
    if (!transition || !Array.isArray(certificates) || transition.protocol !== 'criart-root-rotation-v1' ||
        transition.uid !== expectedUid || !trustedOldRootPublicKeyJwk) return false;
    const { oldRootSignature, newRootSignature, ...body } = transition;
    if (body.previousRootFingerprint !== await fingerprint(trustedOldRootPublicKeyJwk)) return false;
    if (!(await verify(trustedOldRootPublicKeyJwk, oldRootSignature, body))) return false;
    if (!(await verify(body.newRootPublicKeyJwk, newRootSignature, body))) return false;
    const ids = certificates.map(cert => cert.deviceId).sort();
    if (canonical(ids) !== canonical([...body.deviceIds].sort()) || new Set(ids).size !== ids.length) return false;
    const digest = b64u(await cryptoApi().subtle.digest('SHA-256', encoder.encode(canonical(certificates))));
    if (digest !== body.certificatesDigest) return false;
    for (const cert of certificates) {
      if (cert.uid !== expectedUid || cert.rootEpoch !== body.rootEpoch ||
          !(await verifyDeviceCertificate(cert, expectedUid, body.newRootPublicKeyJwk))) return false;
    }
    return true;
  } catch { return false; }
}

export async function rootPublicFingerprint(publicKeyJwk) {
  return fingerprint(publicKeyJwk);
}
