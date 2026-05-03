'use client';

import { useActionState, useState } from 'react';
import { updateScheduledAtAction } from '../actions';

type ActionResult = { error: string } | { success: true };

interface Props {
  matchId: string;
  /** ISO string or null. */
  initialScheduledAt: string | null;
}

/**
 * Convert an ISO timestamp to the local-time format `datetime-local` expects:
 * `YYYY-MM-DDTHH:MM` in the user's local timezone.
 */
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EditDateButton({ matchId, initialScheduledAt }: Props) {
  const [editing, setEditing] = useState(false);
  const [dateMode, setDateMode] = useState<'fixed' | 'open'>(initialScheduledAt ? 'fixed' : 'open');
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => {
      const res = await updateScheduledAtAction(_prev, formData);
      if (res && 'success' in res) {
        setEditing(false);
      }
      return res;
    },
    null,
  );

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs font-semibold text-brand-blue hover:text-brand-navy transition-colors"
      >
        ✎ Editar fecha
      </button>
    );
  }

  return (
    <form action={action} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
      <input type="hidden" name="matchId" value={matchId} />

      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Fecha y hora</p>
        <div className="flex gap-2">
          <label className="flex-1 cursor-pointer">
            <input
              type="radio"
              name="dateMode"
              value="fixed"
              checked={dateMode === 'fixed'}
              onChange={() => setDateMode('fixed')}
              className="peer sr-only"
            />
            <span className="block text-center text-xs font-medium px-3 py-2 rounded-lg border border-slate-200 peer-checked:bg-brand-navy peer-checked:text-white peer-checked:border-brand-navy transition-colors">
              Fecha definida
            </span>
          </label>
          <label className="flex-1 cursor-pointer">
            <input
              type="radio"
              name="dateMode"
              value="open"
              checked={dateMode === 'open'}
              onChange={() => setDateMode('open')}
              className="peer sr-only"
            />
            <span className="block text-center text-xs font-medium px-3 py-2 rounded-lg border border-slate-200 peer-checked:bg-brand-navy peer-checked:text-white peer-checked:border-brand-navy transition-colors">
              Por definir
            </span>
          </label>
        </div>
      </div>

      {dateMode === 'fixed' && (
        <input
          name="scheduledAt"
          type="datetime-local"
          required
          defaultValue={toDatetimeLocalValue(initialScheduledAt)}
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent transition-all"
        />
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-bold px-3 py-2 bg-brand-navy text-white rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {pending ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
          className="text-sm font-semibold px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
      </div>

      {state && 'error' in state && <p className="text-xs text-rose-600">{state.error}</p>}
      <p className="text-[11px] text-slate-400">Al guardar, se notificará al resto de jugadores.</p>
    </form>
  );
}
