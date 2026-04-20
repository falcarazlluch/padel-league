import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { NotificationsBadge } from './notifications-badge';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login');

  let currentUser;
  try {
    currentUser = await getValidatedSession(token);
  } catch {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-brand-navy px-6 py-2.5 flex items-center justify-between sticky top-0 z-10 shadow-md">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center shrink-0">
            <div className="bg-white rounded-lg px-2 py-1">
              <Image
                src="/logo.png"
                alt="Padel League"
                width={120}
                height={48}
                className="h-8 w-auto object-contain"
                priority
                unoptimized
              />
            </div>
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href={'/ligas' as Route}
              className="text-sm font-medium text-white/80 hover:text-white transition-colors"
            >
              Ligas
            </Link>
            <Link
              href={'/partidos' as Route}
              className="text-sm font-medium text-white/80 hover:text-white transition-colors"
            >
              Mis partidos
            </Link>
            {currentUser.role === 'SUPER_ADMIN' && (
              <Link
                href={'/admin/disputas' as Route}
                className="text-sm font-medium text-brand-yellow/90 hover:text-brand-yellow transition-colors"
              >
                Disputas
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <NotificationsBadge />
          <Link
            href="/perfil"
            className="text-sm font-medium text-white/80 hover:text-white transition-colors"
          >
            Mi perfil
          </Link>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="text-sm font-medium text-white/60 hover:text-white/90 transition-colors"
            >
              Salir
            </button>
          </form>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
