import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import { NuevoPartidoForm } from './_components/nuevo-partido-form';

export const metadata = { title: 'Crear partido — Padel League' };

export default async function NuevoPartidoPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token).catch(() => redirect('/login' as Route));

  // Build the challenge tree: ACTIVE leagues where the user has a registered team,
  // including the rest of the registered teams in that league as possible rivals.
  const leagueRows = await prisma.league.findMany({
    where: {
      status: 'ACTIVE',
      registrations: {
        some: {
          withdrawnAt: null,
          team: { members: { some: { userId: user.id } } },
        },
      },
    },
    select: {
      id: true,
      name: true,
      registrations: {
        where: { withdrawnAt: null },
        select: {
          team: {
            select: {
              id: true,
              name: true,
              members: { select: { userId: true } },
            },
          },
        },
      },
    },
    orderBy: { startDate: 'asc' },
  });

  const challengeLeagues = leagueRows.map((l) => {
    const teams = l.registrations.map((r) => r.team);
    const myTeams = teams
      .filter((t) => t.members.some((m) => m.userId === user.id))
      .map((t) => ({ id: t.id, name: t.name }));
    const rivalTeams = teams
      .filter((t) => !t.members.some((m) => m.userId === user.id))
      .map((t) => ({ id: t.id, name: t.name }));
    return { id: l.id, name: l.name, myTeams, rivalTeams };
  });

  return (
    <div className="max-w-lg">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Crear partido</p>
        <h1 className="text-2xl font-extrabold text-brand-navy mb-6">Nuevo partido</h1>
      </div>
      <NuevoPartidoForm challengeLeagues={challengeLeagues} />
    </div>
  );
}
