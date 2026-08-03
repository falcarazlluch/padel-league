'use client';

import { useActionState } from 'react';
import type { TeamCategory } from '@prisma/client';
// Presentation path, not the module facade: the facade re-exports services that
// pull in prisma/pg-boss, which cannot be bundled for the client.
import { CATEGORY_LABEL, CATEGORY_VALUES } from '@/modules/leagues/presentation/category';
import { saveProfileAction } from '../[token]/actions';

const CATEGORY_HINT: Record<TeamCategory, string> = {
  BEGINNER: 'Empiezas o juegas de forma ocasional.',
  INTERMEDIATE: 'Juegas con regularidad y controlas la pared.',
  ADVANCED: 'Compites habitualmente y dominas el juego de red.',
};

/**
 * Step 2. Name and phone are required because the organiser needs to reach the
 * player about court times; the field labels say so, rather than making the
 * requirement look arbitrary.
 */
export function ProfileStep({
  token,
  leagueId,
  leagueSlug,
  nextStep,
  defaultName,
  defaultPhone,
  defaultCategory,
  email,
}: {
  token: string;
  leagueId: string;
  leagueSlug: string;
  nextStep: number;
  defaultName: string;
  defaultPhone: string;
  defaultCategory: TeamCategory;
  email: string;
}) {
  const [state, formAction, pending] = useActionState(saveProfileAction, null);

  return (
    <form
      action={formAction}
      className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-5"
    >
      <input type="hidden" name="inviteToken" value={token} />
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="leagueSlug" value={leagueSlug} />
      <input type="hidden" name="nextStep" value={nextStep} />

      <div>
        <h2 className="text-base font-bold text-brand-navy">Tus datos</h2>
        <p className="text-sm text-slate-600 mt-1">
          La organización los usa para avisarte de horarios y cambios de pista.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
            Nombre y apellido <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            minLength={3}
            maxLength={80}
            defaultValue={defaultName}
            autoComplete="name"
            placeholder="Ej: Juan García"
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
          <p className="text-xs text-slate-400 mt-1">
            Aparecerá en el cuadro y en la clasificación.
          </p>
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1">
            Teléfono de contacto <span className="text-red-500">*</span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            required
            maxLength={30}
            defaultValue={defaultPhone}
            autoComplete="tel"
            placeholder="Ej: 600 123 456"
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
          <p className="text-xs text-slate-400 mt-1">
            Solo lo ve la organización del torneo, nunca el resto de jugadores.
          </p>
        </div>

        <fieldset>
          <legend className="block text-sm font-medium text-slate-700 mb-1">
            Tu nivel de juego
          </legend>
          <div className="space-y-2">
            {CATEGORY_VALUES.map((value) => (
              <label
                key={value}
                className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 cursor-pointer hover:bg-slate-50 has-[:checked]:border-brand-blue has-[:checked]:bg-brand-blue/5 transition-colors"
              >
                <input
                  type="radio"
                  name="category"
                  value={value}
                  defaultChecked={value === defaultCategory}
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
        </fieldset>

        {email && (
          <p className="text-xs text-slate-400">
            Tu cuenta es <strong className="text-slate-500">{email}</strong>. Puedes cambiar la
            contraseña y la foto más adelante desde tu perfil.
          </p>
        )}
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full px-4 py-3 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
      >
        {pending ? 'Guardando...' : 'Guardar y elegir pareja'}
      </button>
    </form>
  );
}
