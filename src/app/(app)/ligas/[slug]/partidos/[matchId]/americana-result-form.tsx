'use client';

import { useActionState, useState, useTransition } from 'react';
import {
  submitAmericanaResultAction,
  confirmAmericanaResultAction,
  disputeAmericanaResultAction,
} from '../actions';

// Vista de formularios para una Americana ROTATING_INDIVIDUAL.
// Tres modos según `mode`:
//  - "submit": el partido está SCHEDULED/DATE_*; cualquier participante puede
//    introducir el score y enviar.
//  - "confirm": el partido está PENDING_VALIDATION y el usuario actual
//    pertenece al lado contrario al submitter → puede confirmar o disputar.
//  - "submitter-wait": el partido está PENDING_VALIDATION y el usuario es
//    del mismo lado que el submitter → solo info, espera al rival.

export function AmericanaResultForm({
  matchId,
  mode,
  pendingGames,
  isParticipant,
}: {
  matchId: string;
  mode: 'submit' | 'confirm' | 'submitter-wait' | 'view';
  pendingGames?: { gamesA: number; gamesB: number };
  isParticipant: boolean;
}) {
  if (!isParticipant) {
    return (
      <p className="text-sm text-slate-500">
        Solo los participantes del partido pueden enviar o validar el resultado.
      </p>
    );
  }

  if (mode === 'submit') return <SubmitForm matchId={matchId} />;
  if (mode === 'confirm') return <ConfirmPanel matchId={matchId} pendingGames={pendingGames} />;
  if (mode === 'submitter-wait') {
    return (
      <p className="text-sm text-slate-500">
        Tu pareja envió el resultado. Esperando a que la pareja rival confirme.
      </p>
    );
  }
  return null;
}

function SubmitForm({ matchId }: { matchId: string }) {
  const [state, formAction, pending] = useActionState(submitAmericanaResultAction, null);
  return (
    <form action={formAction} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
      <input type="hidden" name="matchId" value={matchId} />
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Enviar resultado</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="gamesA" className="block text-sm font-medium text-slate-700 mb-1">
            Games Pareja A
          </label>
          <input
            id="gamesA"
            name="gamesA"
            type="number"
            min={0}
            max={99}
            required
            defaultValue={0}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
        <div>
          <label htmlFor="gamesB" className="block text-sm font-medium text-slate-700 mb-1">
            Games Pareja B
          </label>
          <input
            id="gamesB"
            name="gamesB"
            type="number"
            min={0}
            max={99}
            required
            defaultValue={0}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-60 transition-opacity"
      >
        {pending ? 'Enviando…' : 'Enviar resultado'}
      </button>
      {state?.error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          Resultado enviado. La pareja rival debe confirmarlo.
        </p>
      )}
    </form>
  );
}

function ConfirmPanel({
  matchId,
  pendingGames,
}: {
  matchId: string;
  pendingGames?: { gamesA: number; gamesB: number };
}) {
  const [confirmPending, startConfirm] = useTransition();
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeState, disputeAction, disputePending] = useActionState(
    disputeAmericanaResultAction,
    null,
  );

  const onConfirm = () => {
    setConfirmError(null);
    startConfirm(async () => {
      const res = await confirmAmericanaResultAction(matchId);
      if (res.error) setConfirmError(res.error);
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5 space-y-4">
      <p className="text-xs font-bold text-amber-700 uppercase tracking-widest">
        Resultado pendiente de tu validación
      </p>
      {pendingGames && (
        <p className="text-sm text-slate-700">
          La pareja rival ha enviado: <strong>{pendingGames.gamesA} – {pendingGames.gamesB}</strong> games.
        </p>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmPending}
          className="px-4 py-2 bg-gradient-to-br from-emerald-500 to-green-600 text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {confirmPending ? 'Confirmando…' : 'Confirmar'}
        </button>
        <button
          type="button"
          onClick={() => setDisputeOpen((o) => !o)}
          className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors"
        >
          {disputeOpen ? 'Cancelar' : 'Disputar'}
        </button>
      </div>
      {confirmError && <p className="text-sm text-rose-600">{confirmError}</p>}

      {disputeOpen && (
        <form action={disputeAction} className="pt-3 border-t border-slate-100 space-y-3">
          <input type="hidden" name="matchId" value={matchId} />
          <div>
            <label htmlFor="reason" className="block text-sm font-medium text-slate-700 mb-1">
              Motivo de la disputa
            </label>
            <textarea
              id="reason"
              name="reason"
              rows={3}
              required
              minLength={10}
              placeholder="Explica por qué no estás de acuerdo con el resultado enviado…"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent focus:bg-white transition-all resize-none"
            />
          </div>
          <button
            type="submit"
            disabled={disputePending}
            className="px-4 py-2 bg-gradient-to-br from-rose-500 to-red-600 text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {disputePending ? 'Enviando…' : 'Enviar disputa'}
          </button>
          {disputeState?.error && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              {disputeState.error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
