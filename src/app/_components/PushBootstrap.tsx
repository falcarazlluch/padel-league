'use client';

import { useEffect } from 'react';

// Coordina el opt-in de Web Push al instalar la PWA. Tres puertas:
//   1. Browser soporta Push + Notification API.
//   2. App montada en modo standalone (en iOS es requisito; en Android no, pero
//      sólo pedimos permiso en standalone para evitar pop-ups en sesiones
//      casuales desde Safari/Chrome móvil).
//   3. Permiso aún no decidido (`default`) o ya concedido (`granted`).
//
// Si `granted` pero falta sub local (instalación nueva, SW reinstalado),
// re-suscribimos en silencio. Si `default`, esperamos a `appinstalled` o al
// primer arranque en standalone para disparar el prompt nativo.
export function PushBootstrap() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (!('PushManager' in window) || !('Notification' in window)) return;

    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublic) return;

    let cancelled = false;

    const isStandalone = (): boolean => {
      try {
        if (window.matchMedia('(display-mode: standalone)').matches) return true;
      } catch {
        // matchMedia indisponible en algunos WebViews.
      }
      const iosNav = navigator as Navigator & { standalone?: boolean };
      return iosNav.standalone === true;
    };

    const subscribeNow = async (): Promise<void> => {
      try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublic),
          });
        }
        await postSubscription(sub);
      } catch (err) {
        // No molestamos al usuario: si el browser rechaza el endpoint
        // (red, configuración VAPID inválida, etc.) sólo registramos.
        console.warn('[push] subscribe failed', err);
      }
    };

    const requestAndSubscribe = async (): Promise<void> => {
      if (Notification.permission === 'denied') return;
      if (Notification.permission === 'default') {
        try {
          const result = await Notification.requestPermission();
          if (result !== 'granted') return;
        } catch {
          return;
        }
      }
      if (!cancelled) await subscribeNow();
    };

    // 1) Permiso ya concedido → asegurar sub local (recovery silencioso).
    if (Notification.permission === 'granted') {
      void subscribeNow();
    } else if (isStandalone()) {
      // 2) Primer arranque en standalone sin permiso: prompt nativo.
      void requestAndSubscribe();
    }

    // 3) Si el usuario instala la PWA durante esta sesión, pedimos al vuelo.
    const onInstalled = () => {
      void requestAndSubscribe();
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      cancelled = true;
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return null;
}

// PushManager.subscribe expects a BufferSource backed by ArrayBuffer (not
// SharedArrayBuffer). We allocate the buffer explicitly so the typed view
// reports the narrower ArrayBuffer in TypeScript 5.7+ strict-libs mode.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out as Uint8Array<ArrayBuffer>;
}

async function postSubscription(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) return;
  await fetch('/api/notifications/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: json.endpoint,
      p256dh,
      auth,
      userAgent: navigator.userAgent.slice(0, 500),
    }),
  });
}
