'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { addTeamMemberAction } from '../actions';

type FormState = { error?: string };
const initial: FormState = {};

export function AddMemberForm({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (_prev: FormState, formData: FormData): Promise<FormState> => {
      const result = await addTeamMemberAction(_prev, formData);
      if (!result.error) router.refresh();
      return result;
    },
    initial,
  );

  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="teamId" value={teamId} />
      <div className="flex gap-1.5">
        <input
          name="userEmail"
          type="email"
          required
          placeholder="Email del jugador"
          className="flex-1 min-w-0 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
        <button
          type="submit"
          disabled={pending}
          className="px-3 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-xs font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
        >
          {pending ? '...' : 'Añadir'}
        </button>
      </div>
      {state.error && <p className="text-xs text-red-500">{state.error}</p>}
    </form>
  );
}
