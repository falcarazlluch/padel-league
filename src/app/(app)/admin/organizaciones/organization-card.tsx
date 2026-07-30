'use client';

import { useActionState, useState, useTransition } from 'react';
import { setOrgActiveAction, setOrgMemberRoleAction } from './actions';

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
  const [state, formAction, pending] = useActionState(setOrgMemberRoleAction, null);
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

      <form action={formAction} className="flex flex-col sm:flex-row sm:items-end gap-2 pt-3 border-t border-slate-100">
        <input type="hidden" name="organizationId" value={org.id} />
        <div className="flex-1">
          <label
            htmlFor={`email-${org.id}`}
            className="block text-xs font-medium text-slate-500 mb-1"
          >
            Añadir miembro por email
          </label>
          <input
            id={`email-${org.id}`}
            name="email"
            type="email"
            required
            placeholder="admin@club.es"
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
        <div className="sm:w-44">
          <label htmlFor={`role-${org.id}`} className="block text-xs font-medium text-slate-500 mb-1">
            Rol
          </label>
          <select
            id={`role-${org.id}`}
            name="role"
            defaultValue="ORG_ADMIN"
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          >
            <option value="ORG_ADMIN">Administrador</option>
            <option value="ORG_PLAYER">Jugador</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-brand-navy text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {pending ? 'Añadiendo...' : 'Añadir'}
        </button>
      </form>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state?.success && <p className="text-xs text-emerald-700">{state.success}</p>}
      <p className="text-xs text-slate-400">
        La cuenta debe existir ya en la plataforma. Un administrador de organización puede crear
        competiciones y generar enlaces de inscripción, pero solo dentro de {org.name}.
      </p>
    </article>
  );
}
