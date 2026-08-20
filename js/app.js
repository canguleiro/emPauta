import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  getIdToken
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  deleteDoc,
  limit,
  getDocs,
  where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
  getStorage,
  ref,
  uploadBytes,
  getBytes,
  deleteObject
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";


/* =========================================================
   FIREBASE
========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyASQkgnQkeKjXKrmT3yMV9zcUVxec3NvrA",
  authDomain: "em-pauta-d6e92.firebaseapp.com",
  projectId: "em-pauta-d6e92",
  storageBucket: "em-pauta-d6e92.firebasestorage.app",
  messagingSenderId: "94994518950",
  appId: "1:94994518950:web:e60bb5bc8358752f47567"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const ROOM_ID = "private-room";

const MSGS = collection(
  db,
  "private",
  ROOM_ID,
  "messages"
);

const STATUS = collection(
  db,
  "private",
  ROOM_ID,
  "status"
);

const KEYS = collection(
  db,
  "private",
  ROOM_ID,
  "keys"
);


/* =========================================================
   ELEMENTOS / UTILITÁRIOS
========================================================= */

const $ = id => document.getElementById(id);

const enc = new TextEncoder();
const dec = new TextDecoder();

let me = null;
let members = null;
let myNick = "";

let messages = [];

let unsubscribeMessages = null;
let unsubscribeKeys = null;
let unsubscribeStatus = null;

let keyCache = new Map();

let privateKey = null;
let publicKeyJwk = null;

let sharedSecretCache = new Map();

let replyTarget = null;
let menuOpen = null;
let searchText = "";

let selectedFile = null;

let locked = false;

let connectionState = "online";

let messageListenerRetry = null;
let messageListenerRetryCount = 0;

let pinHash =
  localStorage.getItem("ep_device_pin_hash") || "";

let pinSalt =
  localStorage.getItem("ep_device_pin_salt") || "";

let pinBuffer = "";
let pinReady = false;

let lastActivity = Date.now();
let lockTimer = null;

let ttlSeconds =
  Number(localStorage.getItem("ep_ttl") || "0");


/*
 * NOVO:
 * A sessão só será considerada pronta depois que
 * Firebase Auth, chaves e listeners iniciais estiverem
 * devidamente estabelecidos.
 */
let sessionReady = false;
let keysReady = false;
let messagesReady = false;
let statusReady = false;

let sessionInitPromise = null;
let sessionInitResolve = null;


/* =========================================================
   EMOJIS
========================================================= */

const EMOJIS = [
  "😊","😂","🤣","😍","😉","😎","🤔","🙄",
  "🤫","😭","😱","😴","❤️","🔥","👍","👎",
  "👏","🙏","💪","✅","⚠️","❌","💯","💡",
  "🔒","☕","🎉","🚀","📱","📰","⭐","🙂",
  "😅","🥰","😘","🤝","👀","🫶","✨","💬",
  "📌","🗑️","🔐","🕵️","🤍","🖤"
];


/* =========================================================
   TOAST
========================================================= */

function showToast(text) {
  const toast = $("toast");

  if (!toast) {
    console.warn(text);
    return;
  }

  toast.textContent = text;
  toast.classList.remove("hidden");

  clearTimeout(showToast.t);

  showToast.t = setTimeout(() => {
    toast.classList.add("hidden");
  }, 2600);
}


/* =========================================================
   BASE64 / IDS
========================================================= */

function b64(bytes) {
  const u8 =
    bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(bytes);

  let s = "";

  for (
    let i = 0;
    i < u8.length;
    i += 0x8000
  ) {
    s += String.fromCharCode(
      ...u8.subarray(i, i + 0x8000)
    );
  }

  return btoa(s);
}


function unb64(s) {
  const bin = atob(s);

  const out =
    new Uint8Array(bin.length);

  for (
    let i = 0;
    i < bin.length;
    i++
  ) {
    out[i] = bin.charCodeAt(i);
  }

  return out;
}


function randomId(bytes = 16) {
  return b64(
    crypto.getRandomValues(
      new Uint8Array(bytes)
    )
  )
    .replace(/[+/=]/g, "")
    .slice(0, 22);
}


function initials(name) {
  return (name || "EP")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(x => x[0])
    .join("")
    .toUpperCase();
}


/* =========================================================
   INDEXED DB — CHAVES PRIVADAS
========================================================= */

async function idbOpen() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(
      "em-pauta-private",
      1
    );

    r.onupgradeneeded = () => {
      const dbi = r.result;

      if (
        !dbi.objectStoreNames.contains("keys")
      ) {
        dbi.createObjectStore("keys");
      }
    };

    r.onsuccess = () => resolve(r.result);

    r.onerror = () => reject(r.error);
  });
}


async function idbGet(k) {
  const dbi = await idbOpen();

  return new Promise((resolve, reject) => {
    const tx =
      dbi.transaction(
        "keys",
        "readonly"
      );

    const req =
      tx.objectStore("keys").get(k);

    req.onsuccess =
      () => resolve(req.result);

    req.onerror =
      () => reject(req.error);
  });
}


async function idbPut(k, v) {
  const dbi = await idbOpen();

  return new Promise((resolve, reject) => {
    const tx =
      dbi.transaction(
        "keys",
        "readwrite"
      );

    tx.objectStore("keys").put(v, k);

    tx.oncomplete = resolve;

    tx.onerror =
      () => reject(tx.error);
  });
}


async function idbDelete(k) {
  const dbi = await idbOpen();

  return new Promise((resolve, reject) => {
    const tx =
      dbi.transaction(
        "keys",
        "readwrite"
      );

    tx.objectStore("keys").delete(k);

    tx.oncomplete = resolve;

    tx.onerror =
      () => reject(tx.error);
  });
}


/* =========================================================
   IDENTIDADE CRIPTOGRÁFICA
========================================================= */

async function ensureIdentity() {

  const storageKey =
    `privateKey:${me.uid}`;

  const saved =
    await idbGet(storageKey);

  if (
    saved?.privateKey &&
    saved?.publicKeyJwk
  ) {

    /*
     * A chave privada permanece como
     * CryptoKey não exportável.
     */

    privateKey =
      saved.privateKey;

    publicKeyJwk =
      saved.publicKeyJwk;

  } else {

    /*
     * O par é exportável somente
     * durante a inicialização.
     */

    const pair =
      await crypto.subtle.generateKey(
        {
          name: "ECDH",
          namedCurve: "P-256"
        },
        true,
        ["deriveBits"]
      );

    const exportedPublic =
      await crypto.subtle.exportKey(
        "jwk",
        pair.publicKey
      );

    const exportedPrivate =
      await crypto.subtle.exportKey(
        "jwk",
        pair.privateKey
      );

    const lockedPrivate =
      await crypto.subtle.importKey(
        "jwk",
        exportedPrivate,
        {
          name: "ECDH",
          namedCurve: "P-256"
        },
        false,
        ["deriveBits"]
      );

    privateKey =
      lockedPrivate;

    publicKeyJwk =
      exportedPublic;

    await idbPut(
      storageKey,
      {
        privateKey: lockedPrivate,
        publicKeyJwk
      }
    );
  }

  /*
   * Publica somente a chave pública.
   */

  await setDoc(
    doc(KEYS, me.uid),
    {
      uid: me.uid,
      publicKey: publicKeyJwk,
      nick: myNick,
      updatedAt: serverTimestamp()
    },
    {
      merge: true
    }
  );
}


/* =========================================================
   CHAVES PÚBLICAS / ECDH
========================================================= */

async function importPublic(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    false,
    []
  );
}


