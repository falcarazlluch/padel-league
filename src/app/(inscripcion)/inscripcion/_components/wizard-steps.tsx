import Link from 'next/link';
import type { Route } from 'next';

const STEPS = [
  { n: 1, label: 'El torneo' },
  { n: 2, label: 'Tus datos' },
  { n: 3, label: 'Tu pareja' },
  { n: 4, label: 'Listo' },
] as const;

/**
 * Progress rail. Only already-reached steps are clickable — going "forward" by
 * URL is the one way a player could end up on a step whose prerequisites are
 * unmet, and the wizard's contract is that it never leaves them guessing.
 */
export function WizardSteps({
  current,
  reachable,
  token,
}: {
  current: number;
  reachable: number;
  token: string;
}) {
  return (
    <nav aria-label="Pasos de la inscripción">
      <ol className="flex items-center gap-1 sm:gap-2">
        {STEPS.map((s, i) => {
          const state = s.n < current ? 'done' : s.n === current ? 'current' : 'todo';
          const clickable = s.n <= reachable && s.n !== current;
          const inner = (
            <span className="flex items-center gap-2">
              <span
                className={
                  state === 'current'
                    ? 'h-7 w-7 shrink-0 grid place-items-center rounded-full bg-brand-navy text-white text-xs font-bold'
                    : state === 'done'
                      ? 'h-7 w-7 shrink-0 grid place-items-center rounded-full bg-emerald-500 text-white text-xs font-bold'
                      : 'h-7 w-7 shrink-0 grid place-items-center rounded-full bg-slate-200 text-slate-500 text-xs font-bold'
                }
              >
                {state === 'done' ? '✓' : s.n}
              </span>
              <span
                className={`hidden sm:inline text-xs font-semibold ${
                  state === 'todo' ? 'text-slate-400' : 'text-brand-navy'
                }`}
              >
                {s.label}
              </span>
            </span>
          );
          return (
            <li key={s.n} className="flex items-center gap-1 sm:gap-2 min-w-0">
              {clickable ? (
                <Link
                  href={`/inscripcion/${token}?paso=${s.n}` as Route}
                  className="rounded-full hover:opacity-80 transition-opacity"
                  aria-label={`Volver al paso ${s.n}: ${s.label}`}
                >
                  {inner}
                </Link>
              ) : (
                <span aria-current={state === 'current' ? 'step' : undefined}>{inner}</span>
              )}
              {i < STEPS.length - 1 && (
                <span
                  className={`h-0.5 w-4 sm:w-8 rounded ${s.n < current ? 'bg-emerald-400' : 'bg-slate-200'}`}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
