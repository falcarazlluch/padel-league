'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { CATEGORY_LABEL, CATEGORY_VALUES } from '@/modules/leagues/presentation/category';
import { createLeagueAction } from '../actions';

const initialState: { error?: string; values?: { name: string; description: string; category: string; registrationStart: string; registrationEnd: string; startDate: string; endDate: string } } = {};

export function NuevaLigaForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createLeagueAction, initialState);

  return (
    <form action={formAction} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 flex flex-col gap-4">
      {state.error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {state.error}
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
          placeholder="Ej: Liga Verano 2025"
          defaultValue={state.values?.name ?? ''}
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
          placeholder="Descripción opcional..."
          defaultValue={state.values?.description ?? ''}
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
          defaultValue={state.values?.category ?? 'INTERMEDIATE'}
          required
          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        >
          {CATEGORY_VALUES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500 mt-1">Define el nivel competitivo de la liga.</p>
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
            defaultValue={state.values?.registrationStart ?? ''}
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
            defaultValue={state.values?.registrationEnd ?? ''}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="startDate" className="block text-sm font-medium text-slate-700 mb-1">
            Inicio liga <span className="text-red-500">*</span>
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            required
            defaultValue={state.values?.startDate ?? ''}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
        <div>
          <label htmlFor="endDate" className="block text-sm font-medium text-slate-700 mb-1">
            Fin liga <span className="text-red-500">*</span>
          </label>
          <input
            id="endDate"
            name="endDate"
            type="date"
            required
            defaultValue={state.values?.endDate ?? ''}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
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
          {pending ? 'Creando...' : 'Crear liga'}
        </button>
      </div>
    </form>
  );
}
