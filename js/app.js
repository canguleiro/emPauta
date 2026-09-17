    import {
      initializeApp
    } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

    /* V20 — CrIArt como modo disfarce automático somente no mobile; desktop abre direto no chat. */

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

    // Controle para impedir que a sessão Firebase seja inicializada duas vezes.
    let startingSession = false;

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

    // Notificações do sistema (somente mobile).
    let notificationInitialized = false;
    let lastNotifiedMessageIds = new Set();

    let sessionInitPromise = null;
    let sessionInitResolve = null;


    /* =========================================================
       EMOJIS
    ========================================================= */

    const EMOJIS = [
      // Rostos e emoções
      "😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚",
      "😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🤩","🥳","😏","😒","😞","😔","😟","😕","🙁","☹️",
      "😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓",
      "🤗","🤔","🫡","🤭","🤫","🤥","😶","😐","😑","😬","🙄","😯","😦","😧","😮","😲","🥱","😴","🤤","😪",
      "😵","🤐","🥴","🤢","🤮","🤧","😷","🤒","🤕","🤑","🤠","👻","💀","☠️","👽","🤖","💩","😈","👿","🎃",

      // Gestos e pessoas
      "👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉","👆","👇","☝️","✍️",
      "👏","🙌","👐","🤲","🤝","🙏","💪","🫶","👊","✊","🤛","🤜","🫵","👀","👁️","🧠","👂","👃","💋","👄",
      "❤️","🩷","🧡","💛","💚","💙","🩵","💜","🖤","🩶","🤍","🤎","💔","❤️‍🔥","❣️","💕","💞","💓","💗","💖",
      "💘","💝","💟","💌","💯","💢","💥","💫","💦","💨","💬","🗨️","🗯️","💭","🕊️","✨","⭐","🌟","💫","🔥",

      // Natureza e animais
      "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐒","🐔",
      "🐧","🐦","🐤","🐣","🐥","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🦋","🐌","🐞","🐜","🕷️","🐢",
      "🐍","🦎","🦖","🦕","🐙","🦑","🦀","🦞","🐠","🐟","🐡","🦈","🐬","🐳","🐋","🌸","🌺","🌻","🌹","🌷",
      "🌱","🌿","🍀","🍁","🍂","🍃","🌴","🌵","🌳","🌲","☀️","🌤️","⛅","🌧️","⛈️","🌩️","❄️","☃️","🌈","🌙",

      // Comidas e bebidas
      "🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍒","🍑","🥭","🍍","🥝","🍅","🥑","🥕","🌽","🥔","🍞",
      "🥐","🥨","🧀","🍔","🍟","🍕","🌭","🌮","🌯","🥗","🍿","🍣","🍤","🍚","🍜","🍝","🍰","🎂","🍪","🍫",
      "🍩","🍦","🍨","☕","🍵","🧃","🥤","🧋","🍹","🍸","🍷","🍺","🥂","🍾","🍽️","🥄","🍴","🔪","🫖","🧊",

      // Atividades, viagem e objetos
      "⚽","🏀","🏈","⚾","🎾","🏐","🏆","🥇","🥈","🥉","🎯","🎮","🎲","🎸","🎵","🎶","🎤","🎬","🎨","📚",
      "📖","📝","✏️","📌","📍","📎","🔗","💻","🖥️","⌨️","🖱️","📱","☎️","📞","📷","📸","🎥","📺","📻","🔊",
      "🔔","🔕","💡","🔦","🔋","🔌","💾","📁","📂","📄","📃","📋","📊","📈","📉","🗂️","🗃️","🗑️","✉️","📧",
      "🔒","🔓","🔐","🔑","🗝️","🛡️","⚙️","🔧","🔨","🧰","🧲","🚗","🚕","🚌","🚓","🚑","✈️","🚀","🚲","🏠",

      // Símbolos e reações rápidas
      "👍","👎","☝️","✋","✅","❌","❗","❕","‼️","⁉️","❓","❔","⚠️","🚨","⛔","🚫","🔴","🟠","🟡","🟢",
      "🔵","🟣","⚫","⚪","🟤","🔶","🔷","🔺","🔻","🔸","🔹","✔️","☑️","➕","➖","✖️","➗","♻️","🔄","🔃",
      "⬆️","⬇️","⬅️","➡️","↗️","↘️","↙️","↖️","⏰","⌛","⏳","📅","📆","🕐","🕑","🕒","🕓","🕔","🕕","🕖",
      "🕗","🕘","🕙","🕚","🕛","🎉","🎊","🎈","🎁","🎀","🪅","🚀","⭐","🌟","💯","🏅","🏆","🥳","😎","🤝"
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
       BIOMETRIA / WEBAUTHN
    ========================================================= */

    function isMobileLayout() {
      return window.matchMedia("(max-width: 767px)").matches;
    }


    async function biometricAvailable() {

      if (!isMobileLayout()) return false;

      if (!window.isSecureContext) return false;

      if (!window.PublicKeyCredential || !navigator.credentials) {
        return false;
      }

      try {
        if (
          typeof PublicKeyCredential
            .isUserVerifyingPlatformAuthenticatorAvailable ===
          "function"
        ) {
          return await PublicKeyCredential
            .isUserVerifyingPlatformAuthenticatorAvailable();
        }

        return true;

      } catch (e) {
        console.warn("Verificação de biometria:", e);
        return false;
      }
    }


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

      while (s.length % 4) {
        s += "=";
      }

      return unb64(s);
    }


    async function registerBiometric() {

      if (!isMobileLayout()) {
        return;
      }

      /*
       * IMPORTANTE: não fazemos await antes de credentials.create().
       * Em vários navegadores mobile, o WebAuthn exige que create()
       * permaneça dentro da ativação do gesto do usuário. Um await
       * anterior pode fazer o navegador perder essa ativação e o toque
       * aparentar não fazer nada.
       */
      if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials) {
        showToast("A biometria não está disponível neste dispositivo. Use o PIN.");
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
                name: "CrIArt",
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
                  myNick || "Usuário CrIArt"
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
                authenticatorAttachment: "platform",
                residentKey: "preferred",
                userVerification: "required"
              },

              timeout: 60000,
              attestation: "none"
            }
          });

        if (!credential) {
          showToast("Não foi possível cadastrar a biometria.");
          return;
        }

        localStorage.setItem(
          "ep_biometric_cred",
          base64url(credential.rawId)
        );

        showToast(
          "Biometria ativada neste dispositivo."
        );

        updateBiometricButton();
        unlockApp();

      } catch (e) {

        console.warn("WebAuthn/biometria:", e);

        if (e?.name === "NotAllowedError") {
          showToast("A autenticação biométrica foi cancelada.");
        } else if (e?.name === "SecurityError") {
          showToast("O navegador bloqueou a biometria neste endereço.");
        } else {
          showToast("Não foi possível ativar a biometria neste dispositivo.");
        }
      }
    }


    async function unlockWithBiometric() {

      if (!isMobileLayout()) {
        return;
      }

      const id =
        localStorage.getItem("ep_biometric_cred");

      if (!id) {
        await registerBiometric();
        return;
      }

      /*
       * Não aguardamos biometricAvailable() antes de credentials.get(),
       * pois o await pode consumir a ativação do toque no mobile.
       */
      if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials) {
        showToast("A biometria não está disponível. Use o PIN.");
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

              rpId: location.hostname,

              allowCredentials: [
                {
                  type: "public-key",
                  id: fromBase64url(id)
                }
              ],

              userVerification: "required",
              timeout: 60000
            }
          });

        if (credential) {
          unlockApp();
          showToast("Acesso autorizado.");
        }

      } catch (e) {

        console.warn("WebAuthn/biometria:", e);

        if (e?.name === "NotAllowedError") {
          showToast("A autenticação biométrica foi cancelada.");
        } else {
          showToast("Biometria não autorizada. Use o PIN.");
        }
      }
    }


    function updateBiometricButton() {

      const button = $("biometricBtn");

      if (!button) return;

      if (!isMobileLayout()) {
        button.classList.add("desktop-only-hidden");
        button.setAttribute("aria-hidden", "true");
        return;
      }

      button.classList.remove("desktop-only-hidden");
      button.removeAttribute("aria-hidden");

      button.textContent =
        localStorage.getItem("ep_biometric_cred")
          ? "Desbloquear com biometria"
          : "Usar biometria neste dispositivo";
    }


    function setupBiometricButton() {

      const button = $("biometricBtn");

      /*
       * O botão pode existir somente depois da renderização da tela.
       * Mantemos a configuração visual quando ele já existe, mas o
       * acionamento também é delegado no document para funcionar
       * mesmo se a tela for reconstruída dinamicamente.
       */
      if (button) {
        updateBiometricButton();
      }

      if (setupBiometricButton.bound) {
        return;
      }

      setupBiometricButton.bound = true;

      document.addEventListener("click", async event => {
        const target = event.target?.closest?.("#biometricBtn");

        if (!target || !isMobileLayout()) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        target.disabled = true;

        try {
          if (localStorage.getItem("ep_biometric_cred")) {
            await unlockWithBiometric();
          } else {
            await registerBiometric();
          }
        } finally {
          target.disabled = false;
          updateBiometricButton();
        }
      }, true);
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



    /* =========================================================
       MODO DISFARCE / PÂNICO
    ========================================================= */

    /*
     * Saída segura do modo disfarce.
     * O botão de menu NÃO depende de uma função externa.
     * Se houver biometria cadastrada, solicita WebAuthn.
     * Caso contrário, abre o PIN do dispositivo.
     */
    async function authenticatePanicExit() {

      /*
       * O modo disfarce existe como camada mobile. No desktop,
       * não há autenticação biométrica para entrar no chat.
       */
      if (!isMobileLayout()) {
        leavePanic();
        return;
      }

      const biometricId =
        localStorage.getItem("ep_biometric_cred");

      if (biometricId) {

        if (window.isSecureContext && window.PublicKeyCredential && navigator.credentials) {

          try {

            const credential = await navigator.credentials.get({
              publicKey: {
                challenge:
                  crypto.getRandomValues(
                    new Uint8Array(32)
                  ),

                rpId: location.hostname,

                allowCredentials: [{
                  type: "public-key",
                  id: fromBase64url(biometricId)
                }],

                userVerification: "required",
                timeout: 60000
              }
            });

            if (credential) {
              leavePanic();
              unlockApp();
              showToast("Acesso autorizado.");
            }

            return;

          } catch (e) {

            console.warn("Saída biométrica do modo disfarce:", e);

            if (e?.name !== "NotAllowedError") {
              showToast("Biometria indisponível. Use o PIN.");
            }
          }
        }
      }

      /*
       * Falha, cancelamento ou ausência de biometria:
       * mantém a proteção e apresenta o PIN.
       */
      leavePanic();

      if (pinReady) {
        lockApp();
        showToast("Digite o PIN para voltar ao chat.");
      } else {
        pinBuffer = "";
        renderDots();
        $("lockScreen")?.classList.remove("hidden");
        showToast("Crie o PIN deste dispositivo para continuar.");
      }
    }

    function enterPanic() {

      const screen = $("panicScreen");

      if (!screen) return;

      screen.classList.remove("hidden");

      /*
       * NOVO MODO DISFARCE:
       *
       * Em vez do antigo portal de notícias, o disfarce agora
       * se comporta como um pequeno assistente de IA.
       *
       * A interface é realmente interativa:
       * - permite digitar;
       * - cria novas conversas;
       * - mantém um histórico local;
       * - permite editar mensagens;
       * - permite copiar respostas;
       * - possui respostas locais para funcionar sem API externa;
       * - mantém o botão de menu como porta discreta para o chat.
       *
       * O conteúdo digitado neste modo NÃO é enviado para uma IA
       * externa por esta implementação.
       */

      if (!screen.dataset.aiBuilt) {

        screen.innerHTML = `
          <div class="ai-disguise-app">

            <header class="ai-topbar">
              <div class="ai-brand">

                <button
                  id="aiHistoryToggle"
                  class="ai-icon-button ai-history-toggle"
                  type="button"
                  title="Abrir conversas"
                  aria-label="Abrir conversas"
                >☰</button>

                <span class="ai-brand-mark">✦</span>

                <div class="ai-brand-copy">
                  <strong>CrIArt</strong>
                  <small>Assistente de ideias</small>
                </div>

              </div>

              <div class="ai-top-actions">

                <button
                  id="aiChatModeTop"
                  class="ai-icon-button ai-settings-button"
                  type="button"
                  title="Abrir chat privado"
                  aria-label="Abrir chat privado"
                >⚙️</button>

              </div>
            </header>

            <div class="ai-layout">

              <div
                id="aiSidebarBackdrop"
                class="ai-sidebar-backdrop"
                aria-hidden="true"
              ></div>

              <aside class="ai-sidebar" id="aiSidebar">

                <div class="ai-sidebar-head">
                  <div class="ai-sidebar-title">Conversas</div>

                  <button
                    id="aiSidebarClose"
                    class="ai-sidebar-close"
                    type="button"
                    title="Fechar conversas"
                    aria-label="Fechar conversas"
                  >×</button>
                </div>

                <button
                  id="aiNewChat"
                  class="ai-new-chat"
                  type="button"
                >＋ Nova conversa</button>

                <div class="ai-history-label">Recentes</div>

                <div
                  id="aiHistory"
                  class="ai-history"
                  aria-label="Conversas recentes"
                ></div>

              </aside>

              <section class="ai-main">

                <div
                  id="aiConversation"
                  class="ai-conversation"
                  aria-live="polite"
                ></div>

                <div class="ai-composer-wrap">

                  <div class="ai-composer">

                    <textarea
                      id="aiInput"
                      rows="1"
                      maxlength="4000"
                      placeholder="Escreva uma mensagem..."
                      aria-label="Mensagem"
                    ></textarea>

                    <button
                      id="aiSend"
                      class="ai-send"
                      type="button"
                      title="Enviar"
                      aria-label="Enviar"
                      disabled
                    >↑</button>

                  </div>

                  <div class="ai-disclaimer">
                    Assistente pessoal · espaço local de escrita
                  </div>

                </div>

              </section>
            </div>
          </div>
        `;

        screen.dataset.aiBuilt = "1";


        /*
         * Estado local do assistente.
         *
         * Não usamos servidor nem API externa para o conteúdo
         * digitado no modo disfarce.
         */
        const storageKey =
          "ep_ai_disguise_chats";

        const activeKey =
          "ep_ai_disguise_active";


        let chats = [];

        try {

          chats =
            JSON.parse(
              localStorage.getItem(storageKey) ||
              "[]"
            );

          if (!Array.isArray(chats)) {
            chats = [];
          }

        } catch {

          chats = [];
        }


        let activeId =
          localStorage.getItem(activeKey);


        function makeId() {

          return (
            Date.now().toString(36) +
            Math.random()
              .toString(36)
              .slice(2, 8)
          );
        }


        function saveChats() {

          localStorage.setItem(
            storageKey,
            JSON.stringify(chats)
          );

          if (activeId) {
            localStorage.setItem(
              activeKey,
              activeId
            );
          }
        }


        function createChat() {

          const chat = {
            id: makeId(),
            title: "Nova conversa",
            messages: [],
            updatedAt: Date.now()
          };

          chats.unshift(chat);

          activeId =
            chat.id;

          saveChats();

          renderHistory();

          renderConversation();
        }


        function getActiveChat() {

          return chats.find(
            chat =>
              chat.id === activeId
          );
        }


        function ensureChat() {

          let chat =
            getActiveChat();

          if (!chat) {

            chat = {
              id: makeId(),
              title: "Nova conversa",
              messages: [],
              updatedAt: Date.now()
            };

            chats.unshift(chat);

            activeId =
              chat.id;

            saveChats();
          }

          return chat;
        }


        function escapeText(value) {

          return String(
            value ?? ""
          );
        }


        function renderHistory() {

          const history =
            $("aiHistory");

          if (!history) return;

          history.innerHTML = "";

          chats
            .slice(0, 12)
            .forEach(chat => {

              const row =
                document.createElement("div");

              row.className =
                "ai-history-row" +
                (chat.id === activeId ? " active" : "");

              const button =
                document.createElement("button");

              button.type = "button";
              button.className = "ai-history-item";
              button.textContent =
                chat.title || "Nova conversa";
              button.title =
                chat.title || "Nova conversa";

              button.onclick = () => {

                activeId = chat.id;
                saveChats();
                renderHistory();
                renderConversation();
              };

              const remove =
                document.createElement("button");

              remove.type = "button";
              remove.className = "ai-history-delete";
              remove.title = "Excluir conversa";
              remove.setAttribute("aria-label", "Excluir conversa");
              remove.textContent = "×";

              remove.onclick = event => {

                event.preventDefault();
                event.stopPropagation();
                deleteChat(chat.id);
              };

              row.appendChild(button);
              row.appendChild(remove);
              history.appendChild(row);
            });
        }


        function deleteChat(chatId) {

          const index =
            chats.findIndex(chat => chat.id === chatId);

          if (index < 0) return;

          const chat = chats[index];

          const label =
            chat.title || "Nova conversa";

          if (!window.confirm(`Excluir "${label}"?`)) {
            return;
          }

          chats.splice(index, 1);

          if (activeId === chatId) {
            activeId = chats[0]?.id || null;
          }

          saveChats();

          if (!chats.length) {
            createChat();
            return;
          }

          renderHistory();
          renderConversation();
          showToast("Conversa excluída.");
        }


        function deleteActiveChat() {

          const chat = getActiveChat();

          if (!chat) return;

          deleteChat(chat.id);
        }

        function renderConversation() {

          const conversation =
            $("aiConversation");

          if (!conversation) return;

          conversation.innerHTML = "";

          const chat =
            ensureChat();

          if (!chat.messages.length) {

            const welcome =
              document.createElement(
                "div"
              );

            welcome.className =
              "ai-welcome";

            welcome.innerHTML = `
              <div class="ai-welcome-icon">✦</div>
              <h1>Como posso ajudar?</h1>
              <p>
                Escreva, organize uma ideia, monte um texto
                ou simplesmente converse.
              </p>

              <div class="ai-suggestions">

                <button class="ai-suggestion" type="button"
                  data-ai-suggestion="Organize minhas ideias em tópicos">
                  Organizar ideias em tópicos
                </button>

                <button class="ai-suggestion" type="button"
                  data-ai-suggestion="Faça um resumo deste assunto">
                  Resumir um assunto
                </button>

                <button class="ai-suggestion" type="button"
                  data-ai-suggestion="Crie uma pauta para uma reunião">
                  Criar uma pauta
                </button>

                <button class="ai-suggestion" type="button"
                  data-ai-suggestion="Ajude a melhorar este texto">
                  Melhorar um texto
                </button>

              </div>
            `;

            conversation.appendChild(
              welcome
            );

            welcome
              .querySelectorAll(
                "[data-ai-suggestion]"
              )
              .forEach(
                button => {

                  button.onclick =
                    () => {

                      const input =
                        $("aiInput");

                      if (!input) return;

                      input.value =
                        button.dataset.aiSuggestion;

                      input.dispatchEvent(
                        new Event(
                          "input"
                        )
                      );

                      input.focus();
                    };
                }
              );

            return;
          }


          chat.messages.forEach(
            (message, index) => {

              const row =
                document.createElement(
                  "div"
                );

              row.className =
                "ai-message " +
                (
                  message.role === "user"
                    ? "user"
                    : "assistant"
                );


              const wrap =
                document.createElement(
                  "div"
                );


              const bubble =
                document.createElement(
                  "div"
                );

              bubble.className =
                "ai-message-bubble";

              bubble.textContent =
                escapeText(
                  message.text
                );

              wrap.appendChild(
                bubble
              );


              if (
                message.role ===
                "assistant"
              ) {

                const actions =
                  document.createElement(
                    "div"
                  );

                actions.className =
                  "ai-message-actions";


                const copy =
                  document.createElement(
                    "button"
                  );

                copy.type =
                  "button";

                copy.className =
                  "ai-message-action";

                copy.textContent =
                  "Copiar";

                copy.onclick =
                  async () => {

                    try {

                      await navigator
                        .clipboard
                        ?.writeText(
                          message.text
                        );

                      showToast(
                        "Texto copiado."
                      );

                    } catch {

                      showToast(
                        "Não foi possível copiar."
                      );
                    }
                  };


                actions.appendChild(
                  copy
                );

                wrap.appendChild(
                  actions
                );

              } else {

                const actions =
                  document.createElement(
                    "div"
                  );

                actions.className =
                  "ai-message-actions";


                const edit =
                  document.createElement(
                    "button"
                  );

                edit.type =
                  "button";

                edit.className =
                  "ai-message-action";

                edit.textContent =
                  "Editar";

                edit.onclick =
                  () => {

                    const input =
                      $("aiInput");

                    if (!input) return;

                    input.value =
                      message.text;

                    input.focus();

                    input.dispatchEvent(
                      new Event(
                        "input"
                      )
                    );

                    chat.messages.splice(
                      index,
                      1
                    );

                    saveChats();

                    renderConversation();
                  };


                actions.appendChild(
                  edit
                );

                wrap.appendChild(
                  actions
                );
              }


              row.appendChild(
                wrap
              );

              conversation.appendChild(
                row
              );
            }
          );


          conversation.scrollTop =
            conversation.scrollHeight;
        }


        function updateComposer() {

          const input =
            $("aiInput");

          const send =
            $("aiSend");

          if (!input || !send) return;

          send.disabled =
            !input.value.trim();
        }


        function autoResizeInput() {

          const input =
            $("aiInput");

          if (!input) return;

          input.style.height =
            "auto";

          input.style.height =
            Math.min(
              input.scrollHeight,
              115
            ) +
            "px";
        }


        /*
         * Respostas locais com aparência de assistente.
         *
         * O objetivo é manter o modo totalmente funcional
         * mesmo sem configurar uma API.
         */
        function generateLocalReply(text) {

          const normalized =
            text
              .toLowerCase()
              .trim();


          if (
            normalized.includes(
              "resum"
            )
          ) {

            return (
              "Claro. Envie o texto ou assunto completo e " +
              "posso organizar os pontos principais em uma " +
              "estrutura curta e objetiva."
            );
          }


          if (
            normalized.includes(
              "pauta"
            )
          ) {

            return (
              "Posso montar uma pauta. Uma estrutura simples seria:\\n\\n" +
              "1. Objetivo\\n" +
              "2. Contexto\\n" +
              "3. Pontos principais\\n" +
              "4. Encaminhamentos\\n" +
              "5. Próximos passos"
            );
          }


          if (
            normalized.includes(
              "organize"
            ) ||
            normalized.includes(
              "organizar"
            )
          ) {

            return (
              "Vamos organizar isso em etapas:\\n\\n" +
              "• Ideia principal\\n" +
              "• Informações importantes\\n" +
              "• Prioridades\\n" +
              "• Próximas ações\\n\\n" +
              "Se quiser, escreva o conteúdo e eu reorganizo."
            );
          }


          if (
            normalized.includes(
              "melhor"
            ) ||
            normalized.includes(
              "texto"
            )
          ) {

            return (
              "Posso melhorar o texto preservando sua ideia. " +
              "Cole o conteúdo completo e posso trabalhar " +
              "clareza, concisão, organização e tom."
            );
          }


          if (
            /^(oi|olá|ola|bom dia|boa tarde|boa noite)\b/.test(
              normalized
            )
          ) {

            return (
              "Olá! Estou aqui para ajudar. " +
              "Você pode escrever uma ideia, rascunho ou pergunta."
            );
          }


          if (
            normalized.endsWith("?")
          ) {

            return (
              "Entendi. Posso ajudar a organizar essa questão " +
              "e transformar a ideia em um texto ou plano mais claro."
            );
          }


          return (
            "Entendi. Posso ajudar a desenvolver essa ideia, " +
            "organizar o conteúdo ou transformar o rascunho " +
            "em um texto mais claro."
          );
        }


        async function sendMessage() {

          const input =
            $("aiInput");

          if (!input) return;

          const text =
            input.value.trim();

          if (!text) return;


          const chat =
            ensureChat();


          chat.messages.push({
            role: "user",
            text,
            at: Date.now()
          });


          if (
            chat.title ===
              "Nova conversa" ||
            !chat.title
          ) {

            chat.title =
              text.length > 34
                ? text.slice(0, 34) + "…"
                : text;
          }


          chat.updatedAt =
            Date.now();


          input.value =
            "";

          updateComposer();

          autoResizeInput();

          saveChats();

          renderHistory();

          renderConversation();


          /*
           * Pequeno intervalo para reproduzir a sensação
           * de processamento de um assistente.
           */
          const conversation =
            $("aiConversation");

          const typingRow =
            document.createElement(
              "div"
            );

          typingRow.className =
            "ai-message assistant";

          typingRow.innerHTML = `
            <div class="ai-message-bubble">
              <span class="ai-typing">
                <span></span><span></span><span></span>
              </span>
            </div>
          `;

          conversation?.appendChild(
            typingRow
          );

          if (conversation) {
            conversation.scrollTop =
              conversation.scrollHeight;
          }


          await new Promise(
            resolve =>
              setTimeout(
                resolve,
                450
              )
          );


          typingRow.remove();


          const reply =
            generateLocalReply(
              text
            );


          chat.messages.push({
            role: "assistant",
            text: reply,
            at: Date.now()
          });


          chat.updatedAt =
            Date.now();


          saveChats();

          renderHistory();

          renderConversation();
        }


        function startNewChat() {

          createChat();

          $("aiInput")
            ?.focus();
        }


        /*
         * Eventos.
         */
        $("aiNewChat")
          ?.addEventListener(
            "click",
            startNewChat
          );

        $("aiChatModeTop")
          ?.addEventListener(
            "click",
            authenticatePanicExit
          );


        /*
         * No mobile, a barra lateral funciona como um drawer.
         * No desktop ela permanece visível normalmente.
         */
        const aiSidebar =
          $("aiSidebar");

        const aiSidebarBackdrop =
          $("aiSidebarBackdrop");

        const aiHistoryToggle =
          $("aiHistoryToggle");

        const aiSidebarClose =
          $("aiSidebarClose");


        function openAiSidebar() {

          if (!aiSidebar) return;

          aiSidebar.classList.add("open");

          aiSidebarBackdrop
            ?.classList
            .add("open");

          aiSidebarBackdrop
            ?.setAttribute(
              "aria-hidden",
              "false"
            );
        }


        function closeAiSidebar() {

          if (!aiSidebar) return;

          aiSidebar.classList.remove("open");

          aiSidebarBackdrop
            ?.classList
            .remove("open");

          aiSidebarBackdrop
            ?.setAttribute(
              "aria-hidden",
              "true"
            );
        }


        aiHistoryToggle
          ?.addEventListener(
            "click",
            () => {

              if (
                aiSidebar?.classList.contains("open")
              ) {
                closeAiSidebar();
              } else {
                openAiSidebar();
              }

            }
          );


        aiSidebarClose
          ?.addEventListener(
            "click",
            closeAiSidebar
          );


        aiSidebarBackdrop
          ?.addEventListener(
            "click",
            closeAiSidebar
          );


        document.addEventListener(
          "keydown",
          event => {

            if (
              event.key === "Escape" &&
              aiSidebar?.classList.contains("open")
            ) {
              closeAiSidebar();
            }

          }
        );


        $("aiNewChat")
          ?.addEventListener(
            "click",
            () => {

              startNewChat();
              closeAiSidebar();

            }
          );


        const input =
          $("aiInput");

        input?.addEventListener(
          "input",
          () => {

            updateComposer();

            autoResizeInput();
          }
        );


        input?.addEventListener(
          "keydown",
          event => {

            if (
              event.key === "Enter" &&
              !event.shiftKey
            ) {

              event.preventDefault();

              if (
                !$("aiSend")?.disabled
              ) {
                sendMessage();
              }
            }
          }
        );


        $("aiSend")
          ?.addEventListener(
            "click",
            sendMessage
          );


        /*
         * O botão de engrenagem é a porta discreta para
         * o chat privado. A exclusão continua disponível
         * individualmente no histórico das conversas.
         */
        /*
         * Recupera a conversa anterior ou cria uma nova.
         */
        if (!getActiveChat()) {

          if (!chats.length) {

            createChat();

          } else {

            activeId =
              chats[0].id;

            saveChats();

            renderHistory();

            renderConversation();
          }

        } else {

          renderHistory();

          renderConversation();
        }


        updateComposer();

        autoResizeInput();
      }


      /*
       * O botão de configuração continua sendo a porta discreta
       * para o chat privado, inclusive ao reconstruir a tela.
       */
      const chatMode =
        $("aiChatModeTop");

      if (chatMode) {
        chatMode.onclick =
          authenticatePanicExit;
      }



      /*
       * Ao reabrir o modo, o foco não é colocado automaticamente
       * no campo. Isso mantém o comportamento natural de uma
       * página/aplicativo comum.
       */
    }

    function leavePanic() {

      $("panicScreen")
        ?.classList
        .add("hidden");

      $("panicText")?.blur();
    }


    if ($("panicBtn")) {
      $("panicBtn").onclick = enterPanic;
    }

    /* =========================================================
       UTILITÁRIOS DE ANEXOS
    ========================================================= */

    function getAttachmentIcon(
      fileName,
      mediaType
    ) {

      const ext =
        (fileName || "")
          .split(".")
          .pop()
          .toLowerCase();

      if (
        mediaType === "application/pdf" ||
        ext === "pdf"
      ) return "📕";

      if (
        ext === "doc" ||
        ext === "docx" ||
        mediaType.includes("word")
      ) return "📘";

      if (
        ext === "xls" ||
        ext === "xlsx" ||
        mediaType.includes("sheet")
      ) return "📗";

      if (
        ext === "ppt" ||
        ext === "pptx" ||
        mediaType.includes("presentation")
      ) return "📙";

      if (
        ext === "txt" ||
        mediaType.startsWith("text/")
      ) return "📄";

      if (
        ext === "zip" ||
        ext === "rar" ||
        ext === "7z"
      ) return "🗜️";

      return "📎";
    }


    /* =========================================================
       ABERTURA DE ANEXOS
    ========================================================= */

    function openAttachment(
      url,
      fileName,
      mediaType
    ) {

      /*
       * A abertura é feita diretamente por um link para o blob:
       * URL. Isso evita bloqueios comuns de popup quando
       * window.open() é usado depois de uma operação assíncrona.
       */
      const link =
        document.createElement("a");

      link.href =
        url;

      link.target =
        "_blank";

      link.rel =
        "noopener noreferrer";

      link.style.display =
        "none";

      document.body.appendChild(link);

      link.click();

      link.remove();
    }


    function formatAttachmentType(
      fileName,
      mediaType
    ) {

      const ext =
        (fileName || "")
          .split(".")
          .pop()
          .toUpperCase();

      if (
        ext &&
        ext !== fileName.toUpperCase()
      ) {
        return ext;
      }

      if (
        mediaType === "application/pdf"
      ) {
        return "PDF";
      }

      return mediaType || "Arquivo";
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

              const mediaType =
                d.media.type ||
                "application/octet-stream";

              const fileName =
                d.media.name ||
                "Anexo";

              let el;

              /*
               * IMAGENS
               *
               * Somente imagens são renderizadas
               * com <img>. Antes, qualquer arquivo
               * que não fosse áudio caía neste bloco,
               * fazendo PDF, DOCX, XLSX etc. aparecerem
               * como uma imagem quebrada.
               */
              if (
                mediaType.startsWith(
                  "image/"
                )
              ) {

                /*
                 * IMAGEM + AÇÕES
                 *
                 * A imagem continua sendo exibida normalmente,
                 * mas agora recebe também um botão Baixar.
                 */
                const imageAttachment =
                  document.createElement(
                    "div"
                  );

                imageAttachment.className =
                  "image-attachment";

                imageAttachment.style.position = "relative";
                imageAttachment.style.display = "inline-block";
                imageAttachment.style.maxWidth = "100%";

                el =
                  document.createElement(
                    "img"
                  );

                el.className =
                  "media";

                el.alt =
                  fileName;

                el.src = url;

                el.loading =
                  "lazy";

                el.style.display = "block";

                el.onclick =
                  () =>
                    openAttachment(
                      url,
                      fileName,
                      mediaType
                    );

                const imageActions =
                  document.createElement(
                    "div"
                  );

                imageActions.className =
                  "image-attachment-actions";

                imageActions.style.display = "flex";
                imageActions.style.justifyContent = "flex-end";
                imageActions.style.marginTop = "6px";

                const imageDownload =
                  document.createElement(
                    "a"
                  );

                imageDownload.href =
                  url;

                imageDownload.download =
                  fileName;

                imageDownload.textContent =
                  "Baixar";

                imageDownload.className =
                  "image-attachment-download";

                imageDownload.style.display = "inline-flex";
                imageDownload.style.alignItems = "center";
                imageDownload.style.justifyContent = "center";
                imageDownload.style.padding = "5px 10px";
                imageDownload.style.borderRadius = "8px";
                imageDownload.style.background = "rgba(0,0,0,.08)";
                imageDownload.style.color = "inherit";
                imageDownload.style.textDecoration = "none";
                imageDownload.style.fontSize = "12px";
                imageDownload.style.fontWeight = "600";

                imageActions.appendChild(
                  imageDownload
                );

                imageAttachment.appendChild(
                  el
                );

                imageAttachment.appendChild(
                  imageActions
                );

                el =
                  imageAttachment;

              } else if (
                mediaType.startsWith(
                  "audio/"
                )
              ) {

                el =
                  document.createElement(
                    "audio"
                  );

                el.controls = true;

                el.preload =
                  "metadata";

                el.src = url;

              } else if (
                mediaType.startsWith(
                  "video/"
                )
              ) {

                el =
                  document.createElement(
                    "video"
                  );

                el.className =
                  "media";

                el.controls = true;

                el.preload =
                  "metadata";

                el.src = url;

              } else {

                /*
                 * DOCUMENTOS E OUTROS ARQUIVOS
                 *
                 * PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX,
                 * TXT, ZIP e demais tipos não são
                 * convertidos em imagem. Criamos um
                 * cartão com nome, tipo, Abrir e Baixar.
                 */
                const attachment =
                  document.createElement(
                    "div"
                  );

                attachment.className =
                  "document-attachment";

                const icon =
                  document.createElement(
                    "div"
                  );

                icon.className =
                  "document-attachment-icon";

                icon.textContent =
                  getAttachmentIcon(
                    fileName,
                    mediaType
                  );

                const info =
                  document.createElement(
                    "div"
                  );

                info.className =
                  "document-attachment-info";

                const name =
                  document.createElement(
                    "div"
                  );

                name.className =
                  "document-attachment-name";

                name.textContent =
                  fileName;

                name.title =
                  fileName;

                const type =
                  document.createElement(
                    "div"
                  );

                type.className =
                  "document-attachment-type";

                type.textContent =
                  formatAttachmentType(
                    fileName,
                    mediaType
                  );

                info.appendChild(name);
                info.appendChild(type);

                const actions =
                  document.createElement(
                    "div"
                  );

                actions.className =
                  "document-attachment-actions";

                /*
                 * Ações dos documentos
                 *
                 * Os dois botões usam o mesmo tratamento visual
                 * do botão "Baixar" das imagens, com espaçamento
                 * entre eles para evitar que fiquem colados.
                 */
                actions.style.display = "flex";
                actions.style.alignItems = "center";
                actions.style.justifyContent = "flex-start";
                actions.style.gap = "8px";
                actions.style.marginTop = "8px";
                actions.style.flexWrap = "wrap";

                const styleDocumentAction = (button) => {
                  button.style.display = "inline-flex";
                  button.style.alignItems = "center";
                  button.style.justifyContent = "center";
                  button.style.padding = "5px 10px";
                  button.style.borderRadius = "8px";
                  button.style.background = "rgba(0,0,0,.08)";
                  button.style.color = "inherit";
                  button.style.textDecoration = "none";
                  button.style.fontSize = "12px";
                  button.style.fontWeight = "600";
                  button.style.lineHeight = "1.2";
                  button.style.cursor = "pointer";
                  button.style.border = "0";
                  button.style.boxSizing = "border-box";
                };

                /*
                 * Usamos um <a target="_blank"> em vez de
                 * window.open() disparado por JavaScript.
                 * Isso é mais confiável para blob: URLs criadas
                 * após a descriptografia.
                 *
                 * Para PDF, TXT e formatos que o navegador sabe
                 * exibir, a abertura ocorre em nova aba. Para
                 * DOC/DOCX/XLS/XLSX/PPT/PPTX, o comportamento
                 * depende do navegador (eles normalmente são
                 * baixados pelo Chrome, pois ele não possui um
                 * visualizador nativo desses formatos).
                 */
                const openBtn =
                  document.createElement(
                    "a"
                  );

                openBtn.className =
                  "document-attachment-open";

                openBtn.href =
                  url;

                openBtn.target =
                  "_blank";

                openBtn.rel =
                  "noopener noreferrer";

                openBtn.textContent =
                  "Abrir";

                styleDocumentAction(openBtn);

                const downloadBtn =
                  document.createElement(
                    "a"
                  );

                downloadBtn.className =
                  "document-attachment-download";

                downloadBtn.href =
                  url;

                downloadBtn.download =
                  fileName;

                downloadBtn.textContent =
                  "Baixar";

                styleDocumentAction(downloadBtn);

                actions.appendChild(openBtn);
                actions.appendChild(downloadBtn);

                attachment.appendChild(icon);
                attachment.appendChild(info);
                attachment.appendChild(actions);

                el =
                  attachment;
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

      /*
       * Fecha qualquer menu de mensagem já aberto.
       */
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

      /* Menu compacto e responsivo: as reações continuam em grade,
       * sem deixar o menu ocupar uma faixa excessivamente larga. */
      menu.style.width = "220px";
      menu.style.minWidth = "0";
      menu.style.maxWidth = "calc(100vw - 20px)";
      menu.style.boxSizing = "border-box";


      /*
       * IMPORTANTE:
       *
       * O menu não fica mais dentro do balão da mensagem.
       * Ele é colocado diretamente no <body> e usa position:fixed.
       *
       * Isso evita que:
       *
       * 1. o menu seja cortado pelo limite do balão;
       * 2. o menu seja cortado pelo overflow da área de conversa;
       * 3. o menu desapareça quando a mensagem estiver muito
       *    próxima da borda inferior ou lateral da tela.
       *
       * Depois de renderizado, calculamos a melhor posição:
       * - abaixo da mensagem quando houver espaço;
       * - acima quando a mensagem estiver perto do rodapé;
       * - sempre dentro dos limites da janela.
       */


      menu.style.position =
        "fixed";

      menu.style.zIndex =
        "99999";

      menu.style.maxHeight =
        "calc(100vh - 16px)";

      menu.style.overflowY =
        "auto";

      menu.style.boxSizing =
        "border-box";


      /*
       * Adiciona uma ação comum ao menu.
       */
      const add =
        (label, fn) => {

          const b =
            document.createElement(
              "button"
            );

          b.type =
            "button";

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
       * Reações rápidas.
       *
       * Elas continuam lado a lado, como no ajuste anterior.
       */
      const reactionRow =
        document.createElement(
          "div"
        );

      reactionRow.className =
        "reaction-picker";

      reactionRow.setAttribute(
        "role",
        "group"
      );

      reactionRow.setAttribute(
        "aria-label",
        "Reações rápidas"
      );

      reactionRow.style.cssText =
        [
          "display: flex",
          "flex-wrap: wrap",
          "align-items: center",
          "justify-content: center",
          "gap: 4px",
          "padding: 8px 6px",
          "margin: 0 0 5px",
          "border-bottom: 1px solid rgba(0,0,0,.08)",
          "box-sizing: border-box",
          "width: 100%"
        ].join(";");

      [
        "❤️",
        "👍",
        "🔥",
        "😂",
        "👏",
        "😍",
        "😢",
        "😮",
        "😡",
        "🎉",
        "🤔",
        "🙏"
      ].forEach(
        emoji => {

          const b =
            document.createElement(
              "button"
            );

          b.type =
            "button";

          b.className =
            "reaction-picker-button";

          b.textContent =
            emoji;

          b.title =
            `Reagir com ${emoji}`;

          b.setAttribute(
            "aria-label",
            `Reagir com ${emoji}`
          );

          b.style.cssText =
            [
              "width: 30px",
              "height: 30px",
              "min-width: 30px",
              "padding: 0",
              "margin: 0",
              "border: 0",
              "border-radius: 9px",
              "background: transparent",
              "font-size: 19px",
              "line-height: 1",
              "display: inline-flex",
              "align-items: center",
              "justify-content: center",
              "cursor: pointer",
              "transition: background .15s ease, transform .15s ease"
            ].join(";");

          b.onmouseenter =
            () => {
              b.style.background =
                "rgba(0,0,0,.07)";
              b.style.transform =
                "scale(1.12)";
            };

          b.onmouseleave =
            () => {
              b.style.background =
                "transparent";
              b.style.transform =
                "scale(1)";
            };

          b.onmousedown =
            () => {
              b.style.transform =
                "scale(.94)";
            };

          b.onmouseup =
            () => {
              b.style.transform =
                "scale(1.12)";
            };

          b.onclick =
            async e => {

              e.stopPropagation();

              menu.remove();

              await react(
                m.id,
                emoji
              );
            };

          reactionRow.appendChild(
            b
          );
        }
      );

      menu.appendChild(
        reactionRow
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


      /*
       * Coloca o menu no body, fora do balão e fora
       * da área com overflow da conversa.
       */
      document.body.appendChild(
        menu
      );


      /*
       * Calcula a posição depois de o navegador
       * conhecer as dimensões reais do menu.
       */
      const bubbleRect =
        bubble.getBoundingClientRect();

      const menuRect =
        menu.getBoundingClientRect();

      const viewportWidth =
        document.documentElement.clientWidth ||
        window.innerWidth;

      const viewportHeight =
        document.documentElement.clientHeight ||
        window.innerHeight;

      const margin =
        8;

      const gap =
        6;


      /*
       * Horizontal:
       *
       * Mensagem enviada:
       * alinha a borda direita do menu com a mensagem.
       *
       * Mensagem recebida:
       * alinha a borda esquerda do menu com a mensagem.
       *
       * Depois fazemos clamp para impedir que ele
       * ultrapasse a tela em celulares estreitos.
       */
      let left =
        m.data.senderUid === me.uid
          ? bubbleRect.right - menuRect.width
          : bubbleRect.left;

      left =
        Math.max(
          margin,
          Math.min(
            left,
            viewportWidth -
              menuRect.width -
              margin
          )
        );


      /*
       * Vertical:
       *
       * Primeiro tentamos abrir abaixo.
       * Se não houver espaço suficiente, abrimos acima.
       * Se a mensagem estiver em uma região muito apertada,
       * limitamos a altura e mantemos o menu dentro da tela.
       */
      const spaceBelow =
        viewportHeight -
        bubbleRect.bottom -
        margin;

      const spaceAbove =
        bubbleRect.top -
        margin;

      let top;

      if (
        spaceBelow >=
        menuRect.height +
        gap
      ) {

        top =
          bubbleRect.bottom +
          gap;

      } else if (
        spaceAbove >=
        menuRect.height +
        gap
      ) {

        top =
          bubbleRect.top -
          menuRect.height -
          gap;

      } else if (
        spaceBelow >=
        spaceAbove
      ) {

        /*
         * Pouco espaço nos dois lados.
         * Fica abaixo, mas limitado ao viewport.
         */
        top =
          Math.min(
            bubbleRect.bottom + gap,
            viewportHeight -
              menuRect.height -
              margin
          );

      } else {

        /*
         * Fica acima, também limitado ao viewport.
         */
        top =
          Math.max(
            margin,
            bubbleRect.top -
              menuRect.height -
              gap
          );
      }


      top =
        Math.max(
          margin,
          Math.min(
            top,
            viewportHeight -
              menuRect.height -
              margin
          )
        );


      menu.style.left =
        `${Math.round(left)}px`;

      menu.style.top =
        `${Math.round(top)}px`;


      /*
       * Se o usuário rolar a conversa ou redimensionar
       * a janela enquanto o menu estiver aberto, fechamos
       * o menu. Isso evita que ele fique "solto" em relação
       * à mensagem original.
       */
      const closeOnViewportChange =
        () => {

          menu.remove();

          window.removeEventListener(
            "scroll",
            closeOnViewportChange,
            true
          );

          window.removeEventListener(
            "resize",
            closeOnViewportChange
          );
        };

      window.addEventListener(
        "scroll",
        closeOnViewportChange,
        true
      );

      window.addEventListener(
        "resize",
        closeOnViewportChange
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

        /*
         * Os anexos são armazenados usando o próprio
         * ID da mensagem:
         *
         * private/private-room/media/{id}.bin
         *
         * Portanto conseguimos remover o arquivo sem
         * precisar descriptografar a mensagem.
         */

        const mediaRef =
          ref(
            storage,
            `private/${ROOM_ID}/media/${m.id}.bin`
          );

        await deleteObject(
          mediaRef
        ).catch(
          () => {}
        );

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
       LIMPAR TODAS AS MENSAGENS
    ========================================================= */

    /*
     * Remove TODAS as mensagens da sala para os dois usuários.
     *
     * A função trabalha em páginas pequenas e sempre busca
     * novamente o primeiro lote restante. Assim não existe o
     * problema de pular documentos enquanto eles são apagados.
     *
     * Os anexos também são removidos. Como o nome do arquivo
     * no Storage é baseado no ID do documento da mensagem,
     * não é necessário descriptografar o conteúdo para saber
     * qual arquivo deve ser excluído.
     */

    async function clearAllMessages() {

      if (!me) {
        showToast(
          "Sessão não autenticada."
        );
        return;
      }


      const firstConfirm =
        confirm(
          "ATENÇÃO! Isso apagará TODAS as mensagens da conversa para os dois dispositivos.\n\nDeseja continuar?"
        );

      if (!firstConfirm) {
        return;
      }


      const secondConfirm =
        confirm(
          "CONFIRMAÇÃO FINAL:\n\nTodas as mensagens e anexos serão apagados permanentemente. Esta ação não pode ser desfeita.\n\nApagar tudo?"
        );

      if (!secondConfirm) {
        return;
      }


      const button =
        $("clearMessagesBtn");


      if (button) {

        button.disabled =
          true;

        button.textContent =
          "⏳ Apagando mensagens…";
      }


      let totalDeleted = 0;


      try {

        /*
         * Renovamos o token antes da operação,
         * seguindo a mesma proteção utilizada
         * no envio de mensagens.
         */

        if (auth.currentUser) {

          await getIdToken(
            auth.currentUser,
            true
          );
        }


        /*
         * Buscamos sempre o primeiro lote restante.
         *
         * Não usamos startAfter() porque os documentos
         * são removidos durante a operação; buscar
         * novamente o primeiro lote evita que algum
         * documento seja pulado.
         */

        while (true) {

          const q =
            query(
              MSGS,
              orderBy(
                "createdAtMs",
                "asc"
              ),
              limit(100)
            );


          const snap =
            await getDocs(q);


          if (snap.empty) {
            break;
          }


          const docs =
            snap.docs;


          /*
           * Primeiro removemos os arquivos de mídia.
           *
           * O arquivo é identificado pelo ID da mensagem.
           * Se não existir mídia para determinada mensagem,
           * o erro é simplesmente ignorado.
           */

          await Promise.allSettled(
            docs.map(
              d =>
                deleteObject(
                  ref(
                    storage,
                    `private/${ROOM_ID}/media/${d.id}.bin`
                  )
                )
            )
          );


          /*
           * Depois removemos os documentos do Firestore.
           *
           * Fazemos deleteDoc individualmente para manter
           * o comportamento compatível com as regras atuais.
           */

          for (const d of docs) {

            await deleteDoc(
              doc(MSGS, d.id)
            );

            totalDeleted++;
          }


          /*
           * Atualiza a mensagem de progresso.
           */

          if (button) {

            button.textContent =
              `⏳ ${totalDeleted} mensagem(ns) apagada(s)…`;
          }

        }


        /*
         * Limpa imediatamente o estado local.
         * O listener também atualizará a interface.
         */

        messages = [];

        replyTarget = null;

        $("replyBar")
          ?.classList
          .add("hidden");

        await renderMessages();


        showToast(
          totalDeleted > 0
            ? `${totalDeleted} mensagem(ns) apagada(s) para os dois.`
            : "A conversa já estava vazia."
        );


      } catch (e) {

        console.error(
          "Falha ao limpar todas as mensagens:",
          e
        );


        showToast(
          e?.code === "permission-denied"
            ? "Sem autorização para limpar a conversa."
            : "Não foi possível limpar todas as mensagens."
        );


      } finally {

        if (button) {

          button.disabled =
            false;

          button.textContent =
            "🗑️ Limpar todas as mensagens";
        }
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

      if (
        !media ||
        !media.path
      ) {

        throw new Error(
          "Caminho da mídia não encontrado."
        );
      }


      console.log(
        "INICIANDO DOWNLOAD DA MÍDIA:",
        {
          path: media.path,
          type: media.type,
          name: media.name
        }
      );


      const storageRef =
        ref(
          storage,
          media.path
        );


      /*
       * Impõe um limite de 30 segundos
       * para o download.
       *
       * Assim o aplicativo nunca ficará
       * indefinidamente em
       * "Carregando mídia cifrada…".
       */

      const cipher =
        await Promise.race([

          getBytes(
            storageRef,
            10 * 1024 * 1024
          ),

          new Promise(
            (_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      "Tempo limite ao baixar a mídia do Firebase Storage."
                    )
                  ),
                30000
              )
          )

        ]);


      console.log(
        "MÍDIA BAIXADA:",
        cipher.byteLength,
        "bytes"
      );


      /*
       * Recupera o segredo compartilhado
       * entre os dois dispositivos.
       */

      const secret =
        await getSharedSecret(
          otherUid
        );


      /*
       * Recria exatamente a mesma chave
       * utilizada durante a criptografia
       * do anexo.
       */

      const key =
        await deriveMessageKey(
          secret,
          unb64(
            media.salt
          )
        );


      console.log(
        "DESCRIPTOGRAFANDO MÍDIA..."
      );


      const plain =
        await crypto.subtle.decrypt(
          {
            name: "AES-GCM",

            iv:
              unb64(
                media.iv
              )
          },

          key,

          cipher
        );


      console.log(
        "MÍDIA DESCRIPTOGRAFADA COM SUCESSO."
      );


      return new Blob(
        [
          plain
        ],
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


      const sendBtn =
        $("sendBtn");


      /*
       * Impede dois envios simultâneos.
       * Isso é especialmente importante para
       * anexos, pois a criptografia e o upload
       * podem levar alguns segundos.
       */

      if (
        sendBtn?.dataset.sending ===
        "1"
      ) {
        return;
      }


      if (sendBtn) {

        sendBtn.dataset.sending =
          "1";

        sendBtn.disabled =
          true;

        sendBtn.classList.add(
          "sending"
        );

        sendBtn.textContent =
          "⏳";

        sendBtn.title =
          selectedFile
            ? "Enviando anexo cifrado…"
            : "Enviando mensagem…";
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


        const errorMessage =
          e?.code === "storage/unauthorized"
            ? "O Firebase recusou o envio do anexo."
            : e?.code === "storage/quota-exceeded"
              ? "O armazenamento do Firebase atingiu o limite."
              : e?.code === "storage/canceled"
                ? "O envio do anexo foi cancelado."
                : e?.message ||
                  "Não foi possível enviar.";

        showToast(
          selectedFile
            ? "Falha ao enviar anexo: " + errorMessage
            : errorMessage
        );
      } finally {

        if (sendBtn) {

          sendBtn.dataset.sending =
            "0";

          sendBtn.disabled =
            !sessionReady;

          sendBtn.classList.remove(
            "sending"
          );

          sendBtn.textContent =
            "➤";

          sendBtn.title =
            sessionReady
              ? "Enviar mensagem"
              : "Aguardando conexão segura…";
        }
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
       NOTIFICAÇÕES MOBILE
    ========================================================= */

    function notificationsEnabled() {
      return localStorage.getItem("ep_safe_notifications") !== "0";
    }

    async function requestMobileNotifications() {
      if (!isMobileLayout() || !notificationsEnabled()) {
        return "denied";
      }

      if (!("Notification" in window)) {
        showToast("Este navegador não oferece notificações.");
        return "unsupported";
      }

      try {
        if (Notification.permission === "default") {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") {
            showToast("Notificações não autorizadas.");
          }
          return permission;
        }

        return Notification.permission;
      } catch (e) {
        console.warn("Permissão de notificações:", e);
        showToast("Não foi possível ativar as notificações.");
        return "denied";
      }
    }

    async function showMobileNotification(message) {
      if (!isMobileLayout() || !notificationsEnabled()) return;
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      if (!message || !message.text) return;
      if (message.senderUid === auth.currentUser?.uid) return;

      const id = String(message.id || "");
      if (id && lastNotifiedMessageIds.has(id)) return;
      if (id) {
        lastNotifiedMessageIds.add(id);
        if (lastNotifiedMessageIds.size > 100) {
          lastNotifiedMessageIds = new Set([...lastNotifiedMessageIds].slice(-60));
        }
      }

      const title = message.senderName || message.sender || "Nova mensagem";
      const body = String(message.text).slice(0, 140);

      try {
        const registration = await navigator.serviceWorker?.ready;

        if (registration?.showNotification) {
          await registration.showNotification("CrIArt", {
            body: `${title}: ${body}`,
            tag: id ? `criart-${id}` : "criart-message",
            renotify: true,
            icon: "./icon-criart-192.png",
            badge: "./icon-criart-192.png",
            data: { url: "./" }
          });
          return;
        }

        new Notification("CrIArt", {
          body: `${title}: ${body}`,
          icon: "./icon-criart-192.png",
          badge: "./icon-criart-badge.png"
        });
      } catch (e) {
        console.warn("Notificação mobile:", e);
      }
    }

    function initMobileNotifications() {
      if (notificationInitialized) return;
      notificationInitialized = true;

      if (!isMobileLayout() || !("Notification" in window)) return;

      const safe = $("safeNotifications");
      if (safe) {
        safe.checked = notificationsEnabled();
      }
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

            /*
             * Notifica somente mensagens novas recebidas de outra pessoa.
             * No primeiro carregamento apenas registramos os IDs para não
             * disparar dezenas de notificações antigas.
             */
            if (!notificationInitialized) {
              raw.forEach(item => {
                if (item.id) lastNotifiedMessageIds.add(item.id);
              });
              initMobileNotifications();
            } else if (raw.length) {
              const newestRaw = raw[raw.length - 1];
              if (newestRaw?.id && !lastNotifiedMessageIds.has(newestRaw.id)) {
                const newest = messages.find(m => m.id === newestRaw.id);
                if (newest) {
                  showMobileNotification(newest);
                }
              }
            }


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

      updateDeviceGate("Dispositivo autorizado. Abrindo…");

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
      setupBiometricButton();
      initMobileNotifications();


      /*
       * MODO DISFARCE RESPONSIVO — V19
       *
       * MOBILE:
       * A aplicação sempre abre no portal de notícias.
       * O chat somente aparece depois que o usuário toca
       * no botão de menu (☰) e conclui a autenticação
       * por biometria ou PIN.
       *
       * DESKTOP:
       * Mantém o comportamento normal: abre diretamente
       * no chat, sem entrar automaticamente no disfarce.
       *
       * Usamos a largura do viewport, e não User-Agent, para
       * acompanhar corretamente celulares/tablets e o modo
       * responsivo do navegador.
       */

      const isMobileLayout =
        window.matchMedia("(max-width: 767px)").matches;

      $("lockScreen")
        ?.classList
        .add("hidden");

      if (isMobileLayout) {
        enterPanic();
      }
    }

    /* =========================================================
       ACESSO DO DISPOSITIVO
    ========================================================= */

    /*
     * Não exibimos mais uma tela pública de e-mail/senha.
     * O Firebase Auth continua responsável pela sessão, mas,
     * quando ela já estiver persistida no navegador, a aplicação
     * entra diretamente no modo protegido por PIN/biometria.
     *
     * Se o navegador não tiver uma sessão Firebase válida, esta
     * tela apenas informa que o dispositivo ainda precisa ser
     * autorizado. Isso evita criar um falso mecanismo de login
     * local que não teria como autenticar no Firebase.
     */

    /* =========================================================
       TELA INICIAL — CrIArt
       Mantém a tela de autorização existente, mas substitui
       a identidade visual antiga pela marca do aplicativo de IA.
    ========================================================= */

    function prepareCrIArtGate() {

      const screen = $("authScreen");
      const card = screen?.querySelector(".device-gate-card");

      if (!card) return;

      const oldBrand =
        card.querySelector(".news-mini-logo");

      if (oldBrand) {
        oldBrand.remove();
      }

      if (!card.querySelector(".criart-gate-brand")) {

        const brand = document.createElement("div");

        brand.className = "criart-gate-brand";

        brand.innerHTML = `
          <div class="criart-gate-mark" aria-hidden="true">✦</div>
          <div class="criart-gate-copy">
            <strong>CrIArt</strong>
            <span>Assistente de ideias</span>
          </div>
        `;

        card.prepend(brand);
      }
    }


    prepareCrIArtGate();


    function updateDeviceGate(message) {

      if ($("authStatus")) {
        $("authStatus").textContent =
          message ||
          "Aguardando autorização deste dispositivo…";
      }
    }


    updateDeviceGate(
      "Verificando autorização do dispositivo…"
    );

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

          updateDeviceGate(
            "Este dispositivo ainda não está autorizado."
          );

          $("authScreen")
            ?.classList
            .remove("hidden");

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
        async e => {

          selectedFile =
            e.target.files?.[0] ||
            null;


          if (!selectedFile) {
            return;
          }


          /*
           * Ao selecionar o arquivo, o envio começa
           * automaticamente.
           *
           * Antes, este evento apenas mostrava:
           *
           * "arquivo pronto para envio cifrado"
           *
           * e aguardava um novo clique no botão Enviar.
           *
           * Agora o próprio onchange inicia
           * a criptografia e o upload.
           */

          const file =
            selectedFile;


          showToast(
            `${file.name} preparando anexo cifrado…`
          );


          try {

            await sendMessage();

          } catch (err) {

            console.error(
              "Falha ao iniciar envio do anexo:",
              err
            );


            showToast(
              "Não foi possível iniciar o envio do anexo."
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

            /*
             * O clique em Configurações é uma ativação do usuário.
             * Quando a permissão ainda estiver como "default", podemos
             * solicitar a autorização do sistema aqui sem depender de
             * uma chamada automática bloqueada pelo navegador mobile.
             */
            if (
              isMobileLayout() &&
              $("safeNotifications").checked &&
              "Notification" in window &&
              Notification.permission === "default"
            ) {
              requestMobileNotifications();
            }
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


    /* =========================================================
       LIMPAR TODAS AS MENSAGENS
    ========================================================= */

    if ($("clearMessagesBtn")) {

      $("clearMessagesBtn").onclick =
        async () => {

          /*
           * Fecha a janela antes de iniciar a operação.
           */

          $("settingsModal")
            ?.classList
            .add("hidden");

          await clearAllMessages();
        };
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
        async e => {
          const enabled = e.target.checked;

          localStorage.setItem(
            "ep_safe_notifications",
            enabled ? "1" : "0"
          );

          if (enabled && isMobileLayout()) {
            const permission = await requestMobileNotifications();
            if (permission !== "granted") {
              e.target.checked = false;
              localStorage.setItem("ep_safe_notifications", "0");
            }
          }
        };
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
        () => {

          /*
           * Neste modo, "sair" significa bloquear o
           * dispositivo. A sessão Firebase permanece
           * persistida para que não seja necessário
           * voltar a digitar e-mail e senha.
           */

          lockApp();

          showToast(
            "Dispositivo bloqueado. Use sua senha ou biometria para voltar."
          );
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
