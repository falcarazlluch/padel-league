'use client';

import { useActionState } from 'react';
import { forceGenerateCommentaryAction } from '../commentary-actions';

type ActionResult = { error: string } | { success: true } | null;

type Props = {
  matchId: string;
  slug: string;
  type: 'PREVIEW' | 'RECAP';
};

export function CommentaryGenerateButton({ matchId, slug, type }: Props) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    forceGenerateCommentaryAction,
    null,
  );

  const label = type === 'PREVIEW' ? 'Generar previa' : 'Generar crónica';

  return (
    <article className="bg-white rounded-2xl border border-dashed border-slate-300 p-5">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-xs font-bold text-brand-blue uppercase tracking-widest">
          ✨ {type === 'PREVIEW' ? 'Previa' : 'Crónica'}
        </h2>
        <span className="text-xs text-slate-400">No generada todavía</span>
      </header>
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="matchId" value={matchId} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="type" value={type} />
        <button
          type="submit"
          disabled={pending}
          className="self-start text-xs px-3 py-1.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white font-bold rounded-full shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {pending ? 'Generando con IA…' : label}
        </button>
        {state && 'error' in state && (
          <p className="text-xs text-red-600">{state.error}</p>
        )}
      </form>
    </article>
  );
}
