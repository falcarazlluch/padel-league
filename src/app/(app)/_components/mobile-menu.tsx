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

interface Props {
  isSuperAdmin: boolean;
  /** ORG_ADMIN of the current tenant (or platform SUPER_ADMIN). */
  isOrgAdmin?: boolean;
  /** Rendering under a whitelabel subdomain. */
  inTenant?: boolean;
  userName: string;
  userEmail: string;
}

export function MobileMenu({
  isSuperAdmin,
  isOrgAdmin = false,
  inTenant = false,
  userName,
  userEmail,
}: Props) {
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

  const partidosActive =
    pathname.startsWith('/partidos') || pathname === '/jugar' || pathname.startsWith('/jugar?') || pathname.startsWith('/jugar/');

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
          <div className="px-4 py-3 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white">
            <p className="text-sm font-bold truncate">{userName}</p>
            <p className="text-[11px] text-white/70 truncate">{userEmail}</p>
          </div>
          <Link href={'/ligas' as Route} onClick={close} className={linkClass(pathname.startsWith('/ligas'))}>
            Competiciones
          </Link>
          <Link href={'/equipos' as Route} onClick={close} className={linkClass(pathname.startsWith('/equipos'))}>
            Mis equipos
          </Link>
          <Link href={'/partidos' as Route} onClick={close} className={linkClass(partidosActive)}>
            Partidos
          </Link>
          <Link href={'/reglamento' as Route} onClick={close} className={linkClass(pathname.startsWith('/reglamento'))}>
            Reglamento
          </Link>
          {inTenant && isOrgAdmin && (
            <Link href={'/admin/inscripciones' as Route} onClick={close} className={linkClass(pathname.startsWith('/admin/inscripciones'))}>
              Inscripciones
            </Link>
          )}
          {isSuperAdmin && !inTenant && (
            <Link href={'/admin/organizaciones' as Route} onClick={close} className={linkClass(pathname.startsWith('/admin/organizaciones'))}>
              Organizaciones
            </Link>
          )}
          {isSuperAdmin && !inTenant && (
            <>
              <Link href={'/admin/disputas' as Route} onClick={close} className={linkClass(pathname.startsWith('/admin/disputas'))}>
                Disputas
              </Link>
              <Link href={'/admin/usuarios' as Route} onClick={close} className={linkClass(pathname.startsWith('/admin/usuarios'))}>
                Usuarios
              </Link>
              <Link href={'/admin/equipos' as Route} onClick={close} className={linkClass(pathname.startsWith('/admin/equipos'))}>
                Equipos
              </Link>
              <Link href={'/admin/codigos-registro' as Route} onClick={close} className={linkClass(pathname.startsWith('/admin/codigos-registro'))}>
                Códigos de registro
              </Link>
              <Link href={'/admin/cola' as Route} onClick={close} className={linkClass(pathname.startsWith('/admin/cola'))}>
                Cola
              </Link>
              <Link href={'/admin/auditoria' as Route} onClick={close} className={linkClass(pathname.startsWith('/admin/auditoria'))}>
                Audit log
              </Link>
            </>
          )}
          <div className="border-t border-gray-100" />
          <Link href={'/perfil' as Route} onClick={close} className={linkClass(pathname.startsWith('/perfil'))}>
            Mi perfil
          </Link>
          <Link href={'/como-funciona' as Route} onClick={close} className={linkClass(pathname.startsWith('/como-funciona'))}>
            Ayuda
          </Link>
          {!inTenant && (
            <Link href={'/invitar' as Route} onClick={close} className={linkClass(pathname.startsWith('/invitar'))}>
              Invitar a un amigo
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
