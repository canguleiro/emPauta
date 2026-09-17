const CACHE_VERSION = "criart-v10";
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const STATIC_ASSETS = [
  "./manifest.json",
  "./icon.svg",
  "./icon-criart-192.png",
  "./icon-criart-512.png",
  "./icon-criart-badge.png",
  "./css/app.css"
];

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

/*
 * Clique em uma notificação: retorna para o aplicativo já aberto
 * ou abre uma nova janela/aba quando necessário.
 */
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

  // Só tratamos requisições do próprio CrIArt.
  if (url.origin !== location.origin) {
    return;
  }

  // Nunca cachear HTML nem JavaScript do aplicativo.
  // Isso garante que Ctrl+R receba sempre a versão atual.
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
