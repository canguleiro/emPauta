import { hardenEcdsaPrivateKey } from "./crypto-key-hardening.js";
/**
 * CrIArt — armazenamento local das identidades de pareamento.
 * Guarda CryptoKey no IndexedDB já utilizado pelo app. A chave privada do dispositivo é não exportável. A chave privada raiz permanece somente no aparelho de autoridade; aparelhos vinculados recebem apenas a chave pública raiz.
 * Não envia chaves privadas ao Firestore.
 */
const DB_NAME = 'em-pauta-private';
const DB_VERSION = 1;
const STORE = 'keys';

function assertUid(uid) {
  if (typeof uid !== 'string' || !uid.trim()) throw new Error('UID inválido.');
}
function rootKey(uid) { return `pairingRoot:${uid}`; }
function deviceKey(uid, deviceId) { return `pairingDevice:${uid}:${deviceId}`; }

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha ao abrir IndexedDB.'));
    request.onblocked = () => reject(new Error('IndexedDB bloqueado por outra aba.'));
  });
}

async function transact(mode, operation) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      try { result = operation(store); }
      catch (error) { tx.abort(); reject(error); return; }
      tx.oncomplete = () => resolve(result?.result);
      tx.onerror = () => reject(tx.error || new Error('Falha na transação IndexedDB.'));
      tx.onabort = () => reject(tx.error || new Error('Transação IndexedDB cancelada.'));
    });
  } finally { db.close(); }
}

export async function saveAccountRoot(uid, identity) {
  assertUid(uid);
  if (!identity?.privateKey || !identity?.publicKeyJwk || identity.algorithm !== 'ECDSA-P256-SHA256') {
    throw new Error('Identidade raiz incompleta.');
  }
  // A raiz deve ser persistida uma única vez. Não sobrescrever silenciosamente.
  const key = rootKey(uid);
  const existing = await loadAccountRoot(uid);
  if (existing) throw new Error('Já existe uma identidade raiz local para esta conta.');
  await transact('readwrite', store => store.add({
    privateKey: identity.privateKey,
    publicKeyJwk: identity.publicKeyJwk,
    algorithm: identity.algorithm,
    version: identity.version,
    createdAt: Date.now()
  }, key));
  return true;
}


/** Persiste somente a chave pública raiz em aparelhos vinculados. Nunca recebe chave privada. */
export async function saveAccountRootPublic(uid, publicKeyJwk) {
  assertUid(uid);
  if (!publicKeyJwk || publicKeyJwk.kty !== 'EC' || publicKeyJwk.crv !== 'P-256' || !publicKeyJwk.x || !publicKeyJwk.y) {
    throw new Error('Chave pública raiz inválida.');
  }
  const key = rootKey(uid);
  const existing = await loadAccountRoot(uid);
  if (existing) {
    if (JSON.stringify(existing.publicKeyJwk) !== JSON.stringify(publicKeyJwk)) throw new Error('Já existe uma raiz local divergente.');
    return true;
  }
  await transact('readwrite', store => store.add({
    privateKey: null,
    publicKeyJwk,
    algorithm: 'ECDSA-P256-SHA256',
    version: 1,
    authority: false,
    createdAt: Date.now()
  }, key));
  return true;
}

export async function loadAccountRoot(uid) {
  assertUid(uid);
  const value = await transact('readonly', store => store.get(rootKey(uid)));
  if (!value?.privateKey?.extractable) return value || null;
  const hardened = await hardenEcdsaPrivateKey({
    privateKey: value.privateKey,
    publicKeyJwk: value.publicKeyJwk,
    binding: `account-root|${uid}`
  });
  if (!hardened.changed) return value;
  await transact('readwrite', store => {
    const request = store.get(rootKey(uid));
    request.onsuccess = () => {
      const current = request.result;
      if (!current || JSON.stringify(current.publicKeyJwk) !== JSON.stringify(value.publicKeyJwk)) return;
      if (current.privateKey?.extractable) store.put({ ...current, privateKey: hardened.privateKey, hardenedAt: Date.now() }, rootKey(uid));
    };
  });
  return { ...value, privateKey: hardened.privateKey, hardenedAt: Date.now() };
}

export async function saveLocalDevice(uid, device) {
  assertUid(uid);
  if (!device?.deviceId || !device?.privateKey || device.certificate?.uid !== uid || device.certificate?.deviceId !== device.deviceId) {
    throw new Error('Identidade local do dispositivo inválida.');
  }
  const key = deviceKey(uid, device.deviceId);
  await transact('readwrite', store => store.add({
    privateKey: device.privateKey,
    certificate: device.certificate,
    savedAt: Date.now()
  }, key));
  return true;
}

