'use client';

import { useState, useActionState } from 'react';
import {
  regenerateCommentaryAction,
  editCommentaryAction,
  deleteCommentaryAction,
} from '../commentary-actions';

type ActionResult = { error: string } | { success: true } | null;

type Props = {
  commentaryId: string;
  matchId: string;
  slug: string;
  currentContent: string;
};

export function CommentaryAdminActions({ commentaryId, matchId, slug, currentContent }: Props) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(currentContent);

  const [regenState, regenAction, regenPending] = useActionState<ActionResult, FormData>(
    regenerateCommentaryAction,
    null,
  );
  const [editState, editAction, editPending] = useActionState<ActionResult, FormData>(
    editCommentaryAction,
    null,
  );
  const [deleteState, deleteAction, deletePending] = useActionState<ActionResult, FormData>(
    deleteCommentaryAction,
    null,
  );

  const errors = [regenState, editState, deleteState].filter(
    (s): s is { error: string } => !!s && 'error' in s,
  );

  if (editing) {
    return (
      <form action={editAction} className="mt-3 space-y-2">
        <input type="hidden" name="commentaryId" value={commentaryId} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="matchId" value={matchId} />
        <textarea
          name="content"
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={4}
          maxLength={1000}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={editPending}
            className="text-xs px-3 py-1.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white font-bold rounded-full shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {editPending ? 'Guardando...' : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setEditContent(currentContent);
            }}
            className="text-xs px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-full hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
        </div>
        {errors.map((e, i) => (
          <p key={i} className="text-xs text-red-600">{e.error}</p>
        ))}
      </form>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2 items-center">
      <form action={regenAction}>
        <input type="hidden" name="commentaryId" value={commentaryId} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="matchId" value={matchId} />
        <button
          type="submit"
          disabled={regenPending}
          className="text-xs px-3 py-1.5 bg-brand-navy/8 text-brand-navy font-semibold rounded-full border border-brand-navy/15 hover:bg-brand-navy/12 disabled:opacity-50 transition-colors"
        >
          {regenPending ? 'Generando...' : 'Regenerar'}
        </button>
      </form>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs px-3 py-1.5 bg-brand-navy/8 text-brand-navy font-semibold rounded-full border border-brand-navy/15 hover:bg-brand-navy/12 transition-colors"
      >
        Editar
      </button>
      <form action={deleteAction}>
        <input type="hidden" name="commentaryId" value={commentaryId} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="matchId" value={matchId} />
        <button
          type="submit"
          disabled={deletePending}
          onClick={(e) => {
            if (!confirm('¿Borrar esta crónica?')) e.preventDefault();
          }}
          className="text-xs px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 font-semibold rounded-full hover:bg-red-100 disabled:opacity-50 transition-colors"
        >
          Borrar
        </button>
      </form>
      {errors.map((e, i) => (
        <p key={i} className="text-xs text-red-600 w-full">{e.error}</p>
      ))}
      {regenState && 'success' in regenState && (
        <p className="text-xs text-emerald-600 w-full">Regenerando — vuelve en unos segundos.</p>
      )}
    </div>
  );
}