async function getSharedSecret(otherUid) {

  if (
    sharedSecretCache.has(otherUid)
  ) {
    return sharedSecretCache.get(
      otherUid
    );
  }

  const other =
    keyCache.get(otherUid);

  if (!other?.publicKey) {
    throw new Error(
      "A chave pública da outra pessoa ainda não está disponível."
    );
  }

  const pub =
    await importPublic(
      other.publicKey
    );

  const bits =
    await crypto.subtle.deriveBits(
      {
        name: "ECDH",
        public: pub
      },
      privateKey,
      256
    );

  const secret =
    new Uint8Array(bits);

  sharedSecretCache.set(
    otherUid,
    secret
  );

  return secret;
}


async function deriveMessageKey(
  secret,
  salt
) {

  const base =
    await crypto.subtle.importKey(
      "raw",
      secret,
      "HKDF",
      false,
      ["deriveKey"]
    );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: enc.encode(
        "EmPauta-v2-message"
      )
    },
    base,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    [
      "encrypt",
      "decrypt"
    ]
  );
}


async function encryptObject(
  obj,
  otherUid,
  aadText
) {

  const secret =
    await getSharedSecret(
      otherUid
    );

  const salt =
    crypto.getRandomValues(
      new Uint8Array(16)
    );

  const iv =
    crypto.getRandomValues(
      new Uint8Array(12)
    );

  const key =
    await deriveMessageKey(
      secret,
      salt
    );

  const plaintext =
    enc.encode(
      JSON.stringify(obj)
    );

  const cipher =
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData:
          enc.encode(aadText)
      },
      key,
      plaintext
    );

  return {
    ciphertext: b64(cipher),
    salt: b64(salt),
    iv: b64(iv),
    v: 2
  };
}


async function decryptObject(
  data,
  otherUid,
  aadText
) {

  const secret =
    await getSharedSecret(
      otherUid
    );

  const salt =
    unb64(data.salt);

  const iv =
    unb64(data.iv);

  const key =
    await deriveMessageKey(
      secret,
      salt
    );

  const plain =
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData:
          enc.encode(aadText)
      },
      key,
      unb64(
        data.ciphertext
      )
    );

  return JSON.parse(
    dec.decode(plain)
  );
}


async function getOtherUid() {

  const ids =
    [...keyCache.keys()]
      .filter(
        x => x !== me.uid
      );

  return ids[0] || null;
}


/* =========================================================
   MEMBRESIA
========================================================= */

async function verifyMembership() {

  /*
   * A autorização real é feita pelas
   * Firebase Security Rules.
   */

  if (!me) {
    throw new Error(
      "Sessão não autenticada."
    );
  }
}


/* =========================================================
   STATUS
========================================================= */

async function saveStatus(
  typing = false
) {

  if (!me) return;

  await setDoc(
    doc(STATUS, me.uid),
    {
      uid: me.uid,
      nick: myNick,
      typing,
      lastActive:
        serverTimestamp()
    },
    {
      merge: true
    }
  ).catch(() => {});
}


/* =========================================================
   ATIVIDADE / BLOQUEIO
========================================================= */

function updateActivity() {

  lastActivity =
    Date.now();

  if (locked) return;

  if (
    localStorage.getItem(
      "ep_auto_lock"
    ) === "1" &&
    pinReady &&
    lockTimer === null
  ) {

    lockTimer =
      setInterval(() => {

        if (
          Date.now() -
            lastActivity >
          5 * 60 * 1000
        ) {
          lockApp();
        }

      }, 15000);
  }
}


[
  "pointerdown",
  "keydown",
  "touchstart"
].forEach(ev => {

  window.addEventListener(
    ev,
    updateActivity,
    {
      passive: true
    }
  );

});


/* =========================================================
   PIN
========================================================= */

async function hashPin(
  value,
  saltB64
) {

  const salt =
    saltB64
      ? unb64(saltB64)
      : crypto.getRandomValues(
          new Uint8Array(16)
        );

  const base =
    await crypto.subtle.importKey(
      "raw",
      enc.encode(value),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

  const bits =
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: 150000,
        hash: "SHA-256"
      },
      base,
      256
    );

  return {
    hash: b64(bits),
    salt: b64(salt)
  };
}


async function loadPin() {
  pinReady = !!pinHash;
}


async function setNewPin(value) {

  const result =
    await hashPin(value);

  pinHash =
    result.hash;

  pinSalt =
    result.salt;

  localStorage.setItem(
    "ep_device_pin_hash",
    pinHash
  );

  localStorage.setItem(
    "ep_device_pin_salt",
    pinSalt
  );

  pinReady = true;
}


async function checkPin(value) {

  if (
    !pinHash ||
    !pinSalt
  ) {
    return false;
  }

  const result =
    await hashPin(
      value,
      pinSalt
    );

  return (
    result.hash ===
    pinHash
  );
}


/* =========================================================
   BIOMETRIA
========================================================= */

