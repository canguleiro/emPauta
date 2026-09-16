const CACHE_VERSION = "criart-v22";
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const STATIC_ASSETS = [
  "./manifest.json",
  "./icon.svg",
  "./icon-criart-192.png",
  "./icon-criart-512.png",
  "./css/app.css"
];

/* Firebase Cloud Messaging usa este mesmo Service Worker. */
try {
  importScripts(
    "https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js"
  );

  firebase.initializeApp({
    apiKey: "AIzaSyASQkgnQkeKjXKrmT3yMV9zcUVxec3NvrA",
    authDomain: "em-pauta-d6e92.firebaseapp.com",
    projectId: "em-pauta-d6e92",
    storageBucket: "em-pauta-d6e92.firebasestorage.app",
    messagingSenderId: "94994518950",
    appId: "1:94994518950:web:e60bb5bc8358752f47567"
  });

  const messaging = firebase.messaging();

  async function readNotificationSettings() {
    return new Promise(resolve => {
      try {
        const request = indexedDB.open("criart-settings", 1);
        request.onsuccess = () => {
          try {
            const dbi = request.result;
            const tx = dbi.transaction("settings", "readonly");
            const get = tx.objectStore("settings").get("notifications");
            get.onsuccess = () => resolve(get.result || {});
            get.onerror = () => resolve({});
          } catch (e) {
            resolve({});
          }
        };
        request.onerror = () => resolve({});
      } catch (e) {
        resolve({});
      }
    });
  }

  messaging.onBackgroundMessage(async payload => {
    const data = payload?.data || {};
    const settings = await readNotificationSettings();

    if (settings.enabled === false) return;

    const title = data.title || "Nova mensagem";
    const body = settings.preview
      ? (data.body || "Você recebeu uma nova mensagem.")
      : "Você recebeu uma nova mensagem.";

    self.registration.showNotification(title, {
      body,
      icon: "./icon-criart-192.png",
      badge: "./icon-criart-192.png",
      tag: data.tag || `criart-${payload?.messageId || Date.now()}`,
      renotify: true,
      silent: settings.sound === false,
      vibrate: settings.vibration === false ? [] : [100, 50, 100],
      data: { url: data.url || "./" }
    });
  });
} catch (error) {
  // O aplicativo continua funcionando mesmo antes da configuração do FCM.
  console.warn("FCM Service Worker não inicializado:", error);
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== STATIC_CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || "./",
    self.location.origin
  ).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(clients => {
        for (const client of clients) {
          if ("focus" in client) {
            return client.focus();
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== location.origin) {
    return;
  }

  if (
    request.method !== "GET" ||
    request.destination === "script" ||
    request.destination === "document"
  ) {
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      return cached || fetch(request);
    })
  );
});
