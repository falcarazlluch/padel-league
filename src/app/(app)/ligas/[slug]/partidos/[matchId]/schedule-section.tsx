'use client';

import { useActionState, useState } from 'react';
import {
  proposeDate,
  acceptProposal,
  proposeDeadlineExtensionAction,
  acceptDeadlineExtensionAction,
  rejectDeadlineExtensionAction,
} from './actions';

type Props = {
  matchId: string;
  slug: string;
  matchStatus: string;
  matchDeadlineAt: Date;
  leagueEndDate: Date;
  // 'none' = no proposal, 'mine' = I proposed, 'rival' = rival proposed
  proposalState: 'none' | 'mine' | 'rival';
  proposedDate: Date | null;
  scheduledAt: Date | null;
  isTeamMember: boolean;
  extensionState: 'none' | 'mine' | 'rival';
  activeExtension: { id: string; proposedDeadlineAt: Date; proposerName: string } | null;
};

export function ScheduleSection({
  matchId, slug, matchStatus, matchDeadlineAt, leagueEndDate,
  proposalState, proposedDate, scheduledAt, isTeamMember,
  extensionState, activeExtension,
}: Props) {
  const [showForm, setShowForm] = useState(proposalState === 'none');
  const [proposeState, proposeAction, proposePending] = useActionState(proposeDate, null);
  const [acceptState, acceptAction, acceptPending] = useActionState(acceptProposal, null);
  const [extProposeState, extProposeAction, extProposePending] = useActionState(proposeDeadlineExtensionAction, null);
  const [extAcceptState, extAcceptAction, extAcceptPending] = useActionState(acceptDeadlineExtensionAction, null);
  const [extRejectState, extRejectAction, extRejectPending] = useActionState(rejectDeadlineExtensionAction, null);
  const [showExtensionForm, setShowExtensionForm] = useState(false);

  const NON_EXTENDABLE = ['EXPIRED_UNPLAYED', 'CONFIRMED', 'ADMIN_RESOLVED', 'CANCELLED', 'PENDING_VALIDATION', 'DISPUTED'];
  const canExtend = !NON_EXTENDABLE.includes(matchStatus);

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
    <>
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

      {/* Deadline extension UI */}
      {isTeamMember && canExtend && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold text-brand-navy">Plazo del partido</p>
            <p className="text-xs text-slate-400">
              Vence el {matchDeadlineAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            </p>
          </div>

          {extensionState === 'rival' && activeExtension && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
              <p className="text-sm text-blue-800">
                <strong>{activeExtension.proposerName}</strong> propone extender hasta el{' '}
                <strong>{activeExtension.proposedDeadlineAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</strong>
              </p>
              <div className="flex gap-2">
                <form action={extAcceptAction}>
                  <input type="hidden" name="proposalId" value={activeExtension.id} />
                  <input type="hidden" name="matchId" value={matchId} />
                  <input type="hidden" name="slug" value={slug} />
                  <button type="submit" disabled={extAcceptPending}
                    className="text-xs px-3 py-1.5 bg-gradient-to-br from-emerald-500 to-green-600 text-white font-bold rounded-full shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
                    {extAcceptPending ? '...' : 'Aceptar'}
                  </button>
                </form>
                <form action={extRejectAction}>
                  <input type="hidden" name="proposalId" value={activeExtension.id} />
                  <input type="hidden" name="matchId" value={matchId} />
                  <input type="hidden" name="slug" value={slug} />
                  <button type="submit" disabled={extRejectPending}
                    className="text-xs px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-full hover:bg-gray-50 disabled:opacity-50 transition-colors">
                    Rechazar
                  </button>
                </form>
              </div>
              {extAcceptState && 'error' in extAcceptState && (
                <p className="text-xs text-red-600">{extAcceptState.error}</p>
              )}
              {extRejectState && 'error' in extRejectState && (
                <p className="text-xs text-red-600">{extRejectState.error}</p>
              )}
            </div>
          )}

          {extensionState === 'mine' && activeExtension && (
            <p className="text-sm text-slate-600 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2">
              ⏳ Has propuesto extender hasta el{' '}
              <strong>{activeExtension.proposedDeadlineAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</strong>.
              Esperando respuesta del rival.
            </p>
          )}

          {extensionState === 'none' && !showExtensionForm && (
            <button
              type="button"
              onClick={() => setShowExtensionForm(true)}
              className="text-xs px-3 py-1.5 bg-brand-navy/8 text-brand-navy font-semibold rounded-full border border-brand-navy/15 hover:bg-brand-navy/12 transition-colors"
            >
              Proponer ampliación de plazo
            </button>
          )}

          {extensionState === 'none' && showExtensionForm && (
            <form action={extProposeAction} className="space-y-2">
              <input type="hidden" name="matchId" value={matchId} />
              <input type="hidden" name="slug" value={slug} />
              <label className="block text-xs font-medium text-slate-700">
                Nueva fecha límite (debe ser posterior al deadline actual y anterior al fin de liga)
              </label>
              <input
                type="date"
                name="newDeadlineAt"
                required
                min={new Date(matchDeadlineAt.getTime() + 86400000).toISOString().slice(0, 10)}
                max={new Date(leagueEndDate.getTime() - 86400000).toISOString().slice(0, 10)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
              />
              <div className="flex gap-2">
                <button type="submit" disabled={extProposePending}
                  className="text-xs px-3 py-1.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white font-bold rounded-full shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {extProposePending ? 'Enviando...' : 'Proponer'}
                </button>
                <button type="button" onClick={() => setShowExtensionForm(false)}
                  className="text-xs px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-full hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
              </div>
              {extProposeState && 'error' in extProposeState && (
                <p className="text-xs text-red-600">{extProposeState.error}</p>
              )}
              {extProposeState && 'success' in extProposeState && (
                <p className="text-xs text-emerald-600">Propuesta enviada.</p>
              )}
            </form>
          )}
        </div>
      )}
    </>
  );
}
