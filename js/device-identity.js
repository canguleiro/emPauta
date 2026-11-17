/* CrIArt — identidade criptográfica independente por instalação.
 * Etapa 3A: cria e registra a identidade pública do dispositivo.
 * A chave privada permanece no IndexedDB e não é exportável após a criação.
 */

const DB_NAME = "criart-device-identity-v1";
const STORE_NAME = "identity";
const DEVICE_ID_KEY = "criart_device_id_v1";
const CRYPTO_VERSION = 1;

function openIdentityDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readIdentity(key) {
  const db = await openIdentityDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function writeIdentity(key, value) {
  const db = await openIdentityDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { const error = tx.error; db.close(); reject(error); };
    tx.onabort = () => { const error = tx.error; db.close(); reject(error); };
  });
}

function getStableDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

async function createIdentity(deviceId) {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
  );
  const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const privateKey = await crypto.subtle.importKey(
    "jwk", privateJwk,
    { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]
  );
  return {
    uid: null,
    deviceId,
    privateKey,
    publicKey,
    cryptoVersion: CRYPTO_VERSION,
    createdAt: Date.now()
  };
}

export async function ensureDeviceIdentity(uid) {
  if (!uid) throw new TypeError("UID ausente ao criar identidade do dispositivo.");
  if (!crypto?.subtle || !indexedDB) {
    throw new Error("Este navegador não oferece os recursos necessários para identidade criptográfica local.");
  }

  const deviceId = getStableDeviceId();
  const storageKey = `${uid}:${deviceId}`;
  let identity = await readIdentity(storageKey);

  if (!identity?.privateKey || !identity?.publicKey) {
    identity = await createIdentity(deviceId);
    identity.uid = uid;
    await writeIdentity(storageKey, identity);
  }

  return identity;
}

export async function registerDeviceIdentity(db, uid, identity, serverTimestamp) {
  if (!db || !uid || !identity?.deviceId || !identity?.publicKey) {
    throw new TypeError("Dados incompletos para registrar o dispositivo.");
  }
  const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
  const deviceRef = doc(db, "private", "private-room", "devices", uid, "items", identity.deviceId);
  await setDoc(deviceRef, {
    uid,
    deviceId: identity.deviceId,
    publicKey: identity.publicKey,
    cryptoVersion: CRYPTO_VERSION,
    platform: navigator.userAgentData?.platform || navigator.platform || "unknown",
    createdAt: identity.createdAt,
    updatedAt: serverTimestamp()
  }, { merge: true });
  return deviceRef;
}
