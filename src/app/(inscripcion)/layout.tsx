import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { getTenant } from '@/shared/tenant/context';
import { OrgBrandHeader } from '@/modules/organizations';

/**
 * Shell for the guided-enrolment surfaces (`/inscripcion/**`, `/pareja/**`).
 *
 * Deliberately outside `(app)`: these pages must render for visitors with no
 * session and no org membership yet — that is the whole point of an invite
 * link — so they cannot sit under a layout that redirects to /login.
 */
export default async function InscripcionLayout({ children }: { children: ReactNode }) {
  const tenant = await getTenant();

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-slate-50 to-slate-100">
      <header className="bg-white/80 backdrop-blur border-b border-slate-200/70 sticky top-0 z-30">
        <div
          className="max-w-3xl mx-auto px-4 py-3"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
        >
          {tenant ? (
            <OrgBrandHeader
              name={tenant.name}
              logoUrl={tenant.logoUrl}
              tagline={tenant.tagline}
              size="sm"
            />
          ) : (
            <p className="font-black text-brand-navy">Padel League</p>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-10">{children}</main>

      <footer className="border-t border-slate-200/70 py-4">
        <div className="max-w-3xl mx-auto px-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          <span>{tenant ? `${tenant.name} · Padel League` : 'Padel League'}</span>
          <Link href={'/privacidad' as Route} className="hover:text-slate-600">
            Privacidad
          </Link>
          <Link href={'/aviso-legal' as Route} className="hover:text-slate-600">
            Aviso legal
          </Link>
        </div>
      </footer>
    </div>
  );
}
