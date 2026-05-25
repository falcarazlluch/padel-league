'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Route } from 'next';

function linkClass(active: boolean) {
  return active
    ? 'text-sm font-semibold bg-brand-yellow/20 text-brand-yellow border border-brand-yellow/30 px-3 py-1 rounded-full transition-colors'
    : 'text-sm font-medium text-white/70 hover:text-white transition-colors';
}

export function NavLinks({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const pathname = usePathname();

  const partidosActive =
    pathname.startsWith('/partidos') || pathname === '/jugar' || pathname.startsWith('/jugar?') || pathname.startsWith('/jugar/');

  return (
    <div className="flex items-center gap-6">
      <Link href={'/ligas' as Route} className={linkClass(pathname.startsWith('/ligas'))} aria-current={pathname.startsWith('/ligas') ? 'page' : undefined}>
        Competiciones
      </Link>
      <Link href={'/equipos' as Route} className={linkClass(pathname.startsWith('/equipos'))} aria-current={pathname.startsWith('/equipos') ? 'page' : undefined}>
        Mis equipos
      </Link>
      <Link href={'/partidos' as Route} className={linkClass(partidosActive)} aria-current={partidosActive ? 'page' : undefined}>
        Partidos
      </Link>
      <Link href={'/reglamento' as Route} className={linkClass(pathname.startsWith('/reglamento'))} aria-current={pathname.startsWith('/reglamento') ? 'page' : undefined}>
        Reglamento
      </Link>
      <Link href={'/como-funciona' as Route} className={linkClass(pathname.startsWith('/como-funciona'))} aria-current={pathname.startsWith('/como-funciona') ? 'page' : undefined}>
        Ayuda
      </Link>
      <Link href={'/invitar' as Route} className={linkClass(pathname.startsWith('/invitar'))} aria-current={pathname.startsWith('/invitar') ? 'page' : undefined}>
        Invitar
      </Link>
      {isSuperAdmin && (
        <>
          <Link
            href={'/admin/disputas' as Route}
            className={linkClass(pathname.startsWith('/admin/disputas'))}
            aria-current={pathname.startsWith('/admin/disputas') ? 'page' : undefined}
          >
            Disputas
          </Link>
          <Link
            href={'/admin/usuarios' as Route}
            className={linkClass(pathname.startsWith('/admin/usuarios'))}
            aria-current={pathname.startsWith('/admin/usuarios') ? 'page' : undefined}
          >
            Usuarios
          </Link>
          <Link
            href={'/admin/codigos-registro' as Route}
            className={linkClass(pathname.startsWith('/admin/codigos-registro'))}
            aria-current={pathname.startsWith('/admin/codigos-registro') ? 'page' : undefined}
          >
            Códigos
          </Link>
          <Link
            href={'/admin/cola' as Route}
            className={linkClass(pathname.startsWith('/admin/cola'))}
            aria-current={pathname.startsWith('/admin/cola') ? 'page' : undefined}
          >
            Cola
          </Link>
        </>
      )}
    </div>
  );
}
