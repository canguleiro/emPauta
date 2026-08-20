const CACHE_VERSION = "em-pauta-v7";
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const STATIC_ASSETS = [
  "./manifest.json",
  "./icon.svg",
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

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  // Só tratamos requisições do próprio Em Pauta.
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