function base64url(bytes) {
  return b64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


function fromBase64url(s) {

  s = s
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  while (
    s.length % 4
  ) {
    s += "=";
  }

  return unb64(s);
}


async function registerBiometric() {

  if (
    !window.PublicKeyCredential ||
    !navigator.credentials
  ) {
    showToast(
      "A biometria do navegador não está disponível neste dispositivo."
    );
    return;
  }

  try {

    const credential =
      await navigator.credentials.create({
        publicKey: {
          challenge:
            crypto.getRandomValues(
              new Uint8Array(32)
            ),

          rp: {
            name: "Em Pauta",
            id: location.hostname
          },

          user: {
            id:
              crypto.getRandomValues(
                new Uint8Array(16)
              ),

            name:
              myNick || "usuario",

            displayName:
              myNick || "Usuário"
          },

          pubKeyCredParams: [
            {
              type: "public-key",
              alg: -7
            },
            {
              type: "public-key",
              alg: -257
            }
          ],

          authenticatorSelection: {
            authenticatorAttachment:
              "platform",

            residentKey:
              "preferred",

            userVerification:
              "required"
          },

          timeout: 60000,

          attestation: "none"
        }
      });

    if (credential) {

      localStorage.setItem(
        "ep_biometric_cred",
        base64url(
          credential.rawId
        )
      );

      showToast(
        "Biometria deste dispositivo ativada."
      );
    }

  } catch (e) {

    console.warn(e);

    showToast(
      "Não foi possível ativar a biometria."
    );
  }
}


async function unlockWithBiometric() {

  const id =
    localStorage.getItem(
      "ep_biometric_cred"
    );

  if (
    !id ||
    !window.PublicKeyCredential ||
    !navigator.credentials
  ) {

    showToast(
      "Biometria ainda não foi configurada."
    );

    return;
  }

  try {

    const credential =
      await navigator.credentials.get({
        publicKey: {
          challenge:
            crypto.getRandomValues(
              new Uint8Array(32)
            ),

          rpId:
            location.hostname,

          allowCredentials: [
            {
              type: "public-key",
              id:
                fromBase64url(id)
            }
          ],

          userVerification:
            "required",

          timeout: 60000
        }
      });

    if (credential) {
      unlockApp();
    }

  } catch (e) {

    console.warn(e);

    showToast(
      "Biometria não autorizada."
    );
  }
}


/* =========================================================
   PIN PAD
========================================================= */

function setupPinpad() {

  const pad =
    $("pinpad");

  if (!pad) return;

  const keys = [
    "1","2","3",
    "4","5","6",
    "7","8","9",
    "⌫","0","↵"
  ];

  pad.innerHTML = "";

  keys.forEach(k => {

    const b =
      document.createElement(
        "button"
      );

    b.textContent = k;

    b.onclick =
      () => handlePinKey(k);

    pad.appendChild(b);
  });

  renderDots();
}


function renderDots() {

  const dots =
    $("pinDots");

  if (!dots) return;

  dots.innerHTML = "";

  for (
    let i = 0;
    i < 6;
    i++
  ) {

    const d =
      document.createElement(
        "span"
      );

    d.className =
      "dot" +
      (
        pinBuffer.length > i
          ? " on"
          : ""
      );

    dots.appendChild(d);
  }
}


async function handlePinKey(k) {

  if (k === "⌫") {

    pinBuffer =
      pinBuffer.slice(0, -1);

    renderDots();

    return;
  }

  if (k === "↵") {

    if (
      pinBuffer.length === 6
    ) {

      if (pinReady) {

        if (
          await checkPin(
            pinBuffer
          )
        ) {

          unlockApp();

        } else {

          pinBuffer = "";

          renderDots();

          showToast(
            "PIN incorreto."
          );
        }

      } else {

        await setNewPin(
          pinBuffer
        );

        unlockApp();

        showToast(
          "PIN deste dispositivo configurado."
        );
      }
    }

    return;
  }

  if (
    /^\d$/.test(k) &&
    pinBuffer.length < 6
  ) {

    pinBuffer += k;

    renderDots();

    if (
      pinBuffer.length === 6
    ) {

      setTimeout(
        () => handlePinKey("↵"),
        100
      );
    }
  }
}


function lockApp() {

  if (!pinReady) return;

  locked = true;

  pinBuffer = "";

  $("lockScreen")
    ?.classList
    .remove("hidden");

  renderDots();
}


function unlockApp() {

  locked = false;

  pinBuffer = "";

  $("lockScreen")
    ?.classList
    .add("hidden");

  lastActivity =
    Date.now();
}


if ($("biometricBtn")) {

  $("biometricBtn").onclick =
    () =>
      localStorage.getItem(
        "ep_biometric_cred"
      )
        ? unlockWithBiometric()
        : registerBiometric();
}


/* =========================================================
   MODO DISFARCE / PÂNICO
========================================================= */

function enterPanic() {

  $("panicScreen")
    ?.classList
    .remove("hidden");

  $("panicText")?.focus();
}


function leavePanic() {

  $("panicScreen")
    ?.classList
    .add("hidden");
}


if ($("panicBtn")) {
  $("panicBtn").onclick =
    enterPanic;
}


if ($("panicUnlock")) {

  $("panicUnlock").onclick =
    () => {

      const code =
        prompt(
          "Código de saída"
        );

      if (
        code ===
          localStorage.getItem(
            "ep_panic_code"
          ) &&
        code
      ) {

        leavePanic();

      } else if (
        !localStorage.getItem(
          "ep_panic_code"
        )
      ) {

        const n =
          prompt(
            "Crie um código curto para sair do modo disfarce"
          );

        if (n) {

          localStorage.setItem(
            "ep_panic_code",
            n
          );

          leavePanic();
        }
      }
    };
}

/* =========================================================
   RENDERIZAÇÃO DAS MENSAGENS
========================================================= */

async function renderMessages() {

  const box = $("chat");

  if (!box) return;

  box.innerHTML = "";

  const visible =
    messages.filter(m => {

      if (!searchText) {
        return true;
      }

      const x =
        (m.data?.text || "") +
        " " +
        (m.data?.senderNick || "");

      return x
        .toLowerCase()
        .includes(
          searchText.toLowerCase()
        );
    });

  let previousDay = "";

  for (const m of visible) {

    const d = m.data;

    const dt =
      d.createdAt?.toDate?.() ||
      new Date(
        d.createdAtMs ||
        Date.now()
      );

    const day =
      dt.toLocaleDateString(
        "pt-BR"
      );

    if (day !== previousDay) {

      previousDay = day;

      const sep =
        document.createElement(
          "div"
        );

      sep.className =
        "date-sep";

      sep.textContent =
        day ===
        new Date()
          .toLocaleDateString(
            "pt-BR"
          )
          ? "Hoje"
          : day;

      box.appendChild(sep);
    }


    const row =
      document.createElement(
        "div"
      );

    row.className =
      "msg-row " +
      (
        d.senderUid === me.uid
          ? "mine"
          : "other"
      );


    const bubble =
      document.createElement(
        "div"
      );

    bubble.className =
      "bubble";

    bubble.dataset.id =
      m.id;


    /*
     * Nome do remetente
     */

    if (
      d.senderUid !== me.uid
    ) {

      const s =
        document.createElement(
          "div"
        );

      s.className =
        "sender";

      s.textContent =
        d.senderNick ||
        "Outro";

      bubble.appendChild(s);
    }


    /*
     * Resposta
     */

    if (d.reply?.text) {

      const r =
        document.createElement(
          "div"
        );

      r.className =
        "reply";

      r.textContent =
        `${d.reply.sender}: ${d.reply.text}`;

      bubble.appendChild(r);
    }


    /*
     * Mídia
     */

    if (d.media?.path) {

      const mediaBox =
        document.createElement(
          "div"
        );

      mediaBox.className =
        "media-loading";

      mediaBox.textContent =
        "Carregando mídia cifrada…";

      bubble.appendChild(
        mediaBox
      );


      decryptAttachment(
        d.media,
        d.senderUid === me.uid
          ? await getOtherUid()
          : d.senderUid
      )
        .then(blob => {

          mediaBox.remove();

          const url =
            URL.createObjectURL(
              blob
            );

          let el;

          if (
            d.media.type?.startsWith(
              "audio/"
            )
          ) {

            el =
              document.createElement(
                "audio"
              );

            el.controls = true;

            el.src = url;

          } else {

            el =
              document.createElement(
                "img"
              );

            el.className =
              "media";

            el.alt =
              "Imagem";

            el.src = url;

            el.onclick =
              () =>
                window.open(
                  url,
                  "_blank",
                  "noopener,noreferrer"
                );
          }


          /*
           * Inserimos a mídia antes do
           * conteúdo textual.
           */

          const textElement =
            bubble.querySelector(
              ".text"
            );

          if (textElement) {

            bubble.insertBefore(
              el,
              textElement
            );

          } else {

            bubble.appendChild(
              el
            );
          }

        })
        .catch(error => {

          console.warn(
            "Falha ao descriptografar mídia:",
            error
          );

          mediaBox.textContent =
            "Mídia indisponível neste dispositivo.";
        });
    }


    /*
     * Texto
     */

    const t =
      document.createElement(
        "div"
      );

    t.className =
      "text";

    t.textContent =
      d.text || "";

    bubble.appendChild(t);


    /*
     * Reações
     */

    if (d.reactions) {

      const rs =
        document.createElement(
          "div"
        );

      rs.className =
        "reactions";

      Object.entries(
        d.reactions
      ).forEach(
        ([emoji, count]) => {

          const b =
            document.createElement(
              "button"
            );

          b.className =
            "reaction";

          b.textContent =
            `${emoji} ${count}`;

          b.onclick =
            () =>
              react(
                m.id,
                emoji
              );

          rs.appendChild(b);
        }
      );

      bubble.appendChild(rs);
    }


    /*
     * Metadados / horário
     */

    const meta =
      document.createElement(
        "div"
      );

    meta.className =
      "meta";

    const time =
      dt.toLocaleTimeString(
        "pt-BR",
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      );

    meta.textContent =
      time +
      (
        d.edited
          ? " · editada"
          : ""
      );


    /*
     * ✓ / ✓✓
     */

    if (
      d.senderUid === me.uid
    ) {

      const seen =
        document.createElement(
          "span"
        );

      seen.textContent =
        (
          d.seenBy?.length || 0
        ) > 1
          ? "✓✓"
          : "✓";

      seen.style.color =
        (
          d.seenBy?.length || 0
        ) > 1
          ? "#1597d0"
          : "#7c8581";

      meta.appendChild(
        seen
      );
    }

    bubble.appendChild(meta);


    /*
     * Menu da mensagem
     */

    const mb =
      document.createElement(
        "button"
      );

    mb.className =
      "msg-menu";

    mb.textContent =
      "⋮";

    mb.onclick =
      e => {

        e.stopPropagation();

        openMenu(
          bubble,
          m
        );
      };

    bubble.appendChild(mb);


    row.appendChild(
      bubble
    );

    box.appendChild(
      row
    );
  }


  /*
   * Mantém a conversa no final.
   */

  box.scrollTop =
    box.scrollHeight;
}


/* =========================================================
   MENU DA MENSAGEM
========================================================= */

function openMenu(
  bubble,
  m
) {

  document
    .querySelectorAll(
      ".menu"
    )
    .forEach(
      x => x.remove()
    );


  const menu =
    document.createElement(
      "div"
    );

  menu.className =
    "menu";


  const add =
    (label, fn) => {

      const b =
        document.createElement(
          "button"
        );

      b.textContent =
        label;

      b.onclick =
        async e => {

          e.stopPropagation();

          menu.remove();

          await fn();
        };

      menu.appendChild(b);
    };


  /*
   * Reações rápidas
   */

  [
    "❤️",
    "👍",
    "🔥",
    "😂",
    "👏"
  ].forEach(
    emoji =>
      add(
        emoji,
        () =>
          react(
            m.id,
            emoji
          )
      )
  );


  add(
    "Responder",
    () =>
      startReply(m)
  );


  /*
   * Só o remetente pode editar.
   */

  if (
    m.data.senderUid === me.uid
  ) {

    add(
      "Editar",
      () =>
        editMessage(m)
    );
  }


  add(
    "Copiar",
    () =>
      navigator.clipboard?.writeText(
        m.data.text || ""
      )
  );


  /*
   * Só o remetente pode apagar.
   */

  if (
    m.data.senderUid === me.uid
  ) {

    add(
      "Apagar",
      () =>
        deleteMessage(m)
    );
  }


  bubble.appendChild(
    menu
  );
}


/* =========================================================
   RESPOSTA
========================================================= */

function startReply(m) {

  replyTarget = {
    id: m.id,
    sender:
      m.data.senderNick,
    text:
      m.data.text ||
      "[mídia]"
  };


  const replyText =
    $("replyText");

  if (replyText) {

    replyText.textContent =
      `${replyTarget.sender}: ${replyTarget.text}`;
  }


  $("replyBar")
    ?.classList
    .remove("hidden");


  $("messageInput")
    ?.focus();
}


if ($("cancelReply")) {

  $("cancelReply").onclick =
    () => {

      $("replyBar")
        ?.classList
        .add("hidden");

      replyTarget = null;
    };
}


/* =========================================================
   REAÇÕES
========================================================= */

async function react(
  id,
  emoji
) {

  const m =
    messages.find(
      x => x.id === id
    );

  if (!m) return;


  const reactions = {
    ...(m.raw?.reactions || {})
  };


  reactions[emoji] =
    (
      reactions[emoji] || 0
    ) + 1;


  try {

    await updateDoc(
      doc(MSGS, id),
      {
        reactions
      }
    );

  } catch (e) {

    console.error(
      "Falha ao reagir:",
      e
    );

    showToast(
      "Não foi possível reagir."
    );
  }
}


/* =========================================================
   EDITAR MENSAGEM
========================================================= */

async function editMessage(m) {

  const text =
    prompt(
      "Editar mensagem:",
      m.data.text || ""
    );


  if (
    text === null ||
    !text.trim() ||
    text === m.data.text
  ) {
    return;
  }


  const other =
    await getOtherUid();


  if (!other) {

    showToast(
      "A outra pessoa ainda não está disponível."
    );

    return;
  }


  const body = {

    text:
      text.trim(),

    senderNick:
      m.data.senderNick ||
      myNick,

    reply:
      m.data.reply ||
      null,

    media:
      m.data.media ||
      null,

    reactions:
      m.data.reactions ||
      {},

    createdAtMs:
      m.data.createdAtMs ||
      Date.now()
  };


  const payload =
    await encryptObject(
      body,
      other,
      m.id
    );


  try {

    await updateDoc(
      doc(MSGS, m.id),
      {
        ciphertext:
          payload.ciphertext,

        salt:
          payload.salt,

        iv:
          payload.iv,

        v:
          payload.v,

        edited: true
      }
    );

  } catch (e) {

    console.error(
      "Falha ao editar:",
      e
    );

    showToast(
      "Falha ao editar a mensagem."
    );
  }
}


/* =========================================================
   APAGAR MENSAGEM
========================================================= */

async function deleteMessage(m) {

  if (
    !confirm(
      "Apagar esta mensagem para os dois?"
    )
  ) {
    return;
  }


  try {

    await deleteDoc(
      doc(MSGS, m.id)
    );

    if (
      m.data.media?.path
    ) {

      await deleteObject(
        ref(
          storage,
          m.data.media.path
        )
      ).catch(
        () => {}
      );
    }

  } catch (e) {

    console.error(
      "Falha ao apagar:",
      e
    );

    showToast(
      "Falha ao apagar."
    );
  }
}


/* =========================================================
   ANEXOS — CRIPTOGRAFIA
========================================================= */

async function encryptAttachment(
  file,
  otherUid
) {

  const max =
    8 * 1024 * 1024;


  if (
    file.size > max
  ) {

    throw new Error(
      "Para manter o app simples, anexos ficam limitados a 8 MB."
    );
  }


  const plain =
    await file.arrayBuffer();


  const secret =
    await getSharedSecret(
      otherUid
    );


  const salt =
    crypto.getRandomValues(
      new Uint8Array(16)
    );


  const iv =
    crypto.getRandomValues(
      new Uint8Array(12)
    );


  const key =
    await deriveMessageKey(
      secret,
      salt
    );


  const cipher =
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv
      },
      key,
      plain
    );


  return {

    cipher:
      new Uint8Array(cipher),

    salt:
      b64(salt),

    iv:
      b64(iv),

    type:
      file.type,

    name:
      file.name
  };
}


