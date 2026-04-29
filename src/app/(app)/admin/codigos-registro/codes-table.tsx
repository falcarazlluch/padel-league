'use client';

import { useTransition, useState } from 'react';
import { revokeCodeAction } from './actions';

type Row = {
  id: string;
  code: string;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
  createdByName: string | null;
  usedByName: string | null;
};

function statusOf(r: Row, now: number): { label: string; cls: string } {
  if (r.usedAt) return { label: 'Usado', cls: 'bg-slate-100 text-slate-500' };
  if (r.expiresAt && new Date(r.expiresAt).getTime() < now) {
    return { label: 'Caducado', cls: 'bg-amber-50 text-amber-700' };
  }
  return { label: 'Disponible', cls: 'bg-emerald-50 text-emerald-700' };
}

export function CodesTable({ codes }: { codes: Row[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  if (codes.length === 0) {
    return <p className="text-sm text-slate-400">Aún no se ha generado ningún código.</p>;
  }

  const onRevoke = (id: string) => {
    if (!confirm('¿Borrar este código? Solo puedes hacerlo si no fue usado.')) return;
    setError(null);
    startTransition(async () => {
      const res = await revokeCodeAction(id);
      if (res.error) setError(res.error);
    });
  };

  const copy = (code: string) => {
    void navigator.clipboard.writeText(code);
  };

  return (
    <div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Código</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Caduca</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Usado por</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {codes.map((r) => {
              const s = statusOf(r, now);
              const canRevoke = !r.usedAt;
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <code className="font-mono text-sm tracking-widest text-brand-navy">{r.code}</code>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>
                      {s.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {r.expiresAt ? new Date(r.expiresAt).toLocaleDateString('es-ES') : 'Sin caducidad'}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-sm">
                    {r.usedByName ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => copy(r.code)}
                      className="text-xs px-2 py-1 text-slate-600 hover:text-slate-900 mr-2"
                    >
                      Copiar
                    </button>
                    {canRevoke && (
                      <button
                        type="button"
                        onClick={() => onRevoke(r.id)}
                        disabled={pending}
                        className="text-xs px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors"
                      >
                        Borrar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
