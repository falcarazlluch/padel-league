import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { LeagueService } from '@/modules/leagues';
import { prisma } from '@/shared/db/client';
import { EditLeagueForm } from './edit-form';

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

  const league = await LeagueService.getBySlug(slug).catch(() => null);
  if (!league) notFound();

  const isLeagueAdmin =
    currentUser.role === 'SUPER_ADMIN' ||
    !!(await prisma.leagueMember.findFirst({
      where: { leagueId: league.id, userId: currentUser.id, role: 'LEAGUE_ADMIN' },
    }));
  if (!isLeagueAdmin) {
    redirect(`/ligas/${slug}` as Route);
  }

  return (
    <div className="max-w-lg">
      <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Editar liga</p>
      <h1 className="text-2xl font-extrabold text-brand-navy mb-6">{league.name}</h1>
      <EditLeagueForm
        leagueId={league.id}
        slug={league.slug}
        initialName={league.name}
        initialDescription={league.description ?? ''}
        initialEndDate={league.endDate.toISOString().slice(0, 10)}
        canDelete={currentUser.role === 'SUPER_ADMIN'}
      />
    </div>
  );
}
