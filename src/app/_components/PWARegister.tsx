'use client';

import { useEffect } from 'react';

// Registra el service worker para habilitar la instalación de la PWA
// en Chrome/Android. Solo se ejecuta en cliente y en producción para evitar
// que un SW cacheado interfiera con `next dev`.
export function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Silenciamos: un fallo al registrar el SW no debe romper la app.
      });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }
  }, []);

  return null;
}
