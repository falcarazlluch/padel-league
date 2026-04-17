'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { createTeamAction } from '../../../actions';

type FormState = { error?: string };
const initial: FormState = {};

export function NuevoEquipoForm({ leagueId, slug }: { leagueId: string; slug: string }) {
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
    <form action={formAction} className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-4">
      <input type="hidden" name="leagueId" value={leagueId} />
      {state.error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {state.error}
        </div>
      )}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Nombre del equipo <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="Ej: Los Cañones"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 px-4 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-60 transition-colors"
        >
          {pending ? 'Creando...' : 'Crear equipo'}
        </button>
      </div>
    </form>
  );
}
