'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useState, useTransition } from 'react';
import { setOrgActiveAction } from './actions';

type OrgView = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  contactEmail: string | null;
  tagline: string | null;
  isActive: boolean;
  /** ISO string — serialised across the client boundary. */
  createdAt: string;
  memberCount: number;
  adminCount: number;
  competitionCount: number;
};

export function OrganizationCard({ org, domain }: { org: OrgView; domain: string }) {
  const [togglePending, startToggle] = useTransition();
  const [toggleError, setToggleError] = useState<string | null>(null);

  const toggle = () => {
    const msg = org.isActive
      ? `¿Desactivar ${org.name}? Su subdominio dejará de servir el entorno.`
      : `¿Reactivar ${org.name}?`;
    if (!confirm(msg)) return;
    setToggleError(null);
    startToggle(async () => {
      const res = await setOrgActiveAction(org.id, !org.isActive);
      if (res.error) setToggleError(res.error);
    });
  };

  return (
    <article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {org.logoUrl ? (
            // Club logos live on arbitrary hosts — a plain <img> avoids having
            // to allowlist each one in the image optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={org.logoUrl}
              alt={org.name}
              className="h-11 w-11 rounded-xl object-contain bg-white border border-slate-100 p-1"
            />
          ) : (
            <span
              className="h-11 w-11 rounded-xl grid place-items-center text-white font-black"
              style={{ backgroundColor: org.primaryColor }}
              aria-hidden
            >
              {org.name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="font-bold text-brand-navy truncate">{org.name}</p>
            <a
              href={`https://${org.slug}.${domain}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-mono text-brand-blue hover:underline"
            >
              {org.slug}.{domain}
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
              org.isActive
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            {org.isActive ? 'Activa' : 'Desactivada'}
          </span>
          <Link
            href={`/admin/organizaciones/${org.id}` as Route}
            className="text-xs px-3 py-1.5 bg-brand-navy text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
          >
            Gestionar
          </Link>
          <button
            type="button"
            onClick={toggle}
            disabled={togglePending}
            className="text-xs px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors"
          >
            {togglePending ? '...' : org.isActive ? 'Desactivar' : 'Reactivar'}
          </button>
        </div>
      </div>
      {toggleError && <p className="text-xs text-red-600">{toggleError}</p>}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>{org.memberCount} miembro(s)</span>
        <span>{org.adminCount} admin(s)</span>
        <span>{org.competitionCount} competición(es)</span>
        {org.contactEmail && <span>{org.contactEmail}</span>}
      </div>

      {org.adminCount === 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Nadie de {org.name} puede administrar su entorno todavía: sin un administrador, el club no
          crea competiciones ni reparte enlaces de inscripción.{' '}
          <Link href={`/admin/organizaciones/${org.id}` as Route} className="underline font-semibold">
            Nombrar uno
          </Link>
          .
        </p>
      )}
    </article>
  );
}
