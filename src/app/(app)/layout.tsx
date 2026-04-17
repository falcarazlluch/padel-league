import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
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
    <div>
      <nav style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <a href="/dashboard" style={{ fontWeight: '700', textDecoration: 'none', color: '#111' }}>PadelLeague</a>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <a href="/perfil" style={{ fontSize: '0.875rem', color: '#374151' }}>Mi perfil</a>
          <form action="/api/auth/logout" method="post">
            <button type="submit" style={{ fontSize: '0.875rem', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
              Cerrar sesión
            </button>
          </form>
        </div>
      </nav>
      <main style={{ padding: '1.5rem' }}>{children}</main>
    </div>
  );
}
