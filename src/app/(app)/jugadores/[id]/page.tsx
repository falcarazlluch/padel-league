import Link from 'next/link';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import { UserStatsService } from '@/modules/users';
import { UserAvatar } from '@/modules/users/presentation/user-avatar';
import { CATEGORY_LABEL, categoryBadgeClass } from '@/modules/leagues/presentation/category';

export default async function JugadorPerfilPublicoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const viewer = await getValidatedSession(token);

  const player = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      category: true,
      createdAt: true,
      anonymizedAt: true,
      deletedAt: true,
    },
  });
  if (!player || player.deletedAt || player.anonymizedAt) notFound();

  const stats = await UserStatsService.getStats(id);
  const winPct = Math.round(stats.overall.winRate * 100);
  const isSelf = viewer.id === player.id;

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <UserAvatar url={player.avatarUrl} name={player.name} size="lg" />
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Jugador</p>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-extrabold text-brand-navy">{player.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${categoryBadgeClass(player.category)}`}>
                {CATEGORY_LABEL[player.category]}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              En Padel League desde {player.createdAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
        {isSelf && (
          <Link
            href={'/perfil' as Route}
            className="text-sm px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
          >
            Editar perfil
          </Link>
        )}
      </div>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-brand-navy">Estadísticas globales</h2>
          <span className="text-xs text-slate-400">Partidos confirmados</span>
        </div>
        <div className="grid grid-cols-5 gap-2 text-center">
          <Stat label="Jugados" value={stats.overall.played} />
          <Stat label="Ganados" value={stats.overall.won} tone="emerald" />
          <Stat label="Empates" value={stats.overall.drawn} tone="amber" />
          <Stat label="Perdidos" value={stats.overall.lost} tone="rose" />
          <Stat label="% Victorias" value={`${winPct}%`} tone="blue" />
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        <h2 className="text-base font-semibold text-brand-navy mb-1">Mejor compañero</h2>
        <p className="text-xs text-slate-400 mb-3">Top 5 con quienes mejor le va (mínimo 3 partidos juntos).</p>
        {stats.bestPartners.length === 0 ? (
          <p className="text-sm text-slate-400">
            Todavía no ha jugado suficientes partidos con un mismo compañero.
          </p>
        ) : (
          <ul className="space-y-2">
            {stats.bestPartners.map((p) => (
              <li
                key={p.userId}
                className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2"
              >
                <Link
                  href={`/jugadores/${p.userId}` as Route}
                  className="flex items-center gap-2 min-w-0 hover:underline"
                >
                  <UserAvatar url={p.avatarUrl} name={p.name} size="sm" />
                  <span className="text-sm font-medium text-slate-700 truncate">{p.name}</span>
                </Link>
                <div className="text-xs text-slate-500 shrink-0 flex items-center gap-3">
                  <span>
                    {p.won}/{p.played} <span className="text-slate-400">·</span>{' '}
                    <span className="font-semibold text-emerald-700">{Math.round(p.winRate * 100)}%</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        <h2 className="text-base font-semibold text-brand-navy mb-1">Cara a cara con otras parejas</h2>
        <p className="text-xs text-slate-400 mb-3">Top 5 parejas más enfrentadas (balance histórico).</p>
        {stats.topOpponents.length === 0 ? (
          <p className="text-sm text-slate-400">Aún no hay parejas rivales repetidas.</p>
        ) : (
          <ul className="space-y-2">
            {stats.topOpponents.map((o) => {
              const balance = o.won - o.lost;
              const balanceClass =
                balance > 0 ? 'text-emerald-700' : balance < 0 ? 'text-rose-600' : 'text-slate-500';
              return (
                <li
                  key={o.teamId}
                  className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2"
                >
                  <Link
                    href={`/equipos/${o.teamId}` as Route}
                    className="text-sm font-medium text-slate-700 truncate hover:underline"
                  >
                    {o.teamName}
                  </Link>
                  <div className="text-xs text-slate-500 shrink-0 flex items-center gap-3">
                    <span>
                      {o.played} {o.played === 1 ? 'partido' : 'partidos'}
                    </span>
                    <span className={`font-semibold ${balanceClass}`}>
                      {o.won}–{o.lost}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        <h2 className="text-base font-semibold text-brand-navy mb-1">Evolución de categoría</h2>
        <p className="text-xs text-slate-400 mb-3">
          Cambios de nivel aceptados sobre equipos del jugador.
        </p>
        {stats.categoryEvolution.length === 0 ? (
          <p className="text-sm text-slate-400">No hay cambios de categoría registrados.</p>
        ) : (
          <ul className="space-y-2">
            {stats.categoryEvolution.map((c, i) => (
              <li
                key={`${c.teamId}-${i}`}
                className="flex items-start justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2"
              >
                <div className="min-w-0">
                  <Link
                    href={`/equipos/${c.teamId}` as Route}
                    className="text-sm font-medium text-slate-700 hover:underline"
                  >
                    {c.teamName}
                  </Link>
                  <p className="text-xs text-slate-500 mt-0.5">
                    <span className={`px-1.5 py-0.5 rounded border ${categoryBadgeClass(c.fromCategory as never)}`}>
                      {CATEGORY_LABEL[c.fromCategory as never] ?? c.fromCategory}
                    </span>
                    <span className="mx-1 text-slate-400">→</span>
                    <span className={`px-1.5 py-0.5 rounded border ${categoryBadgeClass(c.toCategory as never)}`}>
                      {CATEGORY_LABEL[c.toCategory as never] ?? c.toCategory}
                    </span>
                  </p>
                  {c.reason && (
                    <p className="text-[11px] text-slate-400 mt-1 italic">&ldquo;{c.reason}&rdquo;</p>
                  )}
                </div>
                <span className="text-xs text-slate-400 shrink-0 whitespace-nowrap">
                  {c.resolvedAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: 'emerald' | 'amber' | 'rose' | 'blue';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-600'
        : tone === 'rose'
          ? 'text-rose-600'
          : tone === 'blue'
            ? 'text-brand-blue'
            : 'text-brand-navy';
  return (
    <div className="bg-slate-50 rounded-xl py-2">
      <p className={`text-xl sm:text-2xl font-extrabold ${toneClass}`}>{value}</p>
      <p className="text-[10px] sm:text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}
