'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitResultAction } from '../actions';

type SetRow = { gamesA: string; gamesB: string };
type State = { error?: string };

export function SubmitResultForm({
  matchId,
  teamAName,
  teamBName,
}: {
  matchId: string;
  teamAName: string;
  teamBName: string;
}) {
  const router = useRouter();
  const [sets, setSets] = useState<SetRow[]>([
    { gamesA: '', gamesB: '' },
    { gamesA: '', gamesB: '' },
  ]);

  const [state, formAction, pending] = useActionState(
    async (_prev: State, formData: FormData): Promise<State> => {
      const result = await submitResultAction(_prev, formData);
      if (!result.error) router.refresh();
      return result;
    },
    {},
  );

  function addSet() {
    if (sets.length < 5) setSets((prev) => [...prev, { gamesA: '', gamesB: '' }]);
  }

  function removeSet() {
    if (sets.length > 2) setSets((prev) => prev.slice(0, -1));
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
      <h3 className="font-bold text-brand-navy mb-4">Registrar resultado</h3>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="matchId" value={matchId} />
        <input type="hidden" name="setsCount" value={sets.length} />

        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 text-xs font-medium text-gray-500 text-center">
            <span>{teamAName}</span>
            <span />
            <span>{teamBName}</span>
          </div>
          {sets.map((set, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <input
                name={`gamesA_${i}`}
                type="number"
                min={0}
                max={9}
                required
                value={set.gamesA}
                onChange={(e) =>
                  setSets((prev) =>
                    prev.map((s, j) => (j === i ? { ...s, gamesA: e.target.value } : s)),
                  )
                }
                className="w-full text-center px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
              />
              <span className="text-xs text-gray-400 font-medium">Set {i + 1}</span>
              <input
                name={`gamesB_${i}`}
                type="number"
                min={0}
                max={9}
                required
                value={set.gamesB}
                onChange={(e) =>
                  setSets((prev) =>
                    prev.map((s, j) => (j === i ? { ...s, gamesB: e.target.value } : s)),
                  )
                }
                className="w-full text-center px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
              />
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          {sets.length < 5 && (
            <button
              type="button"
              onClick={addSet}
              className="text-xs px-3 py-1.5 bg-white border border-gray-200 text-slate-700 font-semibold rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
            >
              + Set
            </button>
          )}
          {sets.length > 2 && (
            <button
              type="button"
              onClick={removeSet}
              className="text-xs px-3 py-1.5 bg-white border border-gray-200 text-slate-700 font-semibold rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
            >
              − Quitar set
            </button>
          )}
        </div>

        {state.error && <p className="text-sm text-red-500">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {pending ? 'Enviando...' : 'Enviar resultado'}
        </button>
      </form>
    </div>
  );
}
