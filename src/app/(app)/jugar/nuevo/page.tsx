import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { NuevoPartidoForm } from './_components/nuevo-partido-form';

export const metadata = { title: 'Crear partido — Padel League' };

export default async function NuevoPartidoPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  await getValidatedSession(token).catch(() => redirect('/login' as Route));

  return (
    <div className="max-w-lg">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Crear partido</p>
        <h1 className="text-2xl font-extrabold text-brand-navy mb-6">Nuevo partido</h1>
      </div>
      <NuevoPartidoForm />
    </div>
  );
}
