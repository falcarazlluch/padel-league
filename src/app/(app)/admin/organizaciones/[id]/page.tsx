import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import type { Metadata } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { OrganizationService } from '@/modules/organizations';
import { getTenant } from '@/shared/tenant/context';
import { rootDomain } from '@/shared/tenant/host';
import { BrandingForm } from '../../organizacion/branding-form';
import { updateOrgIdentityAsPlatformAction } from '../actions';
import { AddMemberForm } from './add-member-form';
import { MembersTable } from './members-table';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Organización' };

/**
 * One tenant, from the platform's side: its identity and its people.
 *
 * The club's own admin edits the same branding at `/admin/organizacion` under
 * their subdomain, where the tenant comes from the host. Here there is no host to
 * read — the platform admin works from the apex domain — so the id comes from the
 * route and every action re-checks SUPER_ADMIN. Under a subdomain this page does
 * not exist at all: an ORG_ADMIN has no business editing other clubs.
 */
export default async function OrganizacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const currentUser = await getValidatedSession(token);

  if (await getTenant()) notFound();
  if (currentUser.role !== 'SUPER_ADMIN') notFound();

  const org = await OrganizationService.getSummary(id, currentUser.id);
  if (!org) notFound();

  const members = await OrganizationService.listMembers(org.id, currentUser.id);
  const domain = rootDomain();

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <Link
          href={'/admin/organizaciones' as Route}
          className="text-xs font-semibold text-brand-blue hover:underline"
        >
          ← Organizaciones
        </Link>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <h1 className="text-2xl font-extrabold text-brand-navy">{org.name}</h1>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
              org.isActive
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            {org.isActive ? 'Activa' : 'Desactivada'}
          </span>
        </div>
        <a
          href={`https://${org.slug}.${domain}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-mono text-brand-blue hover:underline"
        >
          {org.slug}.{domain}
        </a>
        <p className="text-sm text-slate-500 mt-2">
          {org.memberCount} miembro(s) · {org.adminCount} admin(s) · {org.competitionCount}{' '}
          competición(es) · desde{' '}
          {org.createdAt.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-brand-navy">Identidad</h2>
          <p className="text-sm text-slate-500 mt-1">
            El nombre, el logo y los colores con los que el club ve toda la app, sus emails y la
            versión instalada. Lo mismo que edita su propio administrador, editable también desde
            aquí.
          </p>
        </div>
        <BrandingForm
          organizationId={org.id}
          action={updateOrgIdentityAsPlatformAction}
          sendOrganizationId
          initial={{
            name: org.name,
            tagline: org.tagline ?? '',
            logoUrl: org.logoUrl ?? '',
            contactEmail: org.contactEmail ?? '',
            primaryColor: org.primaryColor,
            secondaryColor: org.secondaryColor,
            accentColor: org.accentColor,
          }}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-brand-navy">Usuarios del club</h2>
          <p className="text-sm text-slate-500 mt-1">
            Quién pertenece a {org.name} y con qué papel. Los contadores de parejas e inscripciones
            son solo de este club.
          </p>
        </div>
        <MembersTable
          organizationId={org.id}
          organizationName={org.name}
          members={members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() }))}
        />
        <AddMemberForm organizationId={org.id} organizationName={org.name} />
      </section>

      <section className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-2">
        <h2 className="text-sm font-bold text-brand-navy">Lo que no se cambia aquí</h2>
        <ul className="text-xs text-slate-500 space-y-1.5">
          <li>
            <strong className="text-slate-600">
              El subdominio ({org.slug}.{domain})
            </strong>{' '}
            — cambiarlo rompería todos los enlaces de inscripción ya repartidos.
          </li>
          <li>
            <strong className="text-slate-600">Activar o desactivar la organización</strong> — se
            hace desde la tarjeta en{' '}
            <Link href={'/admin/organizaciones' as Route} className="text-brand-blue underline">
              Organizaciones
            </Link>
            .
          </li>
        </ul>
      </section>
    </div>
  );
}
