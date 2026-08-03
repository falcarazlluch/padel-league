import { OrgBrandHeader } from '@/modules/organizations';
import { originForTenant } from '@/shared/tenant/host';

/**
 * Shown when a logged-in user browses a tenant subdomain they don't belong to.
 * Deliberately not a 404: the visitor most likely followed a stale link, and
 * telling them how to get in beats pretending the club doesn't exist. It leaks
 * only the org's public name — never its competitions or members.
 *
 * "Entrar con otra cuenta" MUST clear the session before reaching /login.
 * A plain link there is a trap: middleware sees the still-valid cookie, treats
 * /login as an auth route and bounces the user to /dashboard, which lands right
 * back on this screen — the button looks broken because it returns you to where
 * you already were.
 */
export function TenantAccessDenied({
  organizationName,
  logoUrl,
  userEmail,
}: {
  organizationName: string;
  logoUrl: string | null;
  /** Shown so the user can tell at a glance which account lacks access. */
  userEmail: string;
}) {
  const publicUrl = originForTenant(null);

  return (
    <main className="min-h-screen grid place-items-center px-4 py-12 bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border-t-4 border-brand-yellow p-8 space-y-5">
        <OrgBrandHeader name={organizationName} logoUrl={logoUrl} />
        <div className="space-y-2">
          <h1 className="text-xl font-black text-brand-navy">Zona privada de {organizationName}</h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Has entrado como <strong className="text-slate-800">{userEmail}</strong>, y esa cuenta no
            pertenece a este entorno. Para entrar necesitas el enlace de inscripción que envía la
            organización — al abrirlo quedarás dado de alta automáticamente.
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
          <p className="text-xs text-slate-500">
            ¿Te han pasado un enlace de un torneo? Ábrelo de nuevo desde el email o el mensaje
            original. Si no lo encuentras, pídeselo al organizador.
          </p>
        </div>
        <div className="space-y-2">
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="w-full px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 transition-opacity"
            >
              Cerrar sesión y entrar con otra cuenta
            </button>
          </form>
          <a
            href={publicUrl}
            className="block text-center text-sm font-semibold text-brand-blue hover:underline"
          >
            Volver a Padel League
          </a>
        </div>
      </div>
    </main>
  );
}
