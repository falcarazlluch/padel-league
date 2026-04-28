'use client';

import { useActionState, useState } from 'react';
import { proposeDate, acceptProposal } from './actions';

type Props = {
  matchId: string;
  slug: string;
  matchStatus: string;
  // 'none' = no proposal, 'mine' = I proposed, 'rival' = rival proposed
  proposalState: 'none' | 'mine' | 'rival';
  proposedDate: Date | null;
  scheduledAt: Date | null;
  isTeamMember: boolean;
};

export function ScheduleSection({ matchId, slug, matchStatus, proposalState, proposedDate, scheduledAt, isTeamMember }: Props) {
  const [showForm, setShowForm] = useState(proposalState === 'none');
  const [proposeState, proposeAction, proposePending] = useActionState(proposeDate, null);
  const [acceptState, acceptAction, acceptPending] = useActionState(acceptProposal, null);

  if (!isTeamMember) return null;

  // DATE_CONFIRMED: show read-only confirmed date
  if (matchStatus === 'DATE_CONFIRMED' && scheduledAt) {
    const confirmedDateStr = scheduledAt.toLocaleDateString('es-ES', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
        <p className="text-sm text-green-700 font-medium">✅ Partido programado: {confirmedDateStr}</p>
      </div>
    );
  }

  const dateStr = proposedDate
    ? proposedDate.toLocaleDateString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
      })
    : null;

  // Success: collapse form
  if (proposeState && 'success' in proposeState) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
        <p className="text-sm text-blue-700 font-medium">✅ Propuesta enviada. Esperando respuesta del rival.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
      <h3 className="font-bold text-brand-navy">📅 Programar partido</h3>

      {/* Rival proposed — show accept / counter */}
      {proposalState === 'rival' && !showForm && (
        <div className="space-y-3">
          <p className="text-sm text-blue-700">
            📬 El rival propone: <strong>{dateStr}</strong>
          </p>
          {acceptState && 'error' in acceptState && (
            <p className="text-sm text-red-600">{acceptState.error}</p>
          )}
          <div className="flex gap-3">
            <form action={acceptAction}>
              <input type="hidden" name="matchId" value={matchId} />
              <input type="hidden" name="slug" value={slug} />
              <button
                type="submit"
                disabled={acceptPending}
                className="px-4 py-2 bg-gradient-to-br from-emerald-500 to-green-600 text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {acceptPending ? 'Confirmando...' : '✓ Confirmar fecha'}
              </button>
            </form>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-white border border-gray-200 text-slate-700 text-sm font-semibold rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
            >
              Proponer otra fecha
            </button>
          </div>
        </div>
      )}

      {/* I proposed — waiting */}
      {proposalState === 'mine' && !showForm && (
        <div className="space-y-3">
          <p className="text-sm text-orange-700">
            ⏳ Propuesta enviada: <strong>{dateStr}</strong> — esperando al rival.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-white border border-gray-200 text-slate-700 text-sm font-semibold rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
            >
              Cambiar propuesta
            </button>
          </div>
        </div>
      )}

      {/* Propose date form */}
      {showForm && (
        <form action={proposeAction} className="space-y-3">
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="slug" value={slug} />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Fecha y hora propuesta
            </label>
            <input
              type="datetime-local"
              name="proposedAt"
              required
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
            />
          </div>
          {proposeState && 'error' in proposeState && (
            <p className="text-sm text-red-600">{proposeState.error}</p>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={proposePending}
              className="px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {proposePending ? 'Enviando...' : 'Proponer fecha'}
            </button>
            {proposalState !== 'none' && (
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-white border border-gray-200 text-slate-700 text-sm font-semibold rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
