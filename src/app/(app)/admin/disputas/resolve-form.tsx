'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { resolveDisputeAction } from './actions';

type FormState = { error?: string };
const initial: FormState = {};

export function ResolveDisputeForm({ disputeId }: { disputeId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (_prev: FormState, formData: FormData): Promise<FormState> => {
      const result = await resolveDisputeAction(_prev, formData);
      if (!result.error) router.refresh();
      return result;
    },
    initial,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="disputeId" value={disputeId} />

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Resolución</label>
          <select
            name="resolution"
            required
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Seleccionar...</option>
            <option value="AWARD_PROPONENT">Dar la razón al denunciante</option>
            <option value="AWARD_OPPONENT">Dar la razón al denunciado</option>
            <option value="BOTH_LOST">Derrota para ambos (0 pts)</option>
            <option value="EXTEND_DEADLINE">Ampliar plazo</option>
            <option value="DISMISS">Desestimar disputa (empate)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Nueva fecha límite (solo si amplías plazo)</label>
          <input
            type="datetime-local"
            name="newDeadlineAt"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Nota del administrador (opcional)</label>
        <textarea
          name="adminNote"
          rows={2}
          maxLength={2000}
          placeholder="Explicación de la resolución para los jugadores..."
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
        />
      </div>

      {state.error && (
        <p className="text-sm text-red-500">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-60 transition-colors"
      >
        {pending ? 'Resolviendo...' : 'Resolver disputa'}
      </button>
    </form>
  );
}
