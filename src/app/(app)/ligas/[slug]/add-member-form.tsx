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
          className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={pending}
          className="px-2 py-1 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:opacity-60 transition-colors shrink-0"
        >
          {pending ? '...' : 'Añadir'}
        </button>
      </div>
      {state.error && <p className="text-xs text-red-500">{state.error}</p>}
    </form>
  );
}
