'use client';

import { useActionState } from 'react';
import {
  generateCommentaryNowAction,
  type CommentaryDebugResult,
} from './actions';

export function GenerateCommentaryForm() {
  const [state, action, pending] = useActionState<CommentaryDebugResult | null, FormData>(
    async (_prev, formData) => generateCommentaryNowAction(_prev, formData),
    null,
  );

  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
        <input
          name="matchId"
          required
          placeholder="matchId (cuid)"
          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue focus:bg-white transition-all"
        />
        <select
          name="type"
          defaultValue="RECAP"
          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:bg-white transition-all"
        >
          <option value="PREVIEW">PREVIEW</option>
          <option value="RECAP">RECAP</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center px-4 py-2 bg-brand-navy text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {pending ? 'Generando…' : 'Generar (inline)'}
        </button>
      </div>

      {state && 'error' in state && (
        <p className="text-sm text-rose-600 break-words">
          <span className="font-semibold">Error:</span> {state.error}
        </p>
      )}
      {state && 'ok' in state && (
        <p className="text-sm text-emerald-700">
          {state.existed ? 'Existía y se ha regenerado.' : 'Crónica creada de cero.'}
          {' '}({state.created ? 'fila presente en BD' : 'no se creó fila'})
        </p>
      )}
    </form>
  );
}
