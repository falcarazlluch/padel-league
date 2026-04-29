'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createOpenMatch, createChallenge } from '../actions';

type ActionResult = { error: string } | { success: true; matchId: string } | null;

type ChallengeLeague = {
  id: string;
  name: string;
  myTeams: { id: string; name: string }[];
  rivalTeams: { id: string; name: string }[];
};

export function NuevoPartidoForm({ challengeLeagues }: { challengeLeagues: ChallengeLeague[] }) {
  const [type, setType] = useState<'open' | 'challenge'>('open');
  const [selectedLeagueId, setSelectedLeagueId] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [openState, openAction, openPending] = useActionState<ActionResult, FormData>(createOpenMatch, null);
  const [challengeState, challengeAction, challengePending] = useActionState<ActionResult, FormData>(createChallenge, null);
  const router = useRouter();

  useEffect(() => {
    if (openState && 'success' in openState) router.push(`/jugar/${openState.matchId}`);
  }, [openState, router]);

  useEffect(() => {
    if (challengeState && 'success' in challengeState) router.push(`/jugar/${challengeState.matchId}`);
  }, [challengeState, router]);

  const selectedLeague = challengeLeagues.find((l) => l.id === selectedLeagueId);
  const myTeamsInLeague = selectedLeague?.myTeams ?? [];
  const rivalTeams = selectedLeague?.rivalTeams ?? [];

  const canChallenge = challengeLeagues.length > 0;

  return (
    <div className="space-y-6">
      {canChallenge && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setType('open')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
              type === 'open'
                ? 'bg-gradient-to-br from-brand-navy to-brand-navy-light text-white border-brand-navy shadow-md'
                : 'bg-white text-slate-700 border-gray-200 hover:border-gray-300'
            }`}
          >
            Partido abierto
          </button>
          <button
            type="button"
            onClick={() => setType('challenge')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
              type === 'challenge'
                ? 'bg-gradient-to-br from-brand-navy to-brand-navy-light text-white border-brand-navy shadow-md'
                : 'bg-white text-slate-700 border-gray-200 hover:border-gray-300'
            }`}
          >
            Retar a un equipo
          </button>
        </div>
      )}

      {type === 'open' ? (
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
      ) : (
        <form action={challengeAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del reto *</label>
            <input name="name" required maxLength={100} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Liga *</label>
            <select
              name="leagueId"
              required
              value={selectedLeagueId}
              onChange={(e) => { setSelectedLeagueId(e.target.value); setSelectedTeamId(''); }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
            >
              <option value="">Selecciona la liga...</option>
              {challengeLeagues.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          {selectedLeague && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tu equipo *</label>
                <select
                  name="organizerTeamId"
                  required
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
                >
                  <option value="">Selecciona tu equipo...</option>
                  {myTeamsInLeague.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Equipo retado *</label>
                <select name="challengedTeamId" required className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all">
                  <option value="">Selecciona equipo rival...</option>
                  {rivalTeams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha y hora (opcional)</label>
            <input name="scheduledAt" type="datetime-local" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lugar (opcional)</label>
            <input name="location" maxLength={200} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all" />
          </div>
          {challengeState && 'error' in challengeState && (
            <p className="text-sm text-red-600">{challengeState.error}</p>
          )}
          <button
            type="submit"
            disabled={challengePending || !selectedLeagueId || !selectedTeamId}
            className="px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {challengePending ? 'Enviando...' : 'Enviar reto'}
          </button>
        </form>
      )}
    </div>
  );
}
