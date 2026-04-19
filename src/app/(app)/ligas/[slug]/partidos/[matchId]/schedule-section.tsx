'use client';

import { useActionState, useState } from 'react';
import { proposeDate, acceptProposal, cancelProposal } from './actions';

type Props = {
  matchId: string;
  slug: string;
  // 'none' = no proposal, 'mine' = I proposed, 'rival' = rival proposed
  proposalState: 'none' | 'mine' | 'rival';
  proposedDate: Date | null;
  isTeamMember: boolean;
};

export function ScheduleSection({ matchId, slug, proposalState, proposedDate, isTeamMember }: Props) {
  const [showForm, setShowForm] = useState(proposalState === 'none');
  const [proposeState, proposeAction, proposePending] = useActionState(proposeDate, null);
  const [acceptState, acceptAction, acceptPending] = useActionState(acceptProposal, null);
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelProposal, null);

  if (!isTeamMember) return null;

  const dateStr = proposedDate
    ? proposedDate.toLocaleDateString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
      })
    : null;

  // Success: collapse form
  if (proposeState && 'success' in proposeState) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <p className="text-sm text-blue-700 font-medium">✅ Propuesta enviada. Esperando respuesta del rival.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h3 className="font-semibold text-gray-900">📅 Programar partido</h3>

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
                className="bg-green-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {acceptPending ? 'Confirmando...' : '✓ Confirmar fecha'}
              </button>
            </form>
            <button
              onClick={() => setShowForm(true)}
              className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
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
              className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
            >
              Cambiar propuesta
            </button>
            <form action={cancelAction}>
              <input type="hidden" name="matchId" value={matchId} />
              <input type="hidden" name="slug" value={slug} />
              <button
                type="submit"
                disabled={cancelPending}
                className="text-red-600 text-sm hover:underline"
              >
                {cancelPending ? 'Retirando...' : 'Retirar propuesta'}
              </button>
            </form>
          </div>
          {cancelState && 'error' in cancelState && (
            <p className="text-sm text-red-600">{cancelState.error}</p>
          )}
        </div>
      )}

      {/* Propose date form */}
      {showForm && (
        <form action={proposeAction} className="space-y-3">
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="slug" value={slug} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha y hora propuesta
            </label>
            <input
              type="datetime-local"
              name="proposedAt"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
          {proposeState && 'error' in proposeState && (
            <p className="text-sm text-red-600">{proposeState.error}</p>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={proposePending}
              className="bg-brand-navy text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-brand-navy-light disabled:opacity-50"
            >
              {proposePending ? 'Enviando...' : 'Proponer fecha'}
            </button>
            {proposalState !== 'none' && (
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
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
