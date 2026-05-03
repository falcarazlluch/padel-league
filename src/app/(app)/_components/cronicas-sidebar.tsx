'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';

interface SidebarItem {
  id: string;
  type: 'PREVIEW' | 'RECAP';
  generatedAt: string;
  content: string;
  matchHref: string;
  teamAName: string;
  teamBName: string;
  setsA: number | null;
  setsB: number | null;
  leagueName: string;
}

const STORAGE_KEY = 'cronicasSidebarOpen';
const OPEN_WIDTH = '21rem'; // sidebar width + a small gap
const CLOSED_WIDTH = '0px';

export function CronicasSidebar({ items }: { items: SidebarItem[] }) {
  const [open, setOpen] = useState<boolean>(true);
  const [hydrated, setHydrated] = useState(false);

  // Sync state ↔ localStorage and a CSS variable consumed by the layout to
  // reserve right-side padding so the main content doesn't slide under us.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial = stored !== 'closed';
    setOpen(initial);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const isXl = window.matchMedia('(min-width: 1280px)').matches;
    document.documentElement.style.setProperty(
      '--cronicas-sidebar-w',
      isXl && open ? OPEN_WIDTH : CLOSED_WIDTH,
    );
  }, [hydrated, open]);

  // Re-evaluate the CSS variable on viewport resize crossing the xl breakpoint
  // so the padding disappears when the user shrinks the window below 1280px.
  useEffect(() => {
    if (!hydrated) return;
    const mq = window.matchMedia('(min-width: 1280px)');
    const apply = () => {
      document.documentElement.style.setProperty(
        '--cronicas-sidebar-w',
        mq.matches && open ? OPEN_WIDTH : CLOSED_WIDTH,
      );
    };
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [hydrated, open]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? 'open' : 'closed');
      } catch {
        // ignore quota / SSR / privacy-mode failures
      }
      return next;
    });
  }

  // Render nothing until hydrated to avoid SSR/CSR mismatch flash.
  if (!hydrated) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={toggle}
        className="hidden xl:flex fixed right-0 top-32 z-30 items-center gap-1 px-2 py-3 text-xs font-bold uppercase tracking-widest bg-white border border-r-0 border-slate-200/80 text-slate-500 hover:text-brand-navy hover:bg-slate-50 rounded-l-xl shadow-sm transition-colors"
        style={{ writingMode: 'vertical-rl' as const }}
        aria-label="Mostrar últimas crónicas"
        title="Mostrar últimas crónicas"
      >
        ‹ Crónicas
      </button>
    );
  }

  return (
    <aside
      className="hidden xl:flex fixed right-4 top-28 bottom-4 z-30 w-80 flex-col bg-white border border-slate-200/80 rounded-2xl shadow-lg overflow-hidden"
    >
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200/80 bg-slate-50">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-blue">
          Últimas crónicas
        </p>
        <button
          type="button"
          onClick={toggle}
          className="text-slate-400 hover:text-slate-700 transition-colors text-lg leading-none"
          aria-label="Ocultar últimas crónicas"
          title="Ocultar"
        >
          ›
        </button>
      </header>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-xs text-slate-400">
          Aún no hay crónicas en tus ligas. Aparecerán aquí en cuanto se confirme una fecha o un resultado.
        </p>
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {items.map((c) => (
            <li key={c.id}>
              <Link
                href={c.matchHref as Route}
                className="block px-4 py-3 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs font-bold text-brand-navy truncate">
                    {c.teamAName} <span className="text-slate-400 font-normal">vs</span> {c.teamBName}
                  </p>
                  {c.type === 'RECAP' && c.setsA !== null && c.setsB !== null ? (
                    <span className="font-mono text-xs font-bold text-brand-navy shrink-0">
                      {c.setsA}–{c.setsB}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full shrink-0">
                      Previa
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mb-1">{c.leagueName}</p>
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                  {c.content}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
