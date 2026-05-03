'use client';

import { useActionState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import type { TeamCategory } from '@prisma/client';
import { CATEGORY_LABEL, CATEGORY_VALUES } from '@/modules/leagues/presentation/category';
import { updateLeagueAction, deleteLeagueAction } from '../../actions';

type Props = {
  leagueId: string;
  slug: string;
  initialName: string;
  initialDescription: string;
  initialRegistrationStart: string; // YYYY-MM-DD
  initialRegistrationEnd: string;   // YYYY-MM-DD
  initialStartDate: string;         // YYYY-MM-DD
  initialEndDate: string;           // YYYY-MM-DD
  initialCategory: TeamCategory;
  canDelete: boolean;
};

export function EditLeagueForm({
  leagueId, slug, initialName, initialDescription,
  initialRegistrationStart, initialRegistrationEnd,
  initialStartDate, initialEndDate,
  initialCategory, canDelete,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateLeagueAction, null);
  const [deletePending, startDelete] = useTransition();

  const onDelete = () => {
    if (!confirm('¿Borrar esta liga? Esta acción es irreversible y borrará equipos, partidos y resultados asociados.')) return;
    startDelete(async () => {
      const result = await deleteLeagueAction(leagueId);
      if (result?.error) {
        alert(result.error);
      }
    });
  };

  return (
    <div className="space-y-4">
      <form action={formAction} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 flex flex-col gap-4">
        <input type="hidden" name="leagueId" value={leagueId} />
        <input type="hidden" name="slug" value={slug} />

        {state && 'error' in state && state.error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {state.error}
          </div>
        )}
        {state && 'success' in state && state.success && (
          <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            Cambios guardados.
          </div>
        )}

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
            Nombre de la liga <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={initialName}
            maxLength={80}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">
            Descripción
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={initialDescription}
            maxLength={500}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all resize-none"
          />
        </div>

        <div>
          <label htmlFor="category" className="block text-sm font-medium text-slate-700 mb-1">
            Nivel <span className="text-red-500">*</span>
          </label>
          <select
            id="category"
            name="category"
            defaultValue={initialCategory}
            required
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          >
            {CATEGORY_VALUES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="registrationStart" className="block text-sm font-medium text-slate-700 mb-1">
              Inicio inscripción <span className="text-red-500">*</span>
            </label>
            <input
              id="registrationStart"
              name="registrationStart"
              type="date"
              required
              defaultValue={initialRegistrationStart}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
            />
          </div>
          <div>
            <label htmlFor="registrationEnd" className="block text-sm font-medium text-slate-700 mb-1">
              Cierre inscripción <span className="text-red-500">*</span>
            </label>
            <input
              id="registrationEnd"
              name="registrationEnd"
              type="date"
              required
              defaultValue={initialRegistrationEnd}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium text-slate-700 mb-1">
              Fecha inicio liga <span className="text-red-500">*</span>
            </label>
            <input
              id="startDate"
              name="startDate"
              type="date"
              required
              defaultValue={initialStartDate}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
            />
          </div>
          <div>
            <label htmlFor="endDate" className="block text-sm font-medium text-slate-700 mb-1">
              Fecha fin <span className="text-red-500">*</span>
            </label>
            <input
              id="endDate"
              name="endDate"
              type="date"
              required
              defaultValue={initialEndDate}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push(`/ligas/${slug}` as Route)}
            className="flex-1 px-4 py-2.5 bg-white border border-gray-200 text-slate-700 text-sm font-semibold rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
          >
            Volver
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {pending ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </form>

      {canDelete && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 space-y-2">
          <p className="text-sm font-bold text-red-800">Zona de peligro</p>
          <p className="text-xs text-red-700">
            Borrar la liga elimina permanentemente todos sus equipos, partidos, resultados y crónicas. No se puede deshacer.
          </p>
          <button
            type="button"
            onClick={onDelete}
            disabled={deletePending}
            className="text-sm bg-red-50 border border-red-200 text-red-600 font-semibold rounded-xl px-4 py-2 hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            {deletePending ? 'Borrando...' : 'Borrar liga permanentemente'}
          </button>
        </div>
      )}
    </div>
  );
}
