'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';

interface Props {
  year: number;
  month: number;
  view: 'grid' | 'list';
}

const MONTH_LABELS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function monthShift(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function buildHref(pathname: string, year: number, month: number, view: 'grid' | 'list'): Route {
  const cal = `${year}-${String(month).padStart(2, '0')}`;
  const params = new URLSearchParams();
  params.set('cal', cal);
  params.set('view', view);
  return `${pathname}?${params.toString()}` as Route;
}

export function CalendarNav({ year, month, view }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // On mount, align the URL with the persisted view if they differ.
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('calendarView') : null;
    if ((stored === 'grid' || stored === 'list') && stored !== view) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('view', stored);
      router.replace(`${pathname}?${params.toString()}` as Route, { scroll: false });
    }
  }, [pathname, router, searchParams, view]);

  function persistView(next: 'grid' | 'list') {
    try {
      window.localStorage.setItem('calendarView', next);
    } catch {
      // ignore quota / SSR / privacy-mode failures
    }
  }

  const prev = monthShift(year, month, -1);
  const next = monthShift(year, month, 1);
  const today = new Date();
  const todayHref = `${pathname}?view=${view}` as Route;

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <Link
          href={buildHref(pathname, prev.year, prev.month, view)}
          scroll={false}
          className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
          aria-label="Mes anterior"
        >
          ←
        </Link>
        <span className="text-sm font-bold text-slate-700 min-w-[8rem] text-center">
          {MONTH_LABELS_ES[month - 1]} {year}
        </span>
        <Link
          href={buildHref(pathname, next.year, next.month, view)}
          scroll={false}
          className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
          aria-label="Mes siguiente"
        >
          →
        </Link>
        {(year !== today.getFullYear() || month !== today.getMonth() + 1) && (
          <Link
            href={todayHref}
            scroll={false}
            className="text-xs text-slate-500 hover:text-slate-700 underline"
          >
            Hoy
          </Link>
        )}
      </div>
      <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-xs font-semibold">
        <Link
          href={buildHref(pathname, year, month, 'grid')}
          scroll={false}
          onClick={() => persistView('grid')}
          className={`px-3 py-1.5 ${view === 'grid' ? 'bg-brand-navy text-white' : 'bg-white text-slate-600 hover:bg-slate-50'} transition-colors`}
        >
          Calendario
        </Link>
        <Link
          href={buildHref(pathname, year, month, 'list')}
          scroll={false}
          onClick={() => persistView('list')}
          className={`px-3 py-1.5 ${view === 'list' ? 'bg-brand-navy text-white' : 'bg-white text-slate-600 hover:bg-slate-50'} transition-colors`}
        >
          Lista
        </Link>
      </div>
    </div>
  );
}