/* =========================================================
   ANEXOS — DESCRIPTOGRAFIA
========================================================= */

async function decryptAttachment(
  media,
  otherUid
) {

  const cipher =
    await getBytes(
      ref(
        storage,
        media.path
      )
    );


  const secret =
    await getSharedSecret(
      otherUid
    );


  const key =
    await deriveMessageKey(
      secret,
      unb64(media.salt)
    );


  const plain =
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv:
          unb64(media.iv)
      },
      key,
      cipher
    );


  return new Blob(
    [plain],
    {
      type:
        media.type ||
        "application/octet-stream"
    }
  );
}


/* =========================================================
   CONTROLE DA SESSÃO
========================================================= */

/*
 * Atualiza visualmente o estado do botão de envio.
 *
 * A ideia é impedir que o usuário tente enviar
 * antes que a sessão esteja completamente pronta.
 */

function updateSendState() {

  const btn =
    $("sendBtn");

  if (!btn) return;


  /*
   * Não alteramos a aparência normal do botão
   * quando a sessão já estiver pronta.
   */

  btn.disabled =
    !sessionReady;


  if (!sessionReady) {

    btn.title =
      "Aguardando conexão segura…";

  } else {

    btn.title =
      "Enviar mensagem";
  }
}


/*
 * Atualiza o status textual da conexão sem
 * sobrescrever estados mais específicos.
 */

