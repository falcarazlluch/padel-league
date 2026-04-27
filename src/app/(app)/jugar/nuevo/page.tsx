import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { IndependentMatchService } from '@/modules/independent-matches';
import { NuevoPartidoForm } from './_components/nuevo-partido-form';

export const metadata = { title: 'Crear partido — Padel League' };

export default async function NuevoPartidoPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token).catch(() => redirect('/login' as Route));

  const userTeams = await IndependentMatchService.getTeamsForUser(user.id);

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Crear partido</h1>
      <NuevoPartidoForm userTeams={userTeams} />
    </div>
  );
}
