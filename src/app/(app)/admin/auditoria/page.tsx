import { cookies } from 'next/headers';
import { getTenantId } from '@/shared/tenant/context';
import { redirect, notFound } from 'next/navigation';
import type { Route } from 'next';
import Link from 'next/link';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';

export const dynamic = 'force-dynamic';

// Audit log viewer (SUPER_ADMIN only). Lectura sin escritura — la fuente de
// verdad es la tabla `audit_logs` y se rellena desde los flujos de servicio
// críticos (resolveDispute, deleteAccount, password-change, materialize/
// substitute bracket, walkover, etc).

const ACTION_FILTERS = [
  { value: 'all', label: 'Todas' },
  { value: 'match.', label: 'Partidos' },
  { value: 'league.', label: 'Competiciones' },
  { value: 'auth.', label: 'Autenticación' },
  { value: 'dispute.', label: 'Disputas' },
  { value: 'team.', label: 'Equipos' },
];

function parseAction(raw: string | undefined): string {
  if (!raw) return 'all';
  return ACTION_FILTERS.some((a) => a.value === raw) ? raw : 'all';
}

const PAGE_SIZE = 50;

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; offset?: string }>;
}) {
  // Platform-wide administration: these pages show data across every tenant, so
  // they only exist on the apex host. Inside a tenant subdomain they 404 — an
  // ORG_ADMIN has no business enumerating other organizations' users or teams.
  if (await getTenantId()) notFound();
  const params = await searchParams;
  const action = parseAction(params.action);
  const offset = Math.max(0, parseInt(params.offset ?? '0', 10) || 0);

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token);
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard' as Route);

  const where = action === 'all' ? {} : { action: { startsWith: action } };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      skip: offset,
      include: { actor: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const hasMore = offset + rows.length < total;
  const prevOffset = Math.max(0, offset - PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Admin</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Audit log</h1>
        <p className="text-sm text-slate-400 mt-1">
          Historial de acciones críticas: sustituciones de pareja, walkovers, resoluciones de disputas,
          cambios de contraseña, eliminaciones de cuenta, etc. Solo visible para SUPER_ADMIN.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-3 flex flex-wrap gap-2">
        {ACTION_FILTERS.map((f) => {
          const href = f.value === 'all' ? '/admin/auditoria' : `/admin/auditoria?action=${f.value}`;
          const active = action === f.value;
          return (
            <Link
              key={f.value}
              href={href as Route}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-brand-navy text-white'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Sin registros con este filtro.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-slate-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-3 py-2 font-semibold">Fecha</th>
                  <th className="text-left px-3 py-2 font-semibold">Actor</th>
                  <th className="text-left px-3 py-2 font-semibold">Acción</th>
                  <th className="text-left px-3 py-2 font-semibold">Objetivo</th>
                  <th className="text-left px-3 py-2 font-semibold">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                      {r.createdAt.toLocaleString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-3 py-2">
                      {r.actor ? (
                        <span>
                          <span className="block text-sm font-medium text-slate-800 truncate">{r.actor.name}</span>
                          <span className="block text-xs text-slate-400 truncate">{r.actor.email}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">sistema</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-brand-navy whitespace-nowrap">{r.action}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      <span className="block">{r.targetType}</span>
                      <span className="block font-mono text-slate-400 truncate">{r.targetId}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {r.metadata ? (
                        <details>
                          <summary className="cursor-pointer text-brand-blue hover:underline">ver</summary>
                          <pre className="mt-1 whitespace-pre-wrap break-all text-[11px] text-slate-600 bg-slate-50 rounded p-1.5 max-w-xs">
                            {JSON.stringify(r.metadata, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          {total === 0
            ? '0 registros'
            : `Mostrando ${offset + 1}–${offset + rows.length} de ${total}`}
        </span>
        <div className="flex gap-2">
          {offset > 0 && (
            <Link
              href={`/admin/auditoria?action=${action}&offset=${prevOffset}` as Route}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold"
            >
              ← Anterior
            </Link>
          )}
          {hasMore && (
            <Link
              href={`/admin/auditoria?action=${action}&offset=${nextOffset}` as Route}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold"
            >
              Siguiente →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
