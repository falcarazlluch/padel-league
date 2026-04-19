'use client';

import { useState, useEffect, useRef } from 'react';

type UnreadItem = { id: string; type: string; title: string; body: string; createdAt: string };
type UnreadData = { count: number; items: UnreadItem[] };

export function NotificationsBadge() {
  const [data, setData] = useState<UnreadData | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchUnread = () => {
    fetch('/api/notifications/unread')
      .then((r) => (r.ok ? (r.json() as Promise<UnreadData>) : Promise.reject()))
      .then(setData)
      .catch(() => undefined);
  };

  useEffect(() => {
    fetchUnread();
    const id = setInterval(fetchUnread, 30_000);
    return () => clearInterval(id);
  }, []);

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

  function handleMarkRead(id: string) {
    void fetch(`/api/notifications/${id}/read`, { method: 'POST' }).then(() => {
      setData((prev) =>
        prev
          ? {
              count: Math.max(0, prev.count - 1),
              items: prev.items.filter((n) => n.id !== id),
            }
          : prev,
      );
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative text-sm text-gray-600 hover:text-gray-900 transition-colors px-1"
        aria-label={`Notificaciones${count > 0 ? ` (${count} sin leer)` : ''}`}
      >
        Notificaciones
        {count > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full font-bold px-0.5">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">
              Notificaciones{count > 0 ? ` (${count})` : ''}
            </span>
          </div>
          {data?.items.length === 0 || !data ? (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">Sin notificaciones nuevas</p>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {data.items.map((n) => (
                <li key={n.id} className="px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                    </div>
                    <button
                      onClick={() => handleMarkRead(n.id)}
                      className="text-xs text-blue-500 hover:text-blue-700 shrink-0 mt-0.5"
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
