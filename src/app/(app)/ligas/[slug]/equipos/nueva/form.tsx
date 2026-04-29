'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import type { TeamCategory } from '@prisma/client';
import { CATEGORY_LABEL, CATEGORY_VALUES } from '@/modules/leagues';
import { createTeamAction } from '../../../actions';

type FormState = { error?: string };
const initial: FormState = {};

export function NuevoEquipoForm({
  leagueId,
  slug,
  defaultCategory,
}: {
  leagueId: string;
  slug: string;
  defaultCategory: TeamCategory;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (_prev: FormState, formData: FormData): Promise<FormState> => {
      const result = await createTeamAction(_prev, formData);
      if (!result.error) router.push(`/ligas/${slug}` as Route);
      return result;
    },
    initial,
  );

  return (
    <form action={formAction} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 flex flex-col gap-4">
      <input type="hidden" name="leagueId" value={leagueId} />
      {state.error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {state.error}
        </div>
      )}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
          Nombre del equipo <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="Ej: Los Cañones"
          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
      </div>
      <div>
        <label htmlFor="category" className="block text-sm font-medium text-slate-700 mb-1">
          Categoría <span className="text-red-500">*</span>
        </label>
        <select
          id="category"
          name="category"
          defaultValue={defaultCategory}
          required
          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        >
          {CATEGORY_VALUES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500 mt-1">Por defecto coincide con la categoría de la liga.</p>
      </div>
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 px-4 py-2.5 bg-white border border-gray-200 text-slate-700 text-sm font-semibold rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {pending ? 'Creando...' : 'Crear equipo'}
        </button>
      </div>
    </form>
  );
}
