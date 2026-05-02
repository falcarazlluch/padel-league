import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { queue } from '@/shared/queue/client';
import { prisma } from '@/shared/db/client';
import { ALL_JOB_NAMES } from '@/shared/queue/jobs';
import { DrainNowButton, ClearDeadLettersButton } from './drain-now-button';
import { GenerateCommentaryForm } from './generate-commentary-form';

export const dynamic = 'force-dynamic';

interface QueueRow {
  name: string;
  queued: number;
  active: number;
  deferred: number;
  total: number;
}

async function loadQueueStats(): Promise<QueueRow[]> {
  const q = queue();
  await q.start();
  const boss = q.raw();
  const queues = await boss.getQueues([...ALL_JOB_NAMES, 'dead-letter']);
  return queues.map((qr) => ({
    name: qr.name,
    queued: qr.queuedCount,
    active: qr.activeCount,
    deferred: qr.deferredCount,
    total: qr.totalCount,
  }));
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(date);
}

export default async function ColaPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token);
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard' as Route);

  const [stats, deadLetters, emailCounts, commentaryCount, recentFailedEmails] = await Promise.all([
    loadQueueStats(),
    prisma.jobDeadLetter.findMany({ orderBy: { failedAt: 'desc' }, take: 50 }),
    prisma.emailLog.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.matchCommentary.count(),
    prisma.emailLog.findMany({
      where: { status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, toEmail: true, template: true, errorMessage: true, createdAt: true },
    }),
  ]);

  const emailByStatus = Object.fromEntries(emailCounts.map((e) => [e.status, e._count._all]));

  const totalPending = stats.reduce((acc, s) => acc + s.queued + s.active + s.deferred, 0);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Administración</p>
          <h1 className="text-2xl font-extrabold text-brand-navy">Cola de jobs</h1>
          <p className="text-sm text-slate-500 mt-1">
            Estado de pg-boss. El cron <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">/api/cron/heartbeat</code>{' '}
            drena pendientes con un presupuesto de ~50s. Si necesitas procesar ya, usa el botón.
          </p>
        </div>
        <DrainNowButton />
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Emails enviados</p>
          <p className="text-2xl font-extrabold text-brand-navy">{emailByStatus['SENT'] ?? 0}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{emailByStatus['DELIVERED'] ?? 0} entregados</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Emails fallidos</p>
          <p className="text-2xl font-extrabold text-rose-700">{emailByStatus['FAILED'] ?? 0}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{emailByStatus['QUEUED'] ?? 0} en cola</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Crónicas generadas</p>
          <p className="text-2xl font-extrabold text-brand-navy">{commentaryCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Total pendientes</p>
          <p className={`text-2xl font-extrabold ${totalPending > 0 ? 'text-brand-navy' : 'text-slate-400'}`}>{totalPending}</p>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        <h2 className="text-base font-semibold text-brand-navy mb-3">
          Por cola — {totalPending} pendientes en total
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-200">
                <th className="pb-2 pr-4">Cola</th>
                <th className="pb-2 px-4 text-right">Encolados</th>
                <th className="pb-2 px-4 text-right">Activos</th>
                <th className="pb-2 px-4 text-right">Diferidos</th>
                <th className="pb-2 pl-4 text-right">Total histórico</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => {
                const pending = s.queued + s.active + s.deferred;
                return (
                  <tr key={s.name} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-mono text-xs">{s.name}</td>
                    <td className={`py-2 px-4 text-right tabular-nums ${s.queued > 0 ? 'font-bold text-brand-navy' : 'text-slate-500'}`}>
                      {s.queued}
                    </td>
                    <td className="py-2 px-4 text-right tabular-nums text-slate-500">{s.active}</td>
                    <td className="py-2 px-4 text-right tabular-nums text-slate-500">{s.deferred}</td>
                    <td className={`py-2 pl-4 text-right tabular-nums ${pending > 0 ? 'text-brand-navy' : 'text-slate-400'}`}>
                      {s.total}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        <h2 className="text-base font-semibold text-brand-navy mb-1">Generar crónica (debug)</h2>
        <p className="text-xs text-slate-500 mb-3">
          Llama a <code className="bg-slate-100 px-1 rounded">MatchCommentaryService.generate()</code> en el momento, sin pasar por la cola.
          Sirve para ver el error exacto si la generación falla. Pega el <code className="bg-slate-100 px-1 rounded">id</code> de un match desde la URL del partido.
        </p>
        <GenerateCommentaryForm />
      </section>

      {recentFailedEmails.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-brand-navy mb-3">
            Emails fallidos — últimos {recentFailedEmails.length}
          </h2>
          <ul className="space-y-2">
            {recentFailedEmails.map((e) => (
              <li key={e.id} className="bg-white rounded-xl border border-rose-200/60 shadow-sm p-4">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <span className="text-xs">
                    <span className="font-mono text-rose-700">{e.template}</span>
                    <span className="text-slate-500"> → {e.toEmail}</span>
                  </span>
                  <span className="text-xs text-slate-400">{formatDate(e.createdAt)}</span>
                </div>
                <p className="text-sm text-slate-700 mt-1 break-words">
                  {e.errorMessage ?? '(sin mensaje)'}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="text-base font-semibold text-brand-navy">
            Dead letters — últimos {deadLetters.length}
          </h2>
          {deadLetters.length > 0 && <ClearDeadLettersButton />}
        </div>
        {deadLetters.length === 0 ? (
          <p className="text-sm text-slate-400">No hay jobs fallidos sin recuperar.</p>
        ) : (
          <ul className="space-y-2">
            {deadLetters.map((dl) => (
              <li key={dl.id} className="bg-white rounded-xl border border-rose-200/60 shadow-sm p-4">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <span className="font-mono text-xs text-rose-700">{dl.jobName}</span>
                  <span className="text-xs text-slate-400">{formatDate(dl.failedAt)}</span>
                </div>
                <p className="text-sm text-slate-700 mt-1 break-words">{dl.error}</p>
                <details className="mt-2">
                  <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
                    Payload
                  </summary>
                  <pre className="text-[11px] bg-slate-50 rounded p-2 mt-1 overflow-x-auto">
                    {JSON.stringify(dl.payload, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
