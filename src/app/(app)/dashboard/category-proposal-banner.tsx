'use client';

import { useTransition, useState } from 'react';
import { CATEGORY_LABEL } from '@/modules/leagues/presentation/category';
import {
  acceptCategoryProposalAction,
  rejectCategoryProposalAction,
} from '../categoria/actions';

type Proposal = {
  id: string;
  teamName: string;
  leagueName: string;
  fromCategory: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  toCategory: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  reason: 'PROMOTION' | 'DEMOTION';
};

export function CategoryProposalBanner({ proposals }: { proposals: Proposal[] }) {
  if (proposals.length === 0) return null;
  return (
    <section className="space-y-3">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
        Propuestas de cambio de nivel
      </p>
      <div className="space-y-2">
        {proposals.map((p) => (
          <ProposalCard key={p.id} proposal={p} />
        ))}
      </div>
    </section>
  );
}

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isPromotion = proposal.reason === 'PROMOTION';
  const accentClass = isPromotion
    ? 'from-emerald-50 to-emerald-100 border-emerald-200'
    : 'from-amber-50 to-amber-100 border-amber-200';
  const verb = isPromotion ? 'ascender' : 'descender';

  const onAccept = () => {
    setError(null);
    startTransition(async () => {
      const res = await acceptCategoryProposalAction(proposal.id);
      if (res.error) setError(res.error);
    });
  };
  const onReject = () => {
    setError(null);
    startTransition(async () => {
      const res = await rejectCategoryProposalAction(proposal.id);
      if (res.error) setError(res.error);
    });
  };

  return (
    <div className={`rounded-2xl border p-4 bg-gradient-to-br ${accentClass}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm text-slate-700">
          <p className="font-semibold text-slate-900">
            Propuesta para {verb} a <span className="font-bold">{proposal.teamName}</span>
          </p>
          <p className="text-xs text-slate-600 mt-0.5">
            {CATEGORY_LABEL[proposal.fromCategory]} → {CATEGORY_LABEL[proposal.toCategory]} · tras la liga &ldquo;{proposal.leagueName}&rdquo;
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReject}
            disabled={pending}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors"
          >
            Rechazar
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={pending}
            className="px-3 py-1.5 text-xs font-bold rounded-xl bg-brand-navy text-white shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            Aceptar
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
