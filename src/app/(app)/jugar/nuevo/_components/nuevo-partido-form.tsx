'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createOpenMatch, createChallenge } from '../actions';
import type { TeamForChallenge } from '@/modules/independent-matches';

type ActionResult = { error: string } | { success: true; matchId: string } | null;

export function NuevoPartidoForm({ userTeams }: { userTeams: TeamForChallenge[] }) {
  const [type, setType] = useState<'open' | 'challenge'>('open');
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

  const selectedTeam = userTeams.find((t) => t.id === selectedTeamId);
  const rivalTeams = selectedTeam
    ? userTeams.filter((t) => t.leagueId === selectedTeam.leagueId && t.id !== selectedTeamId)
    : [];

  return (
    <div className="space-y-6">
      {/* Type selector — only shown when user has teams */}
      {userTeams.length > 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setType('open')}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              type === 'open'
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
            }`}
          >
            Partido abierto
          </button>
          <button
            type="button"
            onClick={() => setType('challenge')}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              type === 'challenge'
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
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
            <input name="name" required maxLength={100} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Jugadores máximos</label>
            <select name="maxPlayers" defaultValue="4" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
              <option value="2">2 jugadores</option>
              <option value="4">4 jugadores</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha y hora (opcional)</label>
            <input name="scheduledAt" type="datetime-local" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lugar (opcional)</label>
            <input name="location" maxLength={200} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción (opcional)</label>
            <textarea name="description" maxLength={500} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
          </div>
          {openState && 'error' in openState && (
            <p className="text-sm text-red-600">{openState.error}</p>
          )}
          <button
            type="submit"
            disabled={openPending}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {openPending ? 'Creando...' : 'Crear partido'}
          </button>
        </form>
      ) : (
        <form action={challengeAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del reto *</label>
            <input name="name" required maxLength={100} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tu equipo *</label>
            <select
              name="organizerTeamId"
              required
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
            >
              <option value="">Selecciona tu equipo...</option>
              {userTeams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          {selectedTeam && (
            <>
              <input type="hidden" name="leagueId" value={selectedTeam.leagueId} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Equipo retado *</label>
                <select name="challengedTeamId" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
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
            <input name="scheduledAt" type="datetime-local" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lugar (opcional)</label>
            <input name="location" maxLength={200} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
          </div>
          {challengeState && 'error' in challengeState && (
            <p className="text-sm text-red-600">{challengeState.error}</p>
          )}
          <button
            type="submit"
            disabled={challengePending || !selectedTeamId}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {challengePending ? 'Enviando...' : 'Enviar reto'}
          </button>
        </form>
      )}
    </div>
  );
}
