'use client';

import { useActionState, useState, useTransition } from 'react';
import { createOrgInviteLinkAction, revokeInviteLinkAction } from '../../ligas/actions';

export type OrgLinkView = {
  id: string;
  label: string | null;
  shareUrl: string;
  useCount: number;
  maxUses: number | null;
  revoked: boolean;
};

/**
 * The organization-wide inscription link: hand it out once, reuse it all season.
 * Distinct from the per-competition link on a competition's page — this one
 * grants access to the environment, and the player then picks whichever
 * competition is open.
 */
export function OrgInvitePanel({
  organizationName,
  links,
}: {
  organizationName: string;
  links: OrgLinkView[];
}) {
  const [state, formAction, pending] = useActionState(createOrgInviteLinkAction, null);
  const active = links.filter((l) => !l.revoked);
  const revoked = links.filter((l) => l.revoked);

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-brand-navy">
          Enlace de {organizationName}
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Este es el enlace general del club: da de alta en el entorno y luego el jugador elige la
          competición. Sirve toda la temporada, no caduca con un torneo concreto.
        </p>
      </div>

      {active.length > 0 ? (
        <ul className="space-y-3">
          {active.map((link) => (
            <LinkRow key={link.id} link={link} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">
          Todavía no has generado el enlace general. Los jugadores solo pueden entrar con el enlace
          de un torneo concreto.
        </p>
      )}

      <form
        action={formAction}
        className="flex flex-col sm:flex-row sm:items-end gap-2 pt-3 border-t border-slate-100"
      >
        <div className="flex-1">
          <label htmlFor="org-label" className="block text-xs font-medium text-slate-500 mb-1">
            Nombre interno (opcional)
          </label>
          <input
            id="org-label"
            name="label"
            type="text"
            maxLength={80}
            placeholder="Ej: Socios 2026"
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
        <div className="sm:w-36">
          <label htmlFor="org-maxUses" className="block text-xs font-medium text-slate-500 mb-1">
            Máx. altas
          </label>
          <input
            id="org-maxUses"
            name="maxUses"
            type="number"
            min={1}
            placeholder="Sin límite"
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {pending ? 'Generando...' : 'Generar enlace'}
        </button>
      </form>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}

      {revoked.length > 0 && (
        <details className="text-xs text-slate-400">
          <summary className="cursor-pointer">{revoked.length} enlace(s) desactivado(s)</summary>
          <ul className="mt-2 space-y-1">
            {revoked.map((l) => (
              <li key={l.id} className="line-through truncate">
                {l.label ?? l.shareUrl} · {l.useCount} alta(s)
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function LinkRow({ link }: { link: OrgLinkView }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRevoke, startRevoke] = useTransition();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('No se pudo copiar. Selecciona el enlace y cópialo a mano.');
    }
  };

  const revoke = () => {
    if (!confirm('¿Desactivar este enlace? Quien lo abra ya no podrá darse de alta.')) return;
    setError(null);
    startRevoke(async () => {
      const res = await revokeInviteLinkAction(link.id);
      if (res.error) setError(res.error);
    });
  };

  return (
    <li className="bg-slate-50 rounded-xl p-3 space-y-2">
      {link.label && <p className="text-xs font-semibold text-slate-600">{link.label}</p>}
      <div className="flex gap-2">
        <input
          readOnly
          value={link.shareUrl}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Enlace de la organización"
          className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-600"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className="px-3 py-2 bg-brand-navy text-white text-xs font-bold rounded-lg hover:opacity-90 transition-opacity shrink-0"
        >
          {copied ? '¡Copiado!' : 'Copiar'}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>
          {link.useCount} alta(s){link.maxUses != null ? ` de ${link.maxUses}` : ''}
        </span>
        <button
          type="button"
          onClick={revoke}
          disabled={pendingRevoke}
          className="text-red-600 font-semibold hover:underline disabled:opacity-60"
        >
          {pendingRevoke ? 'Desactivando...' : 'Desactivar'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </li>
  );
}
