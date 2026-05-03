'use client';

import { useTransition } from 'react';
import { drainNowAction, clearDeadLettersAction, clearEmailLogAction } from './actions';

export function DrainNowButton() {
  const [pending, startTransition] = useTransition();

  return (
    <form action={() => startTransition(() => drainNowAction())}>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 px-4 py-2 bg-brand-navy text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {pending ? 'Procesando…' : 'Procesar cola ahora'}
      </button>
    </form>
  );
}

export function ClearDeadLettersButton() {
  const [pending, startTransition] = useTransition();

  return (
    <form action={() => startTransition(() => clearDeadLettersAction())}>
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-semibold text-rose-600 hover:text-rose-800 disabled:opacity-50 transition-colors"
      >
        {pending ? 'Limpiando…' : 'Limpiar todos'}
      </button>
    </form>
  );
}

export function ClearEmailLogButton() {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={() => {
        if (!confirm('¿Borrar TODO el log de emails (enviados, fallidos, en cola)? Esta acción no se puede deshacer.')) return;
        startTransition(() => clearEmailLogAction());
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-semibold text-rose-600 hover:text-rose-800 disabled:opacity-50 transition-colors"
      >
        {pending ? 'Limpiando…' : 'Limpiar log'}
      </button>
    </form>
  );
}
