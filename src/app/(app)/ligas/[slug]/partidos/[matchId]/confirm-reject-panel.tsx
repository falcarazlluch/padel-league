'use client';

import { useActionState, useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirmResultAction, disputeResultAction } from '../actions';

type State = { error?: string };

export function ConfirmRejectPanel({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isPendingConfirm, startConfirmTransition] = useTransition();

  const [disputeState, disputeAction, disputePending] = useActionState(
    async (_prev: State, formData: FormData): Promise<State> => {
      const result = await disputeResultAction(_prev, formData);
      if (!result.error) router.refresh();
      return result;
    },
    {},
  );

  function handleConfirm() {
    startConfirmTransition(async () => {
      const result = await confirmResultAction(matchId);
      if (result.error) {
        setConfirmError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      {confirmError && <p className="text-sm text-red-500">{confirmError}</p>}

      {!showDisputeForm && (
        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={isPendingConfirm}
            className="flex-1 py-2.5 bg-gradient-to-br from-emerald-500 to-green-600 text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isPendingConfirm ? 'Confirmando...' : 'Confirmar resultado'}
          </button>
          <button
            onClick={() => setShowDisputeForm(true)}
            className="flex-1 py-2.5 bg-red-50 border border-red-200 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-100 transition-colors"
          >
            Disputar
          </button>
        </div>
      )}

      {showDisputeForm && (
        <form action={disputeAction} className="space-y-3">
          <input type="hidden" name="matchId" value={matchId} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Motivo de la disputa
            </label>
            <textarea
              name="reason"
              required
              minLength={10}
              maxLength={1000}
              rows={3}
              placeholder="Describe el problema con el resultado enviado..."
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all resize-none"
            />
          </div>
          {disputeState.error && (
            <p className="text-sm text-red-500">{disputeState.error}</p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowDisputeForm(false)}
              className="flex-1 py-2 bg-white border border-gray-200 text-slate-700 text-sm font-semibold rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={disputePending}
              className="flex-1 py-2 bg-red-50 border border-red-200 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              {disputePending ? 'Enviando...' : 'Enviar disputa'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
