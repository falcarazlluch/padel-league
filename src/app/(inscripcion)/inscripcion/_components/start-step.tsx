import Link from 'next/link';
import type { Route } from 'next';

/**
 * Step 1 is pure navigation — no mutation. Opening an invite link stays a read,
 * so a link forwarded round a WhatsApp group never signs anybody up by
 * accident. The tenant membership and the enrolment row are both created later,
 * when the player submits their details.
 */
export function StartStep({
  nextHref,
  disabled,
  kind,
  playerName,
  resuming,
}: {
  nextHref: string;
  disabled: boolean;
  kind: 'ORGANIZATION' | 'COMPETITION';
  /** Null when nobody is signed in yet. */
  playerName: string | null;
  /** An enrolment already exists — the button continues instead of starting. */
  resuming: boolean;
}) {
  const greeting = playerName ? `Hola ${playerName.split(' ')[0]}, vamos allá` : 'Vamos allá';

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
      <div>
        <h2 className="text-base font-bold text-brand-navy">
          {resuming ? 'Continúa donde lo dejaste' : greeting}
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          {resuming
            ? 'Ya habías empezado esta inscripción. Retomamos en el punto exacto en el que la dejaste.'
            : 'Son cuatro pasos cortos y te decimos en todo momento qué falta.'}
        </p>
      </div>

      <ol className="text-sm text-slate-600 space-y-1.5">
        <li className="flex gap-2">
          <span className="text-brand-blue font-bold">1.</span> Te identificas (o creas tu cuenta).
        </li>
        {kind === 'ORGANIZATION' && (
          <li className="flex gap-2">
            <span className="text-brand-blue font-bold">2.</span> Eliges la competición.
          </li>
        )}
        <li className="flex gap-2">
          <span className="text-brand-blue font-bold">{kind === 'ORGANIZATION' ? '3.' : '2.'}</span>{' '}
          Confirmas tus datos y tu nivel.
        </li>
        <li className="flex gap-2">
          <span className="text-brand-blue font-bold">{kind === 'ORGANIZATION' ? '4.' : '3.'}</span>{' '}
          Eliges o invitas a tu pareja.
        </li>
      </ol>

      {disabled ? (
        <p className="text-sm text-slate-500">
          No se puede continuar por el motivo indicado arriba.
        </p>
      ) : (
        <Link
          href={nextHref as Route}
          className="block text-center w-full px-4 py-3 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 transition-opacity"
        >
          {resuming ? 'Continuar inscripción' : 'Empezar'}
        </Link>
      )}
    </section>
  );
}
