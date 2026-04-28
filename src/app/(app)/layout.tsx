import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { NotificationsBadge } from './notifications-badge';
import { NavLinks } from './_components/nav-links';

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
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg,#e8eef8 0%,#f0f4fb 40%,#f5f7fa 100%)' }}>
      <nav aria-label="Navegación principal" className="bg-gradient-to-r from-brand-navy to-brand-navy-light px-6 py-1 flex items-center justify-between sticky top-0 z-10 shadow-md overflow-visible">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center shrink-0 -mb-6">
            <Image
              src="/logo.png"
              alt="Padel League"
              width={220}
              height={88}
              className="h-[5.5rem] w-auto object-contain drop-shadow-lg"
              priority
              unoptimized
            />
          </Link>
          <NavLinks isSuperAdmin={currentUser.role === 'SUPER_ADMIN'} />
        </div>
        <div className="flex items-center gap-4">
          <NotificationsBadge />
          <Link
            href="/perfil"
            className="text-sm font-medium text-white/70 hover:text-white transition-colors"
          >
            Mi perfil
          </Link>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="text-sm font-medium text-white/50 hover:text-white/90 transition-colors"
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
