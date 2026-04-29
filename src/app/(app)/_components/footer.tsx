import Link from 'next/link';
import Image from 'next/image';
import type { Route } from 'next';

export function Footer() {
  return (
    <footer className="border-t border-slate-200/80 bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
        <div className="space-y-3">
          <Link href="/dashboard" className="inline-flex items-center">
            <Image
              src="/logo.png"
              alt="Padel League"
              width={140}
              height={56}
              className="h-12 w-auto object-contain"
              unoptimized
            />
          </Link>
          <p className="text-xs text-slate-400">Gestión de ligas de pádel.</p>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">App</p>
          <ul className="space-y-1.5 text-sm text-slate-600">
            <li><Link href={'/ligas' as Route} className="hover:text-brand-navy transition-colors">Ligas</Link></li>
            <li><Link href={'/partidos' as Route} className="hover:text-brand-navy transition-colors">Mis partidos</Link></li>
            <li><Link href={'/jugar' as Route} className="hover:text-brand-navy transition-colors">Jugar</Link></li>
            <li><Link href={'/reglamento' as Route} className="hover:text-brand-navy transition-colors">Reglamento</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Cuenta</p>
          <ul className="space-y-1.5 text-sm text-slate-600">
            <li><Link href={'/perfil' as Route} className="hover:text-brand-navy transition-colors">Mi perfil</Link></li>
            <li>
              <form action="/api/auth/logout" method="post" className="inline">
                <button type="submit" className="hover:text-brand-navy transition-colors">Salir</button>
              </form>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Legal</p>
          <ul className="space-y-1.5 text-sm text-slate-600">
            <li><Link href={'/aviso-legal' as Route} className="hover:text-brand-navy transition-colors">Aviso legal</Link></li>
            <li><Link href={'/privacidad' as Route} className="hover:text-brand-navy transition-colors">Privacidad</Link></li>
            <li><Link href={'/cookies' as Route} className="hover:text-brand-navy transition-colors">Cookies</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-200/80">
        <div className="max-w-6xl mx-auto px-6 py-4 text-xs text-slate-400 text-center">
          © {new Date().getFullYear()} Padel League · Todos los derechos reservados
        </div>
      </div>
    </footer>
  );
}
