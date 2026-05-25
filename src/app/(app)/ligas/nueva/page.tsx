import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { NuevaLigaForm } from './nueva-liga-form';

export default async function NuevaLigaPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token);

  if (user.role !== 'SUPER_ADMIN' && user.role !== 'LEAGUE_ADMIN') {
    redirect('/ligas' as Route);
  }

  return (
    <div className="max-w-lg">
      <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Nueva competición</p>
      <h1 className="text-2xl font-extrabold text-brand-navy mb-6">Nueva competición</h1>
      <NuevaLigaForm />
    </div>
  );
}
