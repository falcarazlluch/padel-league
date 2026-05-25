// Passive service worker for PWA install + Web Push delivery.
// Doesn't cache pages or API responses on purpose: queremos comportamiento
// online normal y evitar problemas de invalidación entre despliegues.
// Si en el futuro añadimos cache de assets, hay que bumpear CACHE_VERSION.

const CACHE_VERSION = 'pl-v2';

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

// Web Push: el server envía un JSON cifrado (E2E, RFC 8291) con
// { title, body, url, tag, icon, badge }. `tag = notification.id` permite
// coalescing de re-envíos del mismo evento.
self.addEventListener('push', (event) => {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch (err) {
    // Algunos providers mandan keepalive pings sin body — silenciar.
  }
  if (!payload || typeof payload.title !== 'string') return;

  const title = payload.title;
  const options = {
    body: typeof payload.body === 'string' ? payload.body : '',
    icon: typeof payload.icon === 'string' ? payload.icon : '/logopwa.png',
    badge: typeof payload.badge === 'string' ? payload.badge : '/logopwa.png',
    tag: typeof payload.tag === 'string' ? payload.tag : undefined,
    data: { url: typeof payload.url === 'string' ? payload.url : '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // Si ya hay una pestaña abierta, foquéala y navega allí.
      for (const client of allClients) {
        if ('focus' in client) {
          try {
            await client.focus();
            if ('navigate' in client && client.url !== new URL(targetUrl, self.location.origin).href) {
              await client.navigate(targetUrl);
            }
            return;
          } catch (err) {
            // Continuar al siguiente si el foco falla (ventana minimizada en algunos navegadores).
          }
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