function updateConnectionState(
  text
) {

  const status =
    $("status");

  if (!status) return;

  status.textContent =
    text;
}


/*
 * Resolve a promessa da inicialização somente
 * quando os três listeners essenciais tiverem
 * sido inicializados.
 */

function checkSessionReady() {

  if (
    keysReady &&
    messagesReady &&
    statusReady
  ) {

    sessionReady = true;

    updateSendState();

    if (
      sessionInitResolve
    ) {

      sessionInitResolve();

      sessionInitResolve =
        null;
    }
  }
}


/*
 * Aguarda a sessão ficar pronta.
 */

function waitForSessionReady() {

  if (
    sessionReady
  ) {
    return Promise.resolve();
  }


  if (
    !sessionInitPromise
  ) {

    sessionInitPromise =
      new Promise(
        resolve => {
          sessionInitResolve =
            resolve;
        }
      );
  }


  return sessionInitPromise;
}


/*
 * Reseta o estado da sessão quando
 * precisamos reconstruir os listeners.
 */

function resetSessionState() {

  sessionReady = false;

  keysReady = false;

  messagesReady = false;

  statusReady = false;

  sessionInitPromise =
    null;

  sessionInitResolve =
    null;

  sharedSecretCache.clear();

  updateSendState();
}


/* =========================================================
   ENVIO DE MENSAGEM
========================================================= */

async function sendMessage() {

  /*
   * Se o usuário clicar durante a inicialização,
   * aguardamos em vez de simplesmente falhar.
   */

  if (!sessionReady) {

    showToast(
      "Aguardando conexão segura…"
    );

    try {

      await Promise.race([
        waitForSessionReady(),

        new Promise(
          (_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    "Tempo limite aguardando a conexão segura."
                  )
                ),
              10000
            )
        )
      ]);

    } catch (e) {

      console.warn(
        "Sessão ainda não está pronta:",
        e
      );

      showToast(
        "A conexão segura ainda não está pronta."
      );

      return;
    }
  }


  const input =
    $("messageInput");


  if (!input) return;


  const text =
    input.value.trim();


  if (
    !text &&
    !selectedFile
  ) {
    return;
  }


  const other =
    await getOtherUid();


  if (!other) {

    showToast(
      "A outra pessoa ainda não está pareada."
    );

    return;
  }


  /*
   * Reforço de autenticação antes da gravação.
   *
   * Isso reduz a possibilidade de uma sessão
   * recém-restaurada pelo navegador ainda estar
   * utilizando um token antigo.
   */

  try {

    if (auth.currentUser) {

      await getIdToken(
        auth.currentUser,
        true
      );
    }

  } catch (e) {

    console.warn(
      "Não foi possível renovar o token antes do envio:",
      e
    );
  }


  const id =
    randomId(18);


  let media = null;


  try {

    /*
     * Anexo
     */

    if (selectedFile) {

      const e =
        await encryptAttachment(
          selectedFile,
          other
        );


      const path =
        `private/${ROOM_ID}/media/${id}.bin`;


      await uploadBytes(
        ref(
          storage,
          path
        ),
        e.cipher,
        {
          contentType:
            "application/octet-stream",

          cacheControl:
            "no-store"
        }
      );


      media = {

        path,

        type:
          e.type,

        name:
          e.name,

        salt:
          e.salt,

        iv:
          e.iv
      };
    }


    /*
     * Corpo da mensagem.
     */

    const body = {

      text,

      senderNick:
        myNick,

      reply:
        replyTarget
          ? {
              sender:
                replyTarget.sender,

              text:
                replyTarget.text
            }
          : null,

      media,

      reactions: {},

      createdAtMs:
        Date.now()
    };


    /*
     * Criptografia da mensagem.
     */

    const encrypted =
      await encryptObject(
        body,
        other,
        id
      );


    const messageData = {

      senderUid:
        me.uid,

      senderNick:
        myNick,

      ciphertext:
        encrypted.ciphertext,

      salt:
        encrypted.salt,

      iv:
        encrypted.iv,

      v:
        encrypted.v,

      createdAt:
        serverTimestamp(),

      createdAtMs:
        Date.now(),

      seenBy: [
        me.uid
      ],

      edited: false,

      reactions: {}
    };


    /*
     * Primeira tentativa.
     */

    try {

      await setDoc(
        doc(MSGS, id),
        messageData
      );

    } catch (firstError) {

      /*
       * Se o Firebase ainda estiver
       * reconstruindo a autenticação depois
       * de um reload, renovamos o token e
       * fazemos uma segunda tentativa.
       */

      if (
        firstError?.code ===
        "permission-denied"
      ) {

        console.warn(
          "Permission denied na primeira tentativa. Renovando autenticação…"
        );


        if (
          auth.currentUser
        ) {

          await getIdToken(
            auth.currentUser,
            true
          );
        }


        /*
         * Pequeno intervalo para permitir
         * que o estado de autenticação seja
         * propagado pelo SDK.
         */

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              250
            )
        );


        await setDoc(
          doc(MSGS, id),
          messageData
        );

      } else {

        throw firstError;
      }
    }


    /*
     * Limpeza da interface.
     */

    input.value = "";

    input.style.height =
      "auto";


    selectedFile =
      null;


    const fileInput =
      $("fileInput");

    if (fileInput) {
      fileInput.value =
        "";
    }


    const sendBtn =
      $("sendBtn");

    if (sendBtn) {
      sendBtn.textContent =
        "➤";
    }


    $("replyBar")
      ?.classList
      .add("hidden");


    replyTarget =
      null;


    await saveStatus(
      false
    );


  } catch (e) {

    console.error(
      "Erro ao enviar mensagem:",
      e
    );


    /*
     * Se um anexo foi enviado para o
     * Storage mas a mensagem não chegou
     * ao Firestore, tentamos removê-lo.
     */

    if (
      media?.path
    ) {

      await deleteObject(
        ref(
          storage,
          media.path
        )
      ).catch(
        () => {}
      );
    }


    showToast(
      e?.message ||
      "Não foi possível enviar."
    );
  }
}

/* =========================================================
   DESCRIPTOGRAFAR MENSAGENS
========================================================= */

async function decryptMessages(raw) {

  const other =
    await getOtherUid();

  const out = [];

  for (const d of raw) {

    try {

      /*
       * Mensagens enviadas por nós precisam
       * ser descriptografadas usando a chave
       * do outro usuário.
       *
       * Mensagens recebidas usam a chave
       * pública do remetente.
       */

      const body =
        await decryptObject(
          d,
          d.senderUid === me.uid
            ? other
            : d.senderUid,
          d.id
        );


      body.seenBy =
        d.seenBy || [];

      body.senderUid =
        d.senderUid;

      body.senderNick =
        d.senderNick;

      body.createdAt =
        d.createdAt;

      body.createdAtMs =
        d.createdAtMs;

      body.edited =
        d.edited;

      body.reactions =
        d.reactions || {};


      out.push({
        id: d.id,
        data: body,
        raw: d
      });


    } catch (e) {

      /*
       * Se a mensagem não puder ser
       * descriptografada, não expomos
       * nenhum conteúdo parcial.
       */

      out.push({

        id: d.id,

        data: {

          text:
            "[mensagem não disponível neste dispositivo]",

          senderUid:
            d.senderUid,

          senderNick:
            d.senderNick,

          createdAt:
            d.createdAt,

          createdAtMs:
            d.createdAtMs,

          seenBy:
            d.seenBy || []
        },

        raw: d
      });
    }
  }

  return out;
}


