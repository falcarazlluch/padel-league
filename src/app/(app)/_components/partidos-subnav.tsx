import Link from 'next/link';
import type { Route } from 'next';

interface Props {
  active: 'mis' | 'tablon' | 'resultados';
}

function tabClass(isActive: boolean): string {
  return `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
    isActive
      ? 'border-brand-yellow text-brand-navy font-bold'
      : 'border-transparent text-slate-400 hover:text-slate-600'
  }`;
}

export function PartidosSubnav({ active }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-200/80">
      <div className="flex flex-wrap">
        <Link href={'/partidos' as Route} className={tabClass(active === 'mis')}>
          Mis partidos
        </Link>
        <Link href={'/jugar' as Route} className={tabClass(active === 'tablon')}>
          Tablón
        </Link>
        <Link href={'/resultados' as Route} className={tabClass(active === 'resultados')}>
          Resultados
        </Link>
      </div>
      <Link
        href={'/jugar/nuevo' as Route}
        className="text-sm px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white font-bold rounded-xl shadow-md hover:opacity-90 transition-opacity"
      >
        + Crear partido
      </Link>
    </div>
  );
}
