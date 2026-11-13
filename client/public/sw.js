const CACHE_NAME = "navigo-v31";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    ).then(() => self.clients.claim())
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

  // NEVER intercept API endpoints, SSE event streams, Vite HMR, or local development files
  if (
    reqUrl.includes("/api/") ||
    reqUrl.includes("/sse/") ||
    reqUrl.includes("/@vite") ||
    reqUrl.includes("/@fs") ||
    reqUrl.includes("/src/") ||
    reqUrl.includes("/node_modules/") ||
    reqUrl.includes(":4000") ||
    event.request.headers.get("accept")?.includes("text/event-stream")
  ) {
    return; // Let browser handle natively without service worker interception
  }

  const isImageOrMedia =
    /\.(jpg|jpeg|png|webp|svg|gif|avif)$/i.test(reqUrl) ||
    reqUrl.includes("/Rooms/");

  if (isImageOrMedia) {
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
});
