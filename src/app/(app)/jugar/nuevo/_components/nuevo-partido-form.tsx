'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { createOpenMatch } from '../actions';

type ActionResult = { error: string } | { success: true; matchId: string };

interface Props {
  myTeams: { id: string; name: string }[];
}

export function NuevoPartidoForm({ myTeams }: Props) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => {
      const res = await createOpenMatch(_prev, formData);
      if (res && 'success' in res && res.matchId) {
        router.push(`/jugar/${res.matchId}` as Route);
      }
      return res;
    },
    null,
  );

  const [hostKind, setHostKind] = useState<'USER' | 'TEAM'>('USER');
  const canHostAsTeam = myTeams.length > 0;

  return (
    <form action={action} className="space-y-4">
      <fieldset className="border border-slate-200 rounded-xl p-3">
        <legend className="px-1 text-xs font-bold text-slate-500 uppercase tracking-widest">Cómo juego</legend>
        <div className="flex gap-2 mt-1">
          <label className="flex-1 cursor-pointer">
            <input
              type="radio"
              name="hostKind"
              value="USER"
              checked={hostKind === 'USER'}
              onChange={() => setHostKind('USER')}
              className="peer sr-only"
            />
            <span className="block text-center text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 peer-checked:bg-brand-navy peer-checked:text-white peer-checked:border-brand-navy transition-colors">
              Como usuario
            </span>
          </label>
          <label
            className={`flex-1 ${canHostAsTeam ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
            title={canHostAsTeam ? '' : 'Necesitas un equipo de 2 jugadores'}
          >
            <input
              type="radio"
              name="hostKind"
              value="TEAM"
              checked={hostKind === 'TEAM'}
              onChange={() => setHostKind('TEAM')}
              disabled={!canHostAsTeam}
              className="peer sr-only"
            />
            <span className="block text-center text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 peer-checked:bg-brand-navy peer-checked:text-white peer-checked:border-brand-navy transition-colors">
              Como equipo
            </span>
          </label>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Como usuario: tú ocupas 1 hueco. Como equipo: tu equipo ocupa 2 huecos (partido de 4).
        </p>
      </fieldset>

      {hostKind === 'TEAM' && (
        <div>
          <label htmlFor="hostTeamId" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
            Equipo organizador
          </label>
          <select
            id="hostTeamId"
            name="hostTeamId"
            required
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          >
            <option value="">Selecciona…</option>
            {myTeams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
          Nombre
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={100}
          placeholder="Sábado por la tarde"
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
      </div>

      <fieldset className="border border-slate-200 rounded-xl p-3">
        <legend className="px-1 text-xs font-bold text-slate-500 uppercase tracking-widest">Visibilidad</legend>
        <div className="flex gap-2 mt-1">
          <label className="flex-1 cursor-pointer">
            <input type="radio" name="visibility" value="PUBLIC" defaultChecked className="peer sr-only" />
            <span className="block text-center text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 peer-checked:bg-brand-navy peer-checked:text-white peer-checked:border-brand-navy transition-colors">
              Público
            </span>
          </label>
          <label className="flex-1 cursor-pointer">
            <input type="radio" name="visibility" value="PRIVATE" className="peer sr-only" />
            <span className="block text-center text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 peer-checked:bg-brand-navy peer-checked:text-white peer-checked:border-brand-navy transition-colors">
              Privado
            </span>
          </label>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Público: aparece en el tablón y cualquiera puede unirse. Privado: solo por invitación.
        </p>
      </fieldset>

      {hostKind === 'USER' && (
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
            Jugadores
          </label>
          <div className="flex gap-2">
            <label className="flex-1 cursor-pointer">
              <input type="radio" name="maxPlayers" value="2" defaultChecked className="peer sr-only" />
              <span className="block text-center text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 peer-checked:bg-brand-navy peer-checked:text-white peer-checked:border-brand-navy transition-colors">
                2 (1v1)
              </span>
            </label>
            <label className="flex-1 cursor-pointer">
              <input type="radio" name="maxPlayers" value="4" className="peer sr-only" />
              <span className="block text-center text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 peer-checked:bg-brand-navy peer-checked:text-white peer-checked:border-brand-navy transition-colors">
                4 (2v2)
              </span>
            </label>
          </div>
        </div>
      )}
      {hostKind === 'TEAM' && <input type="hidden" name="maxPlayers" value="4" />}

      <div>
        <label htmlFor="scheduledAt" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
          Fecha (opcional)
        </label>
        <input
          id="scheduledAt"
          name="scheduledAt"
          type="datetime-local"
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
      </div>

      <div>
        <label htmlFor="location" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
          Lugar (opcional)
        </label>
        <input
          id="location"
          name="location"
          type="text"
          maxLength={200}
          placeholder="Club de Pádel Centro"
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
          Descripción (opcional)
        </label>
        <textarea
          id="description"
          name="description"
          maxLength={500}
          rows={3}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {pending ? 'Creando…' : 'Crear partido'}
      </button>

      {state && 'error' in state && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
