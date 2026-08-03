import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { Route } from 'next';
import Link from 'next/link';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { getTenant } from '@/shared/tenant/context';
import { rootDomain } from '@/shared/tenant/host';
import { OrganizationService } from '@/modules/organizations';
import { BrandingForm } from './branding-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Identidad de la organización' };

/**
 * Branding editor, scoped to the admin of *this* tenant.
 *
 * Only reachable from a tenant subdomain: the tenant is taken from the host, so
 * there is no id to tamper with, and an ORG_ADMIN of another club simply never
 * gets here.
 */
export default async function OrganizacionAdminPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const currentUser = await getValidatedSession(token);

  const tenant = await getTenant();
  if (!tenant) notFound();
  if (!(await OrganizationService.canAdminister(tenant.id, currentUser.id))) notFound();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">
          {tenant.name}
        </p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Identidad</h1>
        <p className="text-sm text-slate-500 mt-1">
          El nombre, el logo y los colores con los que se ve todo el entorno, los emails y la app
          instalada.
        </p>
      </div>

      <BrandingForm
        organizationId={tenant.id}
        initial={{
          name: tenant.name,
          tagline: tenant.tagline ?? '',
          logoUrl: tenant.logoUrl ?? '',
          contactEmail: tenant.contactEmail ?? '',
          primaryColor: tenant.primaryColor,
          secondaryColor: tenant.secondaryColor,
          accentColor: tenant.accentColor,
        }}
      />

      <section className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-2">
        <h2 className="text-sm font-bold text-brand-navy">Lo que no se puede cambiar aquí</h2>
        <ul className="text-xs text-slate-500 space-y-1.5">
          <li>
            <strong className="text-slate-600">
              Subdominio: {tenant.slug}.{rootDomain()}
            </strong>{' '}
            — cambiarlo rompería todos los enlaces de inscripción ya repartidos. Si necesitas otro,
            pídelo al administrador de la plataforma.
          </li>
          <li>
            <strong className="text-slate-600">Activar o desactivar la organización</strong> — es una
            decisión de plataforma.
          </li>
        </ul>
        <p className="text-xs text-slate-400 pt-1">
          Los enlaces de inscripción se gestionan en{' '}
          <Link href={'/admin/inscripciones' as Route} className="text-brand-blue underline">
            Inscripciones
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
