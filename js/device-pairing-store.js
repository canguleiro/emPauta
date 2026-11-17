/**
 * CrIArt — transporte Firestore para sessões de pareamento.
 * Sem Cloud Functions. A confiança criptográfica continua sendo validada
 * localmente por device-pairing.js; este módulo apenas transporta envelopes.
 *
 * IMPORTANTE: Firestore Rules não validam assinaturas ECDSA nem distinguem
 * dois aparelhos autenticados com o mesmo UID. Nunca confie em um registro
 * apenas porque ele foi gravado aqui.
 */
import {
  collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp,
  setDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

const ROOM = 'private-room';
const MAX_TTL_MS = 5 * 60 * 1000;
const enc = new TextEncoder();

function assertUid(uid) {
  if (!uid || typeof uid !== 'string') throw new Error('UID inválido.');
}
function assertSessionId(id) {
  if (!id || typeof id !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(id)) {
    throw new Error('Identificador de sessão inválido.');
  }
}
function sessionRef(db, sessionId) {
  return doc(db, 'private', ROOM, 'pairingSessions', sessionId);
}
function deviceRef(db, uid, deviceId) {
  return doc(db, 'private', ROOM, 'devices', uid, 'items', deviceId);
}
function rootRef(db, uid) {
  return doc(db, 'private', ROOM, 'deviceRoots', uid);
}
function validateOffer(offer, uid) {
  assertUid(uid);
  if (!offer || offer.uid !== uid || offer.version !== 1) throw new Error('Oferta incompatível com a conta autenticada.');
  assertSessionId(offer.sessionId);
  const now = Date.now();
  if (!Number.isFinite(offer.expiresAt) || offer.expiresAt <= now || offer.expiresAt > now + MAX_TTL_MS + 5000) {
    throw new Error('Prazo da oferta inválido.');
  }
}
function validateEnvelope(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} inválido.`);
  const json = JSON.stringify(value);
  if (enc.encode(json).length > 48 * 1024) throw new Error(`${name} excede o limite permitido.`);
}

/** Cria a sessão. O QR Code deve carregar somente offer, nunca a chave privada efêmera. */
export async function createPairingSession(db, uid, offer) {
  validateOffer(offer, uid);
  const ref = sessionRef(db, offer.sessionId);
  const existing = await getDoc(ref);
  if (existing.exists()) throw new Error('Colisão de sessão. Gere outra oferta.');
  const now = Date.now();
  const ttl = Math.min(offer.expiresAt, now + MAX_TTL_MS);
  await setDoc(ref, {
    ownerUid: uid,
    sessionId: offer.sessionId,
    version: offer.version,
    offer,
    request: null,
    response: null,
    state: 'offered',
    createdAt: serverTimestamp(),
    createdAtMs: now,
    expiresAt: new Date(ttl),
    expiresAtMs: ttl
  });
  return { sessionId: offer.sessionId, expiresAt: ttl };
}

/** Escuta uma sessão pertencente ao UID atual. A aplicação deve validar a oferta novamente. */
export function watchPairingSession(db, uid, sessionId, callback, onError) {
  assertUid(uid); assertSessionId(sessionId);
  return onSnapshot(sessionRef(db, sessionId), snap => {
    if (!snap.exists()) { callback(null); return; }
    const data = snap.data();
    if (data.ownerUid !== uid || data.sessionId !== sessionId) {
      onError?.(new Error('Sessão não pertence à conta autenticada.'));
      return;
    }
    if (!Number.isFinite(data.expiresAtMs) || data.expiresAtMs <= Date.now()) {
      onError?.(new Error('Sessão de pareamento expirada.'));
      return;
    }
    callback(data);
  }, error => onError?.(error));
}

/** O aparelho novo publica a solicitação uma única vez. */
export async function publishPairingRequest(db, uid, sessionId, request) {
  assertUid(uid); assertSessionId(sessionId); validateEnvelope(request, 'Solicitação');
  if (request.uid !== uid || request.sessionId !== sessionId || request.version !== 1) {
    throw new Error('Solicitação não corresponde à sessão autenticada.');
  }
  await runTransaction(db, async tx => {
    const ref = sessionRef(db, sessionId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Sessão inexistente.');
    const data = snap.data();
    if (data.ownerUid !== uid || data.state !== 'offered' || data.request || data.expiresAtMs <= Date.now()) {
      throw new Error('Sessão indisponível, expirada ou já utilizada.');
    }
    tx.update(ref, { request, state: 'requested', requestAt: serverTimestamp() });
  });
}

/** O aparelho existente publica a resposta cifrada após a confirmação humana do código. */
export async function publishPairingResponse(db, uid, sessionId, response) {
  assertUid(uid); assertSessionId(sessionId); validateEnvelope(response, 'Resposta');
  if (response.uid !== uid || response.sessionId !== sessionId || response.version !== 1) {
    throw new Error('Resposta não corresponde à sessão autenticada.');
  }
  await runTransaction(db, async tx => {
    const ref = sessionRef(db, sessionId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Sessão inexistente.');
    const data = snap.data();
    if (data.ownerUid !== uid || data.state !== 'requested' || !data.request || data.response || data.expiresAtMs <= Date.now()) {
      throw new Error('Sessão indisponível, expirada ou já respondida.');
    }
    tx.update(ref, { response, state: 'completed', responseAt: serverTimestamp() });
  });
}

/** Registra certificado público; consumidores DEVEM verificar a assinatura ECDSA antes de confiar. */
export async function publishDeviceCertificate(db, uid, certificate) {
  assertUid(uid);
  if (!certificate || certificate.uid !== uid || !certificate.deviceId || certificate.version !== 1) {
    throw new Error('Certificado de dispositivo inválido.');
  }
  validateEnvelope(certificate, 'Certificado');
  await setDoc(deviceRef(db, uid, certificate.deviceId), {
    ownerUid: uid,
    deviceId: certificate.deviceId,
    certificate,
    state: 'active',
    createdAt: serverTimestamp(),
    createdAtMs: certificate.createdAt
  });
}

/** TOFU explícito: a raiz só pode ser criada se ainda não existir; nunca sobrescrever silenciosamente. */
export async function pinAccountRoot(db, uid, rootPublicKeyJwk) {
  assertUid(uid);
  if (!rootPublicKeyJwk || rootPublicKeyJwk.kty !== 'EC' || rootPublicKeyJwk.crv !== 'P-256') {
    throw new Error('Chave pública raiz inválida.');
  }
  await runTransaction(db, async tx => {
    const ref = rootRef(db, uid);
    const snap = await tx.get(ref);
    if (snap.exists()) throw new Error('A identidade raiz já está fixada. Recuperação ou rotação exige procedimento explícito.');
    tx.set(ref, { ownerUid: uid, algorithm: 'ECDSA-P256-SHA256', publicKeyJwk: rootPublicKeyJwk, createdAt: serverTimestamp() });
  });
}

export async function readPinnedAccountRoot(db, uid) {
  assertUid(uid);
  const snap = await getDoc(rootRef(db, uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (data.ownerUid !== uid) throw new Error('Identidade raiz pertence a outra conta.');
  return data.publicKeyJwk;
}

/** Cancela uma sessão ainda aberta pelo próprio UID. */
export async function cancelPairingSession(db, uid, sessionId) {
  assertUid(uid); assertSessionId(sessionId);
  const ref = sessionRef(db, sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const data = snap.data();
  if (data.ownerUid !== uid || data.state === 'completed') {
    throw new Error('Esta sessão não pode ser cancelada por este dispositivo.');
  }
  await deleteDoc(ref);
  return true;
}
