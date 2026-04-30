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

  const teams = await prisma.team.findMany({
    where: { members: { some: { userId: user.id } } },
    select: { id: true, name: true, _count: { select: { members: true } } },
    orderBy: { name: 'asc' },
  });

  const myTeams = teams
    .filter((t) => t._count.members === 2)
    .map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="max-w-lg">
      <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Crear partido</p>
      <h1 className="text-2xl font-extrabold text-brand-navy mb-6">Nuevo partido</h1>
      <NuevoPartidoForm myTeams={myTeams} />
    </div>
  );
}