/* =========================================================
   LISTENER DAS CHAVES
========================================================= */

function listenKeys() {

  /*
   * Remove listener anterior.
   */

  unsubscribeKeys?.();


  /*
   * Sempre que reconstruirmos os listeners,
   * a sessão volta temporariamente a ficar
   * "não pronta".
   */

  keysReady = false;

  sessionReady = false;

  updateSendState();


  unsubscribeKeys =
    onSnapshot(

      KEYS,

      snap => {

        /*
         * Reconstrói o cache de chaves.
         */

        keyCache =
          new Map();


        snap.forEach(
          d =>
            keyCache.set(
              d.id,
              d.data()
            )
        );


        /*
         * Se as chaves mudaram, o segredo
         * compartilhado anterior não deve
         * ser reutilizado.
         */

        sharedSecretCache.clear();


        /*
         * Verifica se o outro usuário
         * já publicou sua chave pública.
         */

        const other =
          [...keyCache.keys()]
            .find(
              x =>
                x !== me.uid
            );


        if (!other) {

          keysReady = false;

          if (
            connectionState !==
              "offline" &&
            connectionState !==
              "reconnecting"
          ) {

            updateConnectionState(
              "Aguardando o outro dispositivo…"
            );
          }

          updateSendState();

          return;
        }


        /*
         * A chave do outro dispositivo
         * está disponível.
         */

        keysReady = true;


        if (
          connectionState ===
          "online"
        ) {

          updateConnectionState(
            "Conexão cifrada • " +
            (
              keyCache.get(
                other
              )?.nick ||
              "online"
            )
          );
        }


        checkSessionReady();
      },


      error => {

        console.error(
          "LISTENER DE CHAVES:",
          error
        );


        keysReady = false;

        sessionReady = false;

        updateSendState();


        if (
          error?.code ===
          "permission-denied"
        ) {

          connectionState =
            "error";

          updateConnectionState(
            "problema de autorização"
          );

        } else {

          connectionState =
            "reconnecting";

          updateConnectionState(
            "reconectando…"
          );
        }
      }
    );
}


/* =========================================================
   LISTENER DAS MENSAGENS
========================================================= */

function listenMessages() {

  /*
   * Remove listener anterior.
   */

  unsubscribeMessages?.();


  /*
   * A sessão deixa temporariamente
   * de estar pronta durante a reconstrução.
   */

  messagesReady = false;

  sessionReady = false;

  updateSendState();


  const q =
    query(
      MSGS,
      orderBy(
        "createdAtMs",
        "asc"
      ),
      limit(500)
    );


  unsubscribeMessages =
    onSnapshot(

      q,

      async snap => {

        /*
         * Listener respondeu.
         * Isso significa que o Firebase
         * conseguiu ler a coleção.
         */

        messageListenerRetryCount =
          0;


        connectionState =
          "online";


        const raw = [];


        snap.forEach(
          d =>
            raw.push({
              id: d.id,
              ...d.data()
            })
        );


        /*
         * Descriptografa as mensagens
         * antes de liberar completamente
         * a interface.
         */

        messages =
          await decryptMessages(
            raw
          );


        await renderMessages();


        /*
         * Agora sabemos que o listener
         * de mensagens está efetivamente
         * operacional.
         */

        messagesReady = true;


        checkSessionReady();


        /*
         * Essas operações não podem impedir
         * o recebimento das mensagens.
         */

        markSeen()
          .catch(
            () => {}
          );


        expireOldMessages()
          .catch(
            () => {}
          );
      },


      error => {

        console.error(
          "LISTENER DE MENSAGENS:",
          {
            code:
              error?.code,

            message:
              error?.message
          }
        );


        messagesReady = false;

        sessionReady = false;

        updateSendState();


        /*
         * Permission denied é tratado
         * separadamente.
         */

        if (
          error?.code ===
          "permission-denied"
        ) {

          connectionState =
            "error";

          updateConnectionState(
            "problema de autorização"
          );

          showToast(
            "O Firebase recusou o acesso à conversa."
          );

          return;
        }


        /*
         * Outros erros podem ser
         * temporários.
         */

        connectionState =
          "reconnecting";


        updateConnectionState(
          "reconectando…"
        );


        if (
          messageListenerRetry
        ) {

          clearTimeout(
            messageListenerRetry
          );
        }


        /*
         * Backoff progressivo:
         *
         * 2s
         * 4s
         * 8s
         * 16s
         * 30s máximo
         */

        const delay =
          Math.min(
            30000,
            2000 *
              Math.pow(
                2,
                messageListenerRetryCount
              )
          );


        messageListenerRetryCount++;


        messageListenerRetry =
          setTimeout(
            () => {

              listenMessages();

            },
            delay
          );
      }
    );
}


/* =========================================================
   MARCAR MENSAGENS COMO LIDAS
========================================================= */

async function markSeen() {

  if (!me) return;


  for (
    const m of messages
  ) {

    if (
      m.data.senderUid !==
        me.uid &&
      !(
        m.data.seenBy || []
      ).includes(
        me.uid
      )
    ) {

      updateDoc(
        doc(
          MSGS,
          m.id
        ),
        {
          seenBy:
            arrayUnion(
              me.uid
            )
        }
      ).catch(
        () => {}
      );
    }
  }
}


/* =========================================================
   EXPIRAÇÃO DAS MENSAGENS
========================================================= */

async function expireOldMessages() {

  if (!ttlSeconds) {
    return;
  }


  const now =
    Date.now();


  for (
    const m of messages
  ) {

    const t =
      m.data.createdAtMs ||
      0;


    if (
      t &&
      now - t >
        ttlSeconds * 1000 &&
      m.raw?.senderUid ===
        me.uid
    ) {

      deleteMessage(
        m
      );
    }
  }
}


/* =========================================================
   LISTENER DE STATUS
========================================================= */

function listenStatus() {

  /*
   * Remove listener anterior.
   */

  unsubscribeStatus?.();


  statusReady = false;

  sessionReady = false;

  updateSendState();


  unsubscribeStatus =
    onSnapshot(

      STATUS,

      snap => {

        const other =
          [...snap.docs]
            .map(
              d =>
                d.data()
            )
            .find(
              x =>
                x.uid !==
                me.uid
            );


        /*
         * O listener respondeu.
         * Mesmo que o outro usuário ainda
         * não tenha publicado status, o
         * listener está funcional.
         */

        statusReady = true;


        if (!other) {

          if (
            connectionState !==
              "offline" &&
            connectionState !==
              "reconnecting"
          ) {

            updateConnectionState(
              "Conversa cifrada"
            );
          }


          checkSessionReady();

          return;
        }


        const active =
          other.lastActive?.toMillis
            ? Date.now() -
                other.lastActive.toMillis() <
              90000
            : false;


        if (
          connectionState ===
          "offline"
        ) {

          updateConnectionState(
            "sem conexão"
          );


          checkSessionReady();

          return;
        }


        if (
          connectionState ===
          "reconnecting"
        ) {

          updateConnectionState(
            "reconectando…"
          );


          checkSessionReady();

          return;
        }


        if (
          connectionState ===
          "error"
        ) {

          updateConnectionState(
            "problema de conexão"
          );


          checkSessionReady();

          return;
        }


        updateConnectionState(
          other.typing
            ? "está a escrever…"
            : (
                active
                  ? "online"
                  : "offline"
              )
        );


        checkSessionReady();
      },


      error => {

        console.error(
          "LISTENER DE STATUS:",
          error
        );


        statusReady = false;

        sessionReady = false;

        updateSendState();


        if (
          error?.code ===
          "permission-denied"
        ) {

          connectionState =
            "error";

          updateConnectionState(
            "problema de autorização"
          );

        } else {

          connectionState =
            "reconnecting";

          updateConnectionState(
            "reconectando…"
          );
        }
      }
    );
}


