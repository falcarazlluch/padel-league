'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import type { Route } from 'next';

type UnreadItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  href: string | null;
};
type UnreadData = { count: number; items: UnreadItem[] };

export function NotificationsBadge() {
  const [data, setData] = useState<UnreadData | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchUnread = useCallback(() => {
    fetch('/api/notifications/unread')
      .then((r) => (r.ok ? (r.json() as Promise<UnreadData>) : Promise.reject(new Error('fetch failed'))))
      .then(setData)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetchUnread();
    const id = setInterval(fetchUnread, 30_000);
    return () => clearInterval(id);
  }, [fetchUnread]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const count = data?.count ?? 0;

  function markRead(id: string) {
    void fetch(`/api/notifications/${id}/read`, { method: 'POST' }).catch(() => undefined);
    setData((prev) =>
      prev
        ? {
            count: Math.max(0, prev.count - 1),
            items: prev.items.filter((n) => n.id !== id),
          }
        : prev,
    );
  }

  function handleNavigate(id: string) {
    markRead(id);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative text-sm font-medium text-white/80 hover:text-white transition-colors px-1"
        aria-label={`Notificaciones${count > 0 ? ` (${count} sin leer)` : ''}`}
      >
        🔔
        {count > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 bg-brand-yellow text-brand-navy text-[10px] flex items-center justify-center rounded-full font-bold px-0.5">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed top-[4.5rem] inset-x-4 w-auto md:absolute md:top-auto md:inset-x-auto md:right-0 md:mt-2 md:w-80 bg-white border border-slate-200/80 rounded-2xl shadow-lg z-50">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">
              Notificaciones{count > 0 ? ` (${count})` : ''}
            </span>
          </div>
          {!data || data.items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">Sin notificaciones nuevas</p>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {data.items.map((n) => (
                <li key={n.id} className="hover:bg-gray-50">
                  <div className="flex items-start gap-2 px-4 py-3">
                    {n.href ? (
                      <Link
                        href={n.href as Route}
                        onClick={() => handleNavigate(n.id)}
                        className="flex-1 min-w-0"
                      >
                        <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                      </Link>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                      </div>
                    )}
                    <button
                      onClick={() => markRead(n.id)}
                      className="text-xs text-brand-blue hover:text-brand-navy shrink-0 mt-0.5"
                      aria-label="Marcar como leída"
                      title="Marcar como leída"
                    >
                      ✓
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
