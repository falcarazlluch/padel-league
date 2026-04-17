import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login');

  try {
    await getValidatedSession(token);
  } catch {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-bold text-gray-900 text-lg">
            PadelLeague
          </Link>
          <Link href={'/ligas' as Route} className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Ligas
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/perfil" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Mi perfil
          </Link>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
