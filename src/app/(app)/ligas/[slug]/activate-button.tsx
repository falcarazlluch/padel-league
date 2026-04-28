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
      className="px-4 py-2 bg-gradient-to-br from-emerald-500 to-green-600 text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap"
    >
      {isPending ? 'Activando...' : 'Activar liga'}
    </button>
  );
}