export async function loadLocalDevice(uid, deviceId) {
  assertUid(uid);
  if (!deviceId) throw new Error('Identificador do dispositivo ausente.');
  const value = await transact('readonly', store => store.get(deviceKey(uid, deviceId)));
  return value || null;
}

export async function listLocalDevices(uid) {
  assertUid(uid);
  const prefix = `pairingDevice:${uid}:`;
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).openCursor();
      const found = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) {
          found.push({ deviceId: cursor.key.slice(prefix.length), ...cursor.value });
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve(found);
      tx.onerror = () => reject(tx.error || new Error('Falha ao listar dispositivos locais.'));
      tx.onabort = () => reject(tx.error || new Error('Listagem cancelada.'));
    });
  } finally { db.close(); }
}

export async function deleteLocalDevice(uid, deviceId) {
  assertUid(uid);
  if (!deviceId) throw new Error('Identificador do dispositivo ausente.');
  await transact('readwrite', store => store.delete(deviceKey(uid, deviceId)));
  return true;
}

export const pairingVaultDatabase = Object.freeze({ name: DB_NAME, version: DB_VERSION, store: STORE });

function rootRotationPendingKey(uid) { return `pairingRootRotationPending:${uid}`; }

/** Guarda uma rotação pendente sem substituir a raiz ativa. A CryptoKey privada permanece no IndexedDB local. */
export async function savePendingRootRotation(uid, pending) {
  assertUid(uid);
  if (!pending?.privateKey || !pending?.newRootPublicKeyJwk || !pending?.oldRootPublicKeyJwk ||
      !pending?.serializedPackage || !Number.isSafeInteger(pending.rootEpoch) ||
      !Number.isSafeInteger(pending.previousRootEpoch)) throw new Error('Registro pendente de rotação incompleto.');
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const rootReq = store.get(rootKey(uid));
      const pendingReq = store.get(rootRotationPendingKey(uid));
      let staged = false;
      const apply = () => {
        if (rootReq.readyState !== 'done' || pendingReq.readyState !== 'done' || staged) return;
        const root = rootReq.result;
        const currentEpoch = Number.isSafeInteger(root?.rootEpoch) ? root.rootEpoch : 1;
        if (!root?.privateKey || currentEpoch !== pending.previousRootEpoch ||
            JSON.stringify(root.publicKeyJwk) !== JSON.stringify(pending.oldRootPublicKeyJwk)) {
          tx.abort(); reject(new Error('A identidade raiz local mudou ou não possui autoridade para iniciar a rotação.')); return;
        }
        if (pendingReq.result) {
          if (pendingReq.result.serializedPackage === pending.serializedPackage &&
              JSON.stringify(pendingReq.result.newRootPublicKeyJwk) === JSON.stringify(pending.newRootPublicKeyJwk)) { staged = true; return; }
          tx.abort(); reject(new Error('Já existe outra rotação pendente para esta conta.')); return;
        }
        store.add({ ...pending, savedAt: Date.now() }, rootRotationPendingKey(uid));
        staged = true;
      };
      rootReq.onsuccess = apply;
      pendingReq.onsuccess = apply;
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Falha ao salvar rotação pendente.'));
      tx.onabort = () => reject(tx.error || new Error('Preparação da rotação cancelada.'));
    });
  } finally { db.close(); }
}

export async function loadPendingRootRotation(uid) {
  assertUid(uid);
  const value = await transact('readonly', store => store.get(rootRotationPendingKey(uid)));
  if (!value?.privateKey?.extractable) return value || null;
  const hardened = await hardenEcdsaPrivateKey({
    privateKey: value.privateKey,
    publicKeyJwk: value.newRootPublicKeyJwk,
    binding: `pending-root-rotation|${uid}|${value.rootEpoch}`
  });
  if (!hardened.changed) return value;
  await transact('readwrite', store => {
    const request = store.get(rootRotationPendingKey(uid));
    request.onsuccess = () => {
      const current = request.result;
      if (!current || current.serializedPackage !== value.serializedPackage) return;
      if (current.privateKey?.extractable) store.put({ ...current, privateKey: hardened.privateKey, hardenedAt: Date.now() }, rootRotationPendingKey(uid));
    };
  });
  return { ...value, privateKey: hardened.privateKey, hardenedAt: Date.now() };
}

