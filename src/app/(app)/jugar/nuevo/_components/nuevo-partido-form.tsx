'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createOpenMatch } from '../actions';

type ActionResult = { error: string } | { success: true; matchId: string } | null;

export function NuevoPartidoForm() {
  const [openState, openAction, openPending] = useActionState<ActionResult, FormData>(createOpenMatch, null);
  const router = useRouter();

  useEffect(() => {
    if (openState && 'success' in openState) router.push(`/jugar/${openState.matchId}`);
  }, [openState, router]);

  return (
    <div className="space-y-6">
      <form action={openAction} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del partido *</label>
          <input name="name" required maxLength={100} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Jugadores máximos</label>
          <select name="maxPlayers" defaultValue="4" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all">
            <option value="2">2 jugadores</option>
            <option value="4">4 jugadores</option>
          </select>
        </div>
        <fieldset className="border border-slate-200 rounded-xl p-3">
          <legend className="px-1 text-xs font-bold text-slate-500 uppercase tracking-widest">Visibilidad</legend>
          <div className="flex gap-2 mt-1">
            <label className="flex-1 cursor-pointer">
              <input type="radio" name="visibility" value="PUBLIC" defaultChecked className="peer sr-only" />
              <span className="block text-center text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 peer-checked:bg-brand-navy peer-checked:text-white peer-checked:border-brand-navy transition-colors">
                👁️ Público
              </span>
            </label>
            <label className="flex-1 cursor-pointer">
              <input type="radio" name="visibility" value="PRIVATE" className="peer sr-only" />
              <span className="block text-center text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 peer-checked:bg-brand-navy peer-checked:text-white peer-checked:border-brand-navy transition-colors">
                🔒 Privado
              </span>
            </label>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Público: aparece en el tablón y cualquiera puede unirse. Privado: solo por invitación.
          </p>
        </fieldset>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha y hora (opcional)</label>
          <input name="scheduledAt" type="datetime-local" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Lugar (opcional)</label>
          <input name="location" maxLength={200} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción (opcional)</label>
          <textarea name="description" maxLength={500} rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all" />
        </div>
        {openState && 'error' in openState && (
          <p className="text-sm text-red-600">{openState.error}</p>
        )}
        <button
          type="submit"
          disabled={openPending}
          className="px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {openPending ? 'Creando...' : 'Crear partido'}
        </button>
      </form>
    </div>
  );
}
