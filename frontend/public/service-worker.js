// AgriWarung Manager - legacy service worker remover
// v2.5.38: Do not intercept fetch. Remove old cache-first worker that could break /login.
const LEGACY_CACHE_PREFIX = "agriwarung";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(LEGACY_CACHE_PREFIX)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.registration.unregister())
      .catch(() => self.registration.unregister().catch(() => {})),
  );
});

// Intentionally no fetch handler.
