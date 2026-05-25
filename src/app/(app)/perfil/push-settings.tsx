'use client';

import { useEffect, useState, useTransition } from 'react';
import { updatePushPreferencesAction } from './push-actions';
import type { PreferenceFlags } from '@/modules/push';

type DeviceState =
  | { kind: 'loading' }
  | { kind: 'unsupported' }
  | { kind: 'needs-install-ios' }
  | { kind: 'denied' }
  | { kind: 'idle'; subscribed: boolean };

const CATEGORY_LABELS: Array<{ key: keyof PreferenceFlags; label: string; help: string }> = [
  { key: 'pushInvitations', label: 'Invitaciones y partidos', help: 'Te invitan a un partido, se confirma, se cancela, etc.' },
  { key: 'pushMatchDates',  label: 'Fechas de partido',       help: 'Propuestas y confirmaciones de fecha, recordatorios.' },
  { key: 'pushResults',     label: 'Resultados y validación', help: 'Resultados enviados, confirmados, disputas y comentarios IA.' },
  { key: 'pushPhotos',      label: 'Fotos y comentarios',     help: 'Subidas, comentarios y menciones en fotos del partido.' },
  { key: 'pushChat',        label: 'Chat de partido',         help: 'Mensajes nuevos en el chat. Desactivado por defecto.' },
  { key: 'pushLeagueEvents',label: 'Liga',                    help: 'Apertura de inscripciones, inicio y cierre de liga.' },
];

export function PushSettings({ initialPrefs }: { initialPrefs: PreferenceFlags }) {
  const [device, setDevice] = useState<DeviceState>({ kind: 'loading' });
  const [prefs, setPrefs] = useState<PreferenceFlags>(initialPrefs);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const support = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!support) {
      setDevice({ kind: 'unsupported' });
      return;
    }
    // iOS necesita la PWA instalada — si no, mostramos instrucciones.
    const isStandalone =
      (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS && !isStandalone) {
      setDevice({ kind: 'needs-install-ios' });
      return;
    }

    void (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (Notification.permission === 'denied') {
          setDevice({ kind: 'denied' });
          return;
        }
        setDevice({ kind: 'idle', subscribed: !!sub });
      } catch {
        setDevice({ kind: 'unsupported' });
      }
    })();
  }, []);

  const togglePref = (key: keyof PreferenceFlags) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setFeedback(null);
    startTransition(async () => {
      const result = await updatePushPreferencesAction({ [key]: next[key] });
      if (result.error) {
        setPrefs(prefs);
        setFeedback({ kind: 'err', text: result.error });
      } else {
        setFeedback({ kind: 'ok', text: 'Guardado.' });
      }
    });
  };

  const enableOnThisDevice = async () => {
    setFeedback(null);
    try {
      const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublic) {
        setFeedback({ kind: 'err', text: 'Servidor no configurado para push.' });
        return;
      }
      const result = await Notification.requestPermission();
      if (result !== 'granted') {
        setDevice({ kind: 'denied' });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublic),
        });
      }
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setFeedback({ kind: 'err', text: 'Suscripción incompleta.' });
        return;
      }
      const res = await fetch('/api/notifications/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          userAgent: navigator.userAgent.slice(0, 500),
        }),
      });
      if (!res.ok) {
        setFeedback({ kind: 'err', text: 'No se pudo registrar el dispositivo.' });
        return;
      }
      setDevice({ kind: 'idle', subscribed: true });
      setFeedback({ kind: 'ok', text: 'Activado en este dispositivo.' });
    } catch (err) {
      setFeedback({ kind: 'err', text: 'Error activando notificaciones.' });
    }
  };

  const disableOnThisDevice = async () => {
    setFeedback(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => undefined);
        await fetch('/api/notifications/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        });
      }
      setDevice({ kind: 'idle', subscribed: false });
      setFeedback({ kind: 'ok', text: 'Desactivado en este dispositivo.' });
    } catch {
      setFeedback({ kind: 'err', text: 'No se pudo desactivar.' });
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Notificaciones push</h2>

      {device.kind === 'loading' && (
        <p className="text-sm text-slate-500">Comprobando soporte…</p>
      )}

      {device.kind === 'unsupported' && (
        <p className="text-sm text-slate-500">
          Tu navegador no soporta notificaciones push. Prueba en Chrome, Edge o Firefox actualizados.
        </p>
      )}

      {device.kind === 'needs-install-ios' && (
        <div className="text-sm text-slate-600 space-y-2">
          <p>
            En iPhone/iPad, primero añade Padel League a la pantalla de inicio:
            toca <strong>Compartir</strong> → <strong>Añadir a pantalla de inicio</strong>.
          </p>
          <p className="text-xs text-slate-500">
            Requiere iOS 16.4 o superior. Después podrás activar las notificaciones desde esta pantalla.
          </p>
        </div>
      )}

      {device.kind === 'denied' && (
        <p className="text-sm text-slate-600">
          Has bloqueado las notificaciones. Para activarlas, ve a los ajustes del navegador y permite
          notificaciones para esta web.
        </p>
      )}

      {device.kind === 'idle' && (
        <>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-800">
                {device.subscribed ? 'Activadas en este dispositivo' : 'Desactivadas en este dispositivo'}
              </p>
              <p className="text-xs text-slate-500">
                {device.subscribed
                  ? 'Recibirás push en este navegador para las categorías marcadas abajo.'
                  : 'Activa para recibir push en este navegador.'}
              </p>
            </div>
            {device.subscribed ? (
              <button
                type="button"
                onClick={disableOnThisDevice}
                className="shrink-0 px-3 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors"
              >
                Desactivar
              </button>
            ) : (
              <button
                type="button"
                onClick={enableOnThisDevice}
                className="shrink-0 px-3 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 transition-opacity"
              >
                Activar
              </button>
            )}
          </div>

          <div className={`space-y-3 ${device.subscribed ? '' : 'opacity-50 pointer-events-none'}`}>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Categorías</p>
            {CATEGORY_LABELS.map(({ key, label, help }) => (
              <label key={key} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!prefs[key]}
                  onChange={() => togglePref(key)}
                  disabled={pending || !device.subscribed}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-slate-800">{label}</span>
                  <span className="block text-xs text-slate-500">{help}</span>
                </span>
              </label>
            ))}
          </div>
        </>
      )}

      {feedback && (
        <p
          className={`text-sm rounded-xl px-3 py-2 ${
            feedback.kind === 'ok'
              ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
              : 'text-rose-600 bg-rose-50 border border-rose-200'
          }`}
        >
          {feedback.text}
        </p>
      )}
    </section>
  );
}

// Same helper as PushBootstrap — kept local so this component has no client
// dep on _components. The ArrayBuffer allocation is required for TS 5.7+ lib.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out as Uint8Array<ArrayBuffer>;
}
