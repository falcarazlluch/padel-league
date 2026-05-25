// Minimal passive service worker. Required for PWA install prompts in Chrome.
// Does NOT cache pages or API responses on purpose: queremos comportamiento
// online normal y evitar problemas de invalidación entre despliegues.
// Si en el futuro añadimos cache, hay que bumpear CACHE_VERSION.

const CACHE_VERSION = 'pl-v1';

self.addEventListener('install', () => {
  // Activate inmediatamente sin esperar a que se cierren todas las pestañas.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Fetch handler vacío (pass-through). Chrome lo exige para considerar la
// app instalable, pero no interceptamos ni cacheamos respuestas.
self.addEventListener('fetch', () => {});
