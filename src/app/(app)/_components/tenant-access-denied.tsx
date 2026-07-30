import Link from 'next/link';
import type { Route } from 'next';
import { OrgBrandHeader } from '@/modules/organizations';

/**
 * Shown when a logged-in user browses a tenant subdomain they don't belong to.
 * Deliberately not a 404: the visitor most likely followed a stale link, and
 * telling them how to get in beats pretending the club doesn't exist. It leaks
 * only the org's public name — never its competitions or members.
 */
export function TenantAccessDenied({
  organizationName,
  logoUrl,
}: {
  organizationName: string;
  logoUrl: string | null;
}) {
  return (
    <main className="min-h-screen grid place-items-center px-4 py-12 bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border-t-4 border-brand-yellow p-8 space-y-5">
        <OrgBrandHeader name={organizationName} logoUrl={logoUrl} />
        <div className="space-y-2">
          <h1 className="text-xl font-black text-brand-navy">Zona privada de {organizationName}</h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Tu cuenta no pertenece a este entorno. Para entrar necesitas el enlace de inscripción
            que envía la organización — al abrirlo quedarás dado de alta automáticamente.
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
          <p className="text-xs text-slate-500">
            ¿Te han pasado un enlace de un torneo? Ábrelo de nuevo desde el email o el mensaje
            original. Si no lo encuentras, pídeselo al organizador.
          </p>
        </div>
        <Link
          href={'/login' as Route}
          className="block text-center text-sm font-semibold text-brand-blue hover:underline"
        >
          Entrar con otra cuenta
        </Link>
      </div>
    </main>
  );
}
