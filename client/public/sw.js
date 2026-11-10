const CACHE_NAME = "navigo-v30";
const PRECACHE_ASSETS = [
  "./",
  "index.html",
  "app.js?v=20261110-07",
  "rooms_data.js?v=20261110-07",
  "rooms_data.json",
  "logo.png",
  "whatsapp.png",
  "icon-192.png",
  "icon-512.png",
  "manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) return caches.delete(key);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.action === "skipWaiting") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const reqUrl = event.request.url;
  const isImageOrMedia =
    /\.(jpg|jpeg|png|webp|svg|gif|avif)$/i.test(reqUrl) ||
    reqUrl.includes("/Rooms/");

  if (isImageOrMedia) {
    // Cache-First: Instantaneous 0ms retrieval for all corridor photos
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then((cached) => {
        if (cached) return cached;
        return fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return networkResponse;
          })
          .catch(() => caches.match(event.request, { ignoreSearch: true }));
      })
    );
    return;
  }

  // Network-First with Cache Fallback for code assets
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