/* =========================================================
   RECONEXÃO — INTERNET VOLTOU
========================================================= */

window.addEventListener(
  "online",
  async () => {

    connectionState =
      "reconnecting";

    updateConnectionState(
      "reconectando…"
    );


    sessionReady = false;

    keysReady = false;

    messagesReady = false;

    statusReady = false;

    updateSendState();


    showToast(
      "Conexão restaurada. Sincronizando…"
    );


    messageListenerRetryCount =
      0;


    /*
     * Primeiro damos ao navegador
     * um pequeno intervalo para estabilizar
     * a conexão.
     */

    setTimeout(
      async () => {

        try {

          if (
            auth.currentUser
          ) {

            await getIdToken(
              auth.currentUser,
              true
            );
          }

        } catch (e) {

          console.warn(
            "Token ainda não pôde ser atualizado:",
            e
          );
        }


        /*
         * Reconstrói os três listeners.
         */

        listenKeys();

        listenMessages();

        listenStatus();

      },
      500
    );
  }
);


/* =========================================================
   RECONEXÃO — INTERNET CAIU
========================================================= */

window.addEventListener(
  "offline",
  () => {

    connectionState =
      "offline";


    sessionReady =
      false;


    updateSendState();


    updateConnectionState(
      "sem conexão"
    );


    showToast(
      "Você está sem conexão."
    );
  }
);


/* =========================================================
   INICIALIZAÇÃO DA SESSÃO
========================================================= */

async function start() {

  /*
   * Começamos sempre como
   * "não pronto".
   */

  resetSessionState();


  /*
   * Verifica autenticação.
   */

  await verifyMembership();


  /*
   * Renova o token antes das primeiras
   * operações Firestore.
   */

  if (
    auth.currentUser
  ) {

    await getIdToken(
      auth.currentUser,
      true
    );
  }


  /*
   * Recupera ou cria a identidade
   * criptográfica local.
   */

  await ensureIdentity();


  /*
   * Avatar.
   */

  if ($("myAvatar")) {

    $("myAvatar").textContent =
      initials(myNick);
  }


  /*
   * Interface principal.
   */

  $("authScreen")
    ?.classList
    .add("hidden");

  $("header")
    ?.classList
    .remove("hidden");

  $("footer")
    ?.classList
    .remove("hidden");


  /*
   * Enquanto os listeners não responderem,
   * o botão de envio permanece desabilitado.
   */

  sessionReady =
    false;

  updateSendState();


  /*
   * Inicia os listeners.
   */

  listenKeys();

  listenMessages();

  listenStatus();


  /*
   * Publica nosso status.
   */

  await saveStatus(
    false
  );


  /*
   * PIN.
   */

  await loadPin();

  setupPinpad();


  if ($("biometricBtn")) {

    $("biometricBtn").textContent =
      localStorage.getItem(
        "ep_biometric_cred"
      )
        ? "Desbloquear com biometria"
        : "Ativar biometria deste dispositivo";
  }


  /*
   * Primeiro acesso:
   * pede criação do PIN.
   */

  if (!pinReady) {

    showToast(
      "Crie um PIN de 6 dígitos para proteger este dispositivo."
    );

    $("lockScreen")
      ?.classList
      .remove("hidden");
  }
}

/* =========================================================
   LOGIN
========================================================= */

let startingSession = false;


if ($("authForm")) {

  $("authForm").onsubmit =
    async e => {

      e.preventDefault();


      $("authError").textContent =
        "";


      const email =
        $("email").value.trim();


      const password =
        $("password").value;


      const nickname =
        $("nickname").value.trim();


      if (!nickname) {

        $("authError").textContent =
          "Informe um nome/apelido para este dispositivo.";

        return;
      }


      /*
       * Guardamos o apelido temporariamente.
       *
       * O Firebase conclui o login de forma
       * assíncrona e onAuthStateChanged será
       * o único ponto que inicia a sessão.
       */

      sessionStorage.setItem(
        "ep_pending_nick",
        nickname
      );


      try {

        await signInWithEmailAndPassword(
          auth,
          email,
          password
        );

      } catch (err) {

        sessionStorage.removeItem(
          "ep_pending_nick"
        );


        console.error(
          "Falha no login:",
          err
        );


        if (
          err.code ===
          "auth/invalid-credential"
        ) {

          $("authError").textContent =
            "E-mail ou senha inválidos.";

        } else {

          $("authError").textContent =
            err.message ||
            "Não foi possível entrar.";
        }
      }
    };
}


/* =========================================================
   ESTADO DE AUTENTICAÇÃO
========================================================= */

onAuthStateChanged(
  auth,
  async user => {

    /*
     * Usuário saiu.
     */

    if (!user) {

      me = null;

      sessionReady =
        false;

      keysReady =
        false;

      messagesReady =
        false;

      statusReady =
        false;

      updateSendState();

      return;
    }


    /*
     * Evita inicializar a mesma sessão
     * duas vezes.
     */

    if (
      startingSession ||
      me?.uid === user.uid
    ) {

      return;
    }


    startingSession =
      true;


    me = user;


    /*
     * Recupera apelido temporário.
     */

    const pendingNick =
      sessionStorage.getItem(
        "ep_pending_nick"
      );


    /*
     * Se já conhecemos o usuário neste
     * dispositivo, podemos recuperar o
     * apelido salvo localmente.
     */

    myNick =
      pendingNick ||
      localStorage.getItem(
        "ep_nick_" +
        me.uid
      ) ||
      "";


    /*
     * Sem apelido, não iniciamos a sessão.
     */

    if (!myNick) {

      startingSession =
        false;

      me = null;


      await signOut(
        auth
      ).catch(
        () => {}
      );


      $("authScreen")
        ?.classList
        .remove("hidden");


      return;
    }


    /*
     * Salva o apelido neste dispositivo.
     */

    localStorage.setItem(
      "ep_nick_" +
      me.uid,
      myNick
    );


    sessionStorage.removeItem(
      "ep_pending_nick"
    );


    try {

      /*
       * Inicia a sessão completa.
       */

      await start();


    } catch (e) {

      console.error(
        "Falha ao iniciar sessão segura:",
        e
      );


      const msg =
        e?.message ||
        "Não foi possível iniciar a sessão segura.";


      me = null;


      sessionReady =
        false;


      updateSendState();


      startingSession =
        false;


      await signOut(
        auth
      ).catch(
        () => {}
      );


      $("authScreen")
        ?.classList
        .remove("hidden");


      $("authError").textContent =
        "Não foi possível iniciar a sessão segura: " +
        msg;
    }


    startingSession =
      false;
  }
);


/* =========================================================
   BOTÃO ENVIAR
========================================================= */

if ($("sendBtn")) {

  $("sendBtn").onclick =
    () => {

      /*
       * Evita múltiplos envios simultâneos
       * enquanto uma mensagem ainda está
       * sendo processada.
       */

      if (
        $("sendBtn").dataset.sending ===
        "1"
      ) {
        return;
      }


      sendMessage();
    };
}


/* =========================================================
   CAMPO DE MENSAGEM
========================================================= */

