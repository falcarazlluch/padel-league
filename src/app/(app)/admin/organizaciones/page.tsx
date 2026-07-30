import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { OrganizationService } from '@/modules/organizations';
import { getTenant } from '@/shared/tenant/context';
import { rootDomain } from '@/shared/tenant/host';
import { NewOrganizationForm } from './new-organization-form';
import { OrganizationCard } from './organization-card';

export const dynamic = 'force-dynamic';

/**
 * Platform-level tenant management. Only reachable on the apex host: an org
 * admin has no business enumerating the other tenants, so under a subdomain
 * this route simply does not exist.
 */
export default async function OrganizacionesPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const currentUser = await getValidatedSession(token);

  const tenant = await getTenant();
  if (tenant) notFound();
  if (currentUser.role !== 'SUPER_ADMIN') notFound();

  const organizations = await OrganizationService.list(currentUser.id);
  const domain = rootDomain();

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">
          Whitelabel
        </p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Organizaciones</h1>
        <p className="text-sm text-slate-500 mt-1">
          Cada organización tiene su propio subdominio y un entorno aislado: solo ve sus
          competiciones, sus parejas y sus jugadores.
        </p>
      </div>

      <section className="space-y-4">
        {organizations.length === 0 ? (
          <p className="text-sm text-slate-500">
            Todavía no hay ninguna organización. Crea la primera con el formulario de abajo.
          </p>
        ) : (
          organizations.map((org) => (
            <OrganizationCard key={org.id} org={{ ...org, createdAt: org.createdAt.toISOString() }} domain={domain} />
          ))
        )}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        <h2 className="text-base font-semibold text-brand-navy mb-1">Nueva organización</h2>
        <p className="text-xs text-slate-500 mb-4">
          El identificador será el subdominio. Recuerda que el DNS comodín{' '}
          <code className="font-mono">*.{domain}</code> debe apuntar a este despliegue.
        </p>
        <NewOrganizationForm domain={domain} />
      </section>
    </div>
  );
}
