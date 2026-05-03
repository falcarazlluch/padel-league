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

export function CronicasSidebar({ items }: { items: SidebarItem[] }) {
  const [open, setOpen] = useState<boolean>(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'closed') setOpen(false);
    setHydrated(true);
  }, []);

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

  // Avoid SSR/CSR mismatch flash: render nothing until hydrated, then animate.
  if (!hydrated) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={toggle}
        className="hidden lg:flex shrink-0 sticky top-24 self-start ml-2 items-center gap-1 px-2 py-3 text-xs font-bold uppercase tracking-widest bg-white border border-slate-200/80 text-slate-500 hover:text-brand-navy hover:bg-slate-50 rounded-l-xl shadow-sm transition-colors writing-mode-vertical"
        style={{ writingMode: 'vertical-rl' as const }}
        aria-label="Mostrar últimas crónicas"
        title="Mostrar últimas crónicas"
      >
        Crónicas ‹
      </button>
    );
  }

  return (
    <aside className="hidden lg:flex flex-col shrink-0 w-80 sticky top-24 self-start max-h-[calc(100vh-7rem)] bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200/80 bg-slate-50">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-blue">
          Últimas crónicas
        </p>
        <button
          type="button"
          onClick={toggle}
          className="text-slate-400 hover:text-slate-700 transition-colors"
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
                <p className="text-xs text-slate-600 leading-relaxed line-clamp-3 whitespace-pre-line">
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
