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
    // Cookie is present but the session is invalid (expired, revoked, or
    // user deleted). We MUST clear the cookie before redirecting — otherwise
    // middleware sees the cookie on /login and bounces back to /dashboard,
    // looping until the browser gives up with ERR_TOO_MANY_REDIRECTS.
    cookieStore.delete(SESSION_COOKIE);
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
          <div className="hidden md:flex items-center gap-2">
            <Link
              href="/perfil"
              className="text-sm font-medium text-white/90 hover:text-white transition-colors max-w-[12rem] truncate"
              title="Mi perfil"
            >
              {currentUser.name}
            </Link>
            <Link
              href="/perfil"
              className="text-white/70 hover:text-white transition-colors p-1"
              aria-label="Configuración de mi perfil"
              title="Configuración"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
          </div>
          <NotificationsBadge />
          <MobileMenu
            isSuperAdmin={currentUser.role === 'SUPER_ADMIN'}
            userName={currentUser.name}
            userEmail={currentUser.email}
          />
        </div>
      </nav>
      <main className="max-w-6xl w-full mx-auto px-6 py-8 flex-1">{children}</main>
      <Footer />
      <HelpChatWidget />
    </div>
  );
}
