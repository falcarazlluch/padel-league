'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { createLeagueAction } from '../actions';

const initialState = { error: undefined as string | undefined };

export default function NuevaLigaPage() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createLeagueAction, initialState);

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Nueva liga</h1>
      <form action={formAction} className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-4">
        {state.error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {state.error}
          </div>
        )}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Nombre de la liga <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="Ej: Liga Verano 2025"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Descripción
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            placeholder="Descripción opcional..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
              Fecha inicio <span className="text-red-500">*</span>
            </label>
            <input
              id="startDate"
              name="startDate"
              type="date"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
              Fecha fin <span className="text-red-500">*</span>
            </label>
            <input
              id="endDate"
              name="endDate"
              type="date"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
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
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {pending ? 'Creando...' : 'Crear liga'}
          </button>
        </div>
      </form>
    </div>
  );
}
