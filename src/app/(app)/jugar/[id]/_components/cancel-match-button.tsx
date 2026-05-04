'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { useEffect } from 'react';
import { cancelMatchAction } from '../actions';

type ActionResult = { error: string } | { success: true };

export function CancelMatchButton({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => cancelMatchAction(_prev, formData),
    null,
  );

  useEffect(() => {
    if (state && 'success' in state) {
      router.push('/jugar' as Route);
    }
  }, [state, router]);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm('¿Seguro que quieres cancelar este partido?')) e.preventDefault();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="matchId" value={matchId} />
      <button
        type="submit"
        disabled={pending}
        className="text-sm bg-red-50 border border-red-200 text-red-600 font-semibold rounded-xl px-4 py-2 hover:bg-red-100 disabled:opacity-50 transition-colors"
      >
        {pending ? 'Cancelando…' : 'Cancelar partido'}
      </button>
      {state && 'error' in state && (
        <p className="text-sm text-rose-600">{state.error}</p>
      )}
    </form>
  );
}
