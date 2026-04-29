import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { NotificationsBadge } from './notifications-badge';
import { NavLinks } from './_components/nav-links';
import { MobileMenu } from './_components/mobile-menu';
import { Footer } from './_components/footer';
import { HelpChatWidget } from './_components/help-chat-widget';

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
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(160deg,#e8eef8 0%,#f0f4fb 40%,#f5f7fa 100%)' }}>
      <nav aria-label="Navegación principal" className="bg-gradient-to-r from-brand-navy to-brand-navy-light px-4 sm:px-6 py-1 flex items-center justify-between sticky top-0 z-10 shadow-md overflow-visible">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center shrink-0 -mb-3 sm:-mb-6">
            <Image
              src="/logo.png"
              alt="Padel League"
              width={220}
              height={88}
              className="h-16 sm:h-[5.5rem] w-auto object-contain drop-shadow-lg"
              priority
              unoptimized
            />
          </Link>
          <div className="hidden md:block">
            <NavLinks isSuperAdmin={currentUser.role === 'SUPER_ADMIN'} />
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <NotificationsBadge />
          <div className="hidden md:flex items-center gap-4">
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
          <MobileMenu isSuperAdmin={currentUser.role === 'SUPER_ADMIN'} />
        </div>
      </nav>
      <main className="max-w-6xl w-full mx-auto px-6 py-8 flex-1">{children}</main>
      <Footer />
      <HelpChatWidget />
    </div>
  );
}