/** Promove a chave pendente somente após confirmação do estado remoto já efetivado. */
export async function promotePendingRootRotation(uid, { remoteRootEpoch, remoteRootPublicKeyJwk }) {
  assertUid(uid);
  if (!Number.isSafeInteger(remoteRootEpoch) || !remoteRootPublicKeyJwk) throw new Error('Confirmação remota incompleta.');
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const rootReq = store.get(rootKey(uid));
      const pendingReq = store.get(rootRotationPendingKey(uid));
      let promoted = false;
      const apply = () => {
        if (rootReq.readyState !== 'done' || pendingReq.readyState !== 'done' || promoted) return;
        const root = rootReq.result;
        const pending = pendingReq.result;
        if (!root || !pending) { tx.abort(); reject(new Error('Raiz ativa ou rotação pendente não encontrada.')); return; }
        const currentEpoch = Number.isSafeInteger(root.rootEpoch) ? root.rootEpoch : 1;
        if (currentEpoch !== pending.previousRootEpoch ||
            JSON.stringify(root.publicKeyJwk) !== JSON.stringify(pending.oldRootPublicKeyJwk)) {
          tx.abort(); reject(new Error('A raiz local mudou desde a preparação da rotação.')); return;
        }
        if (remoteRootEpoch !== pending.rootEpoch ||
            JSON.stringify(remoteRootPublicKeyJwk) !== JSON.stringify(pending.newRootPublicKeyJwk)) {
          tx.abort(); reject(new Error('O estado remoto não corresponde à rotação pendente.')); return;
        }
        store.put({
          privateKey: pending.privateKey,
          publicKeyJwk: pending.newRootPublicKeyJwk,
          algorithm: 'ECDSA-P256-SHA256',
          version: 1,
          rootEpoch: pending.rootEpoch,
          authority: true,
          createdAt: root.createdAt || Date.now(),
          rotatedAt: Date.now()
        }, rootKey(uid));
        store.delete(rootRotationPendingKey(uid));
        promoted = true;
      };
      rootReq.onsuccess = apply;
      pendingReq.onsuccess = apply;
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Falha ao promover a nova identidade raiz.'));
      tx.onabort = () => reject(tx.error || new Error('Promoção da identidade raiz cancelada.'));
    });
  } finally { db.close(); }
}

/**
 * Atualiza atomicamente a âncora pública e o certificado local após validação
 * criptográfica externa da cadeia. Nunca substitui uma chave privada raiz.
 */
export async function applyVerifiedPublicRootAndDeviceCertificate(uid, deviceId, {
  trustedRootEpoch, trustedRootPublicKeyJwk, nextRootEpoch, nextRootPublicKeyJwk, certificate
}) {
  assertUid(uid);
  if (!deviceId || !Number.isSafeInteger(trustedRootEpoch) || !Number.isSafeInteger(nextRootEpoch) ||
      nextRootEpoch <= trustedRootEpoch || !trustedRootPublicKeyJwk || !nextRootPublicKeyJwk ||
      certificate?.uid !== uid || certificate?.deviceId !== deviceId || certificate?.rootEpoch !== nextRootEpoch) {
    throw new Error('Atualização de identidade local incompleta.');
  }
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const rootReq = store.get(rootKey(uid));
      const deviceReq = store.get(deviceKey(uid, deviceId));
      let applied = false;
      const apply = () => {
        if (rootReq.readyState !== 'done' || deviceReq.readyState !== 'done' || applied) return;
        const root = rootReq.result;
        const device = deviceReq.result;
        const localEpoch = Number.isSafeInteger(root?.rootEpoch) ? root.rootEpoch : 1;
        if (!root || !device) { tx.abort(); reject(new Error('Raiz pública ou identidade local do dispositivo não encontrada.')); return; }
        if (root.privateKey) { tx.abort(); reject(new Error('Aparelho com autoridade raiz deve recuperar a rotação pendente; atualização pública automática bloqueada.')); return; }
        if (localEpoch !== trustedRootEpoch || JSON.stringify(root.publicKeyJwk) !== JSON.stringify(trustedRootPublicKeyJwk)) {
          tx.abort(); reject(new Error('A âncora local mudou durante a sincronização.')); return;
        }
        store.put({ ...root, publicKeyJwk: nextRootPublicKeyJwk, rootEpoch: nextRootEpoch, authority: false, updatedAt: Date.now() }, rootKey(uid));
        store.put({ ...device, certificate, updatedAt: Date.now() }, deviceKey(uid, deviceId));
        applied = true;
      };
      rootReq.onsuccess = apply;
      deviceReq.onsuccess = apply;
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Falha ao atualizar identidade local.'));
      tx.onabort = () => reject(tx.error || new Error('Sincronização local cancelada.'));
    });
  } finally { db.close(); }
}
