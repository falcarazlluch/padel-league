'use client';

import { useTransition, useState } from 'react';
import type { TeamCategory } from '@prisma/client';
import { CATEGORY_LABEL } from '@/modules/leagues/presentation/category';
import { acceptInvitationAction, rejectInvitationAction } from './actions';

type Item = {
  id: string;
  teamName: string;
  teamCategory: TeamCategory;
  invitedByName: string;
  createdAt: string; // ISO
};

export function IncomingInvitationsList({ invitations }: { invitations: Item[] }) {
  if (invitations.length === 0) return null;
  return (
    <section className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
      <p className="text-xs font-bold text-amber-800 uppercase tracking-widest">Invitaciones recibidas</p>
      <ul className="space-y-2">
        {invitations.map((i) => (
          <InvitationRow key={i.id} item={i} />
        ))}
      </ul>
    </section>
  );
}

function InvitationRow({ item }: { item: Item }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onAccept = () => {
    setError(null);
    startTransition(async () => {
      const r = await acceptInvitationAction(item.id);
      if (r.error) setError(r.error);
    });
  };
  const onReject = () => {
    setError(null);
    startTransition(async () => {
      const r = await rejectInvitationAction(item.id);
      if (r.error) setError(r.error);
    });
  };

  return (
    <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white rounded-xl p-3 border border-amber-200">
      <div className="text-sm text-slate-700">
        <p>
          <span className="font-semibold">{item.invitedByName}</span> te invita a unirte al equipo{' '}
          <span className="font-semibold">&ldquo;{item.teamName}&rdquo;</span>
          <span className="ml-2 text-xs text-slate-400">{CATEGORY_LABEL[item.teamCategory]}</span>
        </p>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onReject}
          disabled={pending}
          className="text-xs px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors"
        >
          Rechazar
        </button>
        <button
          type="button"
          onClick={onAccept}
          disabled={pending}
          className="text-xs px-3 py-1.5 bg-brand-navy text-white font-bold rounded-lg shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          Aceptar
        </button>
      </div>
    </li>
  );
}
