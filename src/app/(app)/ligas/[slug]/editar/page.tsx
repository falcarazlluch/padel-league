import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { LeagueService } from '@/modules/leagues';
import { isLeagueAdmin } from '@/shared/auth/rbac';
import { EditLeagueForm } from './edit-form';
import { getTenant } from '@/shared/tenant/context';
import { OrganizationService } from '@/modules/organizations';

export default async function EditarLigaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const currentUser = await getValidatedSession(token);

  const tenant = await getTenant();
  const league = await LeagueService.getBySlug(slug, tenant?.id ?? null).catch(() => null);
  if (!league) notFound();

  // Inside a tenant the gatekeeper is ORG_ADMIN, not the platform's
  // creator-or-LEAGUE_ADMIN rule.
  const canEdit = tenant
    ? await OrganizationService.canAdminister(tenant.id, currentUser.id)
    : isLeagueAdmin(currentUser, league.createdByUserId);
  if (!canEdit) {
    redirect(`/ligas/${slug}` as Route);
  }

  return (
    <div className="max-w-lg">
      <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Editar competición</p>
      <h1 className="text-2xl font-extrabold text-brand-navy mb-6">{league.name}</h1>
      <EditLeagueForm
        leagueId={league.id}
        slug={league.slug}
        initialName={league.name}
        initialDescription={league.description ?? ''}
        initialRegistrationStart={league.registrationStart.toISOString().slice(0, 10)}
        initialRegistrationEnd={league.registrationEnd.toISOString().slice(0, 10)}
        initialStartDate={league.startDate.toISOString().slice(0, 10)}
        initialEndDate={league.endDate.toISOString().slice(0, 10)}
        initialCategory={league.category}
        canDelete={currentUser.role === 'SUPER_ADMIN'}
      />
    </div>
  );
}
