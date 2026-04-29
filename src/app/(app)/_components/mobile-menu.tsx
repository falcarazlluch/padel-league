'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Route } from 'next';

function linkClass(active: boolean) {
  return active
    ? 'block px-4 py-3 text-sm font-semibold bg-brand-yellow/10 text-brand-navy border-l-4 border-brand-yellow'
    : 'block px-4 py-3 text-sm font-medium text-slate-700 hover:bg-gray-50 border-l-4 border-transparent transition-colors';
}

export function MobileMenu({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const close = () => setOpen(false);

  return (
    <div ref={ref} className="md:hidden relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-white/90 hover:text-white p-1 transition-colors"
        aria-label="Menú"
        aria-expanded={open}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          {open ? (
            <>
              <path d="M6 6 L18 18" />
              <path d="M18 6 L6 18" />
            </>
          ) : (
            <>
              <path d="M3 6 L21 6" />
              <path d="M3 12 L21 12" />
              <path d="M3 18 L21 18" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] max-w-xs bg-white border border-slate-200/80 rounded-2xl shadow-lg z-50 overflow-hidden">
          <Link href={'/ligas' as Route} onClick={close} className={linkClass(pathname.startsWith('/ligas'))}>
            Ligas
          </Link>
          <Link href={'/partidos' as Route} onClick={close} className={linkClass(pathname.startsWith('/partidos'))}>
            Mis partidos
          </Link>
          <Link href={'/jugar' as Route} onClick={close} className={linkClass(pathname.startsWith('/jugar'))}>
            Jugar
          </Link>
          <Link href={'/reglamento' as Route} onClick={close} className={linkClass(pathname.startsWith('/reglamento'))}>
            Reglamento
          </Link>
          {isSuperAdmin && (
            <Link href={'/admin/disputas' as Route} onClick={close} className={linkClass(pathname.startsWith('/admin/disputas'))}>
              Disputas
            </Link>
          )}
          <div className="border-t border-gray-100" />
          <Link href={'/perfil' as Route} onClick={close} className={linkClass(pathname.startsWith('/perfil'))}>
            Mi perfil
          </Link>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="block w-full text-left px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 border-l-4 border-transparent transition-colors"
            >
              Salir
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