if ($("messageInput")) {

  $("messageInput").addEventListener(
    "keydown",
    e => {

      /*
       * Enter sozinho envia.
       *
       * Shift + Enter cria nova linha.
       */

      if (
        e.key === "Enter" &&
        !e.shiftKey
      ) {

        e.preventDefault();

        sendMessage();
      }
    }
  );


  $("messageInput").addEventListener(
    "input",
    () => {

      const x =
        $("messageInput");


      /*
       * Ajuste automático da altura.
       */

      x.style.height =
        "auto";


      x.style.height =
        Math.min(
          x.scrollHeight,
          120
        ) + "px";


      /*
       * Indica que estamos digitando.
       */

      saveStatus(
        true
      );


      clearTimeout(
        window.typingTimer
      );


      window.typingTimer =
        setTimeout(
          () =>
            saveStatus(
              false
            ),
          2500
        );
    }
  );
}


/* =========================================================
   ANEXOS
========================================================= */

if ($("attachBtn")) {

  $("attachBtn").onclick =
    () =>
      $("fileInput")?.click();
}


if ($("fileInput")) {

  $("fileInput").onchange =
    e => {

      selectedFile =
        e.target.files?.[0] ||
        null;


      if (selectedFile) {

        showToast(
          `${selectedFile.name} pronto para envio cifrado.`
        );
      }
    };
}


/* =========================================================
   EMOJIS
========================================================= */

if ($("emojiBtn")) {

  $("emojiBtn").onclick =
    () => {

      const panel =
        $("emojiPanel");


      if (!panel) {
        return;
      }


      panel.classList.toggle(
        "hidden"
      );


      /*
       * Só cria o conteúdo uma vez.
       */

      if (!panel.innerHTML) {

        panel.innerHTML =
          EMOJIS
            .map(
              emoji =>
                `<button type="button">${emoji}</button>`
            )
            .join("");
      }


      panel
        .querySelectorAll(
          "button"
        )
        .forEach(
          button => {

            button.onclick =
              () => {

                const input =
                  $("messageInput");


                if (!input) {
                  return;
                }


                const start =
                  input.selectionStart;


                const end =
                  input.selectionEnd;


                input.setRangeText(
                  button.textContent,
                  start,
                  end,
                  "end"
                );


                input.focus();
              };
          }
        );
    };
}


/* =========================================================
   BUSCA
========================================================= */

if ($("searchBtn")) {

  $("searchBtn").onclick =
    () =>
      $("searchBar")
        ?.classList
        .toggle("hidden");
}


if ($("searchInput")) {

  $("searchInput").oninput =
    e => {

      searchText =
        e.target.value;


      renderMessages();
    };
}


/* =========================================================
   CONFIGURAÇÕES
========================================================= */

if ($("settingsBtn")) {

  $("settingsBtn").onclick =
    () => {

      $("settingsModal")
        ?.classList
        .remove("hidden");


      if ($("autoLock")) {

        $("autoLock").checked =
          localStorage.getItem(
            "ep_auto_lock"
          ) === "1";
      }


      if ($("safeNotifications")) {

        $("safeNotifications").checked =
          localStorage.getItem(
            "ep_safe_notifications"
          ) !== "0";
      }


      if ($("ttl")) {

        $("ttl").value =
          String(
            ttlSeconds
          );
      }
    };
}


if ($("closeSettings")) {

  $("closeSettings").onclick =
    () =>
      $("settingsModal")
        ?.classList
        .add("hidden");
}


if ($("autoLock")) {

  $("autoLock").onchange =
    e =>
      localStorage.setItem(
        "ep_auto_lock",
        e.target.checked
          ? "1"
          : "0"
      );
}


if ($("safeNotifications")) {

  $("safeNotifications").onchange =
    e =>
      localStorage.setItem(
        "ep_safe_notifications",
        e.target.checked
          ? "1"
          : "0"
      );
}


if ($("ttl")) {

  $("ttl").onchange =
    e => {

      ttlSeconds =
        Number(
          e.target.value
        );


      localStorage.setItem(
        "ep_ttl",
        String(
          ttlSeconds
        )
      );
    };
}


/* =========================================================
   ESCONDER AGORA / MODO DISFARCE
========================================================= */

if ($("hideNow")) {

  $("hideNow").onclick =
    () => {

      $("settingsModal")
        ?.classList
        .add("hidden");

      enterPanic();
    };
}


/* =========================================================
   LOGOUT
========================================================= */

if ($("logoutBtn")) {

  $("logoutBtn").onclick =
    async () => {

      try {

        await saveStatus(
          false
        );

      } catch (e) {

        console.warn(
          "Não foi possível atualizar o status antes do logout:",
          e
        );
      }


      /*
       * Remove listeners.
       */

      unsubscribeMessages?.();

      unsubscribeKeys?.();

      unsubscribeStatus?.();


      /*
       * Cancela tentativa de reconexão.
       */

      if (
        messageListenerRetry
      ) {

        clearTimeout(
          messageListenerRetry
        );

        messageListenerRetry =
          null;
      }


      /*
       * Marca a sessão como encerrada.
       */

      sessionReady =
        false;

      keysReady =
        false;

      messagesReady =
        false;

      statusReady =
        false;

      updateSendState();


      /*
       * Sai do Firebase.
       */

      await signOut(
        auth
      );


      /*
       * Recarrega a aplicação.
       */

      location.reload();
    };
}


/* =========================================================
   FIXAÇÃO
========================================================= */

if ($("pinned")) {

  $("pinned").onclick =
    () => {};
}


/* =========================================================
   FECHAR MENUS
========================================================= */

document.addEventListener(
  "click",
  () => {

    document
      .querySelectorAll(
        ".menu"
      )
      .forEach(
        x => x.remove()
      );
  }
);


/* =========================================================
   VISIBILITY CHANGE
========================================================= */

window.addEventListener(
  "visibilitychange",
  () => {

    if (
      document.hidden
    ) {

      /*
       * Ao sair da aba, informa que não
       * estamos ativos.
       */

      saveStatus(
        false
      );

    } else {

      /*
       * Ao retornar, atualiza atividade
       * e marca mensagens como vistas.
       */

      updateActivity();

      markSeen()
        .catch(
          () => {}
        );


      /*
       * Se a página voltou e a sessão
       * deixou de estar pronta por algum
       * motivo, reconstruímos os listeners.
       */

      if (
        me &&
        !sessionReady &&
        navigator.onLine
      ) {

        connectionState =
          "reconnecting";

        updateConnectionState(
          "reconectando…"
        );


        listenKeys();

        listenMessages();

        listenStatus();
      }
    }
  }
);


/* =========================================================
   PAGEHIDE
========================================================= */

window.addEventListener(
  "pagehide",
  () => {

    /*
     * Não fazemos signOut aqui.
     *
     * O Firebase Auth deve preservar
     * a sessão normalmente para que
     * Ctrl+R não force novo login.
     */

    saveStatus(
      false
    );
  }
);


/* =========================================================
   SERVICE WORKER
========================================================= */

if (
  "serviceWorker" in navigator
) {

  navigator.serviceWorker
    .register(
      "./sw.js",
      {
        /*
         * Fundamental durante o
         * desenvolvimento para evitar
         * que o próprio sw.js seja
         * reutilizado do cache.
         */
        updateViaCache: "none"
      }
    )
    .then(
      registration => {

        /*
         * Verifica imediatamente se
         * existe uma versão nova.
         */

        registration.update();

      }
    )
    .catch(
      error => {

        console.warn(
          "Service Worker:",
          error
        );
      }
    );
}


/* =========================================================
   FIM DO APP.JS
========================================================= */
