import Link from 'next/link';
import type { Route } from 'next';

/** Step identities, so callers don't juggle indices. */
export type StepKey = 'intro' | 'auth' | 'pick' | 'profile' | 'partner' | 'done';

export const STEP_LABEL: Record<StepKey, string> = {
  intro: 'El torneo',
  auth: 'Identifícate',
  pick: 'Elige torneo',
  profile: 'Tus datos',
  partner: 'Tu pareja',
  done: 'Listo',
};

/**
 * The step sequence depends on the link kind: an organization link inserts a
 * "choose a competition" step, because it is not tied to one.
 */
export function stepsFor(kind: 'ORGANIZATION' | 'COMPETITION'): StepKey[] {
  return kind === 'ORGANIZATION'
    ? ['intro', 'auth', 'pick', 'profile', 'partner', 'done']
    : ['intro', 'auth', 'profile', 'partner', 'done'];
}

/**
 * Progress rail. Only already-reached steps are clickable — going "forward" by
 * URL is the one way a player could land on a step whose prerequisites are
 * unmet, and the wizard's contract is that it never leaves them guessing.
 */
export function WizardSteps({
  steps,
  current,
  reachable,
  hrefFor,
  introLabel,
}: {
  steps: StepKey[];
  /** 1-based. */
  current: number;
  /** 1-based; the furthest step the player may jump to. */
  reachable: number;
  hrefFor: (step: number) => string;
  /** Organization links call step 1 "El club" rather than "El torneo". */
  introLabel?: string;
}) {
  return (
    <nav aria-label="Pasos de la inscripción">
      <ol className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
        {steps.map((key, i) => {
          const n = i + 1;
          const state = n < current ? 'done' : n === current ? 'current' : 'todo';
          const clickable = n <= reachable && n !== current;
          const label = key === 'intro' && introLabel ? introLabel : STEP_LABEL[key];
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
                {state === 'done' ? '✓' : n}
              </span>
              <span
                className={`hidden sm:inline text-xs font-semibold whitespace-nowrap ${
                  state === 'todo' ? 'text-slate-400' : 'text-brand-navy'
                }`}
              >
                {label}
              </span>
            </span>
          );
          return (
            <li key={key} className="flex items-center gap-1 sm:gap-2 min-w-0">
              {clickable ? (
                <Link
                  href={hrefFor(n) as Route}
                  className="rounded-full hover:opacity-80 transition-opacity"
                  aria-label={`Volver al paso ${n}: ${label}`}
                >
                  {inner}
                </Link>
              ) : (
                <span aria-current={state === 'current' ? 'step' : undefined}>{inner}</span>
              )}
              {i < steps.length - 1 && (
                <span
                  className={`h-0.5 w-3 sm:w-6 rounded shrink-0 ${n < current ? 'bg-emerald-400' : 'bg-slate-200'}`}
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
