'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { activateLeagueAction } from '../actions';

export function ActivateLeagueButton({ leagueId }: { leagueId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      const result = await activateLeagueAction(leagueId);
      if (result.error) {
        alert(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-60 transition-colors whitespace-nowrap"
    >
      {isPending ? 'Activando...' : 'Activar liga'}
    </button>
  );
}
