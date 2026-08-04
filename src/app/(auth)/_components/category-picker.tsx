'use client';

import type { TeamCategory } from '@prisma/client';
// Presentation path, not the module facade: the facade re-exports services that
// pull in prisma/pg-boss, which cannot be bundled for the client.
import { CATEGORY_LABEL, CATEGORY_VALUES } from '@/modules/leagues/presentation/category';

const CATEGORY_HINT: Record<TeamCategory, string> = {
  BEGINNER: 'Empiezas o juegas de forma ocasional.',
  INTERMEDIATE: 'Juegas con regularidad y controlas la pared.',
  ADVANCED: 'Compites habitualmente y dominas el juego de red.',
};

/**
 * Level of play, asked once at sign-up.
 *
 * It used to live in the inscription wizard's "Tus datos" step, which meant a
 * player only declared a level the first time they enrolled in a tournament —
 * and had to re-read a form they had already effectively filled in at
 * registration. Asking here makes the account complete from the start, so the
 * wizard has nothing left to collect.
 */
export function CategoryPicker({
  defaultValue = 'INTERMEDIATE',
  idPrefix = 'category',
}: {
  defaultValue?: TeamCategory;
  /** Distinguishes the inputs when two forms coexist on one page. */
  idPrefix?: string;
}) {
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-slate-700 mb-1">Tu nivel de juego</legend>
      <div className="space-y-2">
        {CATEGORY_VALUES.map((value) => (
          <label
            key={value}
            htmlFor={`${idPrefix}-${value}`}
            className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 cursor-pointer hover:bg-slate-50 has-[:checked]:border-brand-blue has-[:checked]:bg-brand-blue/5 transition-colors"
          >
            <input
              id={`${idPrefix}-${value}`}
              type="radio"
              name="category"
              value={value}
              defaultChecked={value === defaultValue}
              className="mt-1 accent-[var(--color-brand-blue)]"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-700">
                {CATEGORY_LABEL[value]}
              </span>
              <span className="block text-xs text-slate-500">{CATEGORY_HINT[value]}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-1">
        Orienta el emparejamiento. Podrás cambiarlo cuando quieras.
      </p>
    </fieldset>
  );
}
