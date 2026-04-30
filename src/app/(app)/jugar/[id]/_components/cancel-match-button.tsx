'use client';

import { cancelMatch } from '../actions';

export function CancelMatchButton({ matchId }: { matchId: string }) {
  return (
    <form action={cancelMatch}>
      <input type="hidden" name="matchId" value={matchId} />
      <button
        type="submit"
        onClick={(e) => {
          if (!confirm('¿Seguro que quieres cancelar este partido?')) e.preventDefault();
        }}
        className="text-sm bg-red-50 border border-red-200 text-red-600 font-semibold rounded-xl px-4 py-2 hover:bg-red-100 transition-colors"
      >
        Cancelar partido
      </button>
    </form>
  );
}
