import Link from 'next/link';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { TeamService } from '@/modules/teams';
import { CATEGORY_LABEL, categoryBadgeClass } from '@/modules/leagues';
import { IncomingInvitationsList } from './incoming-invitations-list';

export default async function MisEquiposPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token);

  const [teams, incoming] = await Promise.all([
    TeamService.listForUser(user.id),
    TeamService.listIncomingInvitations(user.id),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Mis equipos</p>
          <h1 className="text-2xl font-extrabold text-brand-navy">Mis equipos</h1>
        </div>
        <Link
          href={'/equipos/nuevo' as Route}
          className="px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 transition-opacity"
        >
          Nuevo equipo
        </Link>
      </div>

      <IncomingInvitationsList invitations={incoming.map((i) => ({
        id: i.id,
        teamName: i.team.name,
        teamCategory: i.team.category,
        invitedByName: i.invitedBy.name,
        createdAt: i.createdAt.toISOString(),
      }))} />

      {teams.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg mb-2">Aún no tienes ningún equipo</p>
          <p className="text-sm">Crea uno y manda una invitación para empezar a jugar.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <Link
              key={team.id}
              href={`/equipos/${team.id}` as Route}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 hover:shadow-md transition-shadow shadow-sm"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h2 className="font-semibold text-brand-navy leading-tight">{team.name}</h2>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${categoryBadgeClass(team.category)}`}>
                  {CATEGORY_LABEL[team.category]}
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                {team.members.length}/2 jugadores
                {team.pendingInvitationCount > 0 && ` · ${team.pendingInvitationCount} invitación pendiente`}
              </p>
              <ul className="space-y-1.5">
                {team.members.map((m) => (
                  <li key={m.userId} className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-xs flex items-center justify-center font-semibold shrink-0">
                      {m.name[0]?.toUpperCase()}
                    </span>
                    {m.name}
                  </li>
                ))}
              </ul>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
