'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { acceptPartnerInviteAction, declinePartnerInviteAction } from './actions';

/** Accept / decline. Accepting redirects to the status page, which is the proof. */
export function PartnerDecision({
  token,
  inviterFirstName,
}: {
  token: string;
  inviterFirstName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);

  const accept = () => {
    setError(null);
    startTransition(async () => {
      const res = await acceptPartnerInviteAction(token);
      if (res?.error) setError(res.error);
    });
  };

  const decline = () => {
    if (!confirm(`¿Rechazar la invitación de ${inviterFirstName}?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await declinePartnerInviteAction(token);
      if (res.error) setError(res.error);
      else setDeclined(true);
    });
  };

  if (declined) {
    return (
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
        <h2 className="text-base font-bold text-brand-navy">Invitación rechazada</h2>
        <p className="text-sm text-slate-600">
          Hemos avisado a {inviterFirstName} para que pueda buscar otra pareja. No estás apuntado a
          nada.
        </p>
        <Link
          href={'/dashboard' as Route}
          className="inline-block text-sm font-semibold text-brand-blue hover:underline"
        >
          Ir a mi panel
        </Link>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
      <button
        type="button"
        onClick={accept}
        disabled={pending}
        className="w-full px-4 py-3.5 bg-gradient-to-br from-brand-green to-brand-green-dark text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
      >
        {pending ? 'Confirmando...' : 'Acepto — apuntadnos a los dos'}
      </button>
      <button
        type="button"
        onClick={decline}
        disabled={pending}
        className="w-full px-4 py-2.5 bg-white border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 disabled:opacity-60 transition-colors"
      >
        No puedo jugar
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-slate-400">
        Al aceptar te damos de alta en el entorno de la organización para que puedas ver el cuadro y
        los resultados.
      </p>
    </section>
  );
}
