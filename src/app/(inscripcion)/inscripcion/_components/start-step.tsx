'use client';

import { useState, useTransition } from 'react';
import { startEnrollmentAction } from '../[token]/actions';

/**
 * Step 1's single action. The enrolment row is created here rather than on page
 * load so opening the link is a pure read — a forwarded link never signs
 * anybody up by accident.
 */
export function StartStep({
  token,
  resuming,
  disabled,
  playerName,
}: {
  token: string;
  /** An enrolment already exists — the button continues instead of starting. */
  resuming: boolean;
  disabled: boolean;
  playerName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      // On success the action redirects, so anything returned here is an error.
      const res = await startEnrollmentAction(token);
      if (res?.error) setError(res.error);
    });
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
      <div>
        <h2 className="text-base font-bold text-brand-navy">
          {resuming ? 'Continúa donde lo dejaste' : `Hola ${playerName.split(' ')[0]}, vamos allá`}
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          {resuming
            ? 'Ya habías empezado esta inscripción. Retomamos en el punto exacto en el que la dejaste.'
            : 'Te haremos dos preguntas: tus datos de contacto y con quién juegas. Nada más.'}
        </p>
      </div>

      <ol className="text-sm text-slate-600 space-y-1.5">
        <li className="flex gap-2">
          <span className="text-brand-blue font-bold">1.</span> Confirmas tus datos y tu nivel.
        </li>
        <li className="flex gap-2">
          <span className="text-brand-blue font-bold">2.</span> Eliges o invitas a tu pareja.
        </li>
        <li className="flex gap-2">
          <span className="text-brand-blue font-bold">3.</span> Te confirmamos por escrito que
          estás dentro.
        </li>
      </ol>

      <button
        type="button"
        onClick={onClick}
        disabled={pending || disabled}
        className="w-full px-4 py-3 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {pending ? 'Un momento...' : resuming ? 'Continuar inscripción' : 'Empezar inscripción'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
