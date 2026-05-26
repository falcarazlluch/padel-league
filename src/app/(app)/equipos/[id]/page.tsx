import Link from 'next/link';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { TeamService } from '@/modules/teams';
import { CATEGORY_LABEL, categoryBadgeClass } from '@/modules/leagues';
import { isUserFacingError } from '@/shared/errors';
import { TeamLogo } from '@/modules/teams/presentation/team-logo';
import { UserAvatar } from '@/modules/users/presentation/user-avatar';
import { InviteForm } from './invite-form';
import { CancelInvitationButton } from './cancel-invitation-button';
import { LogoUploader } from './logo-uploader';
import { LeaveTeamButton } from './leave-team-button';

const MAX_TEAM_SIZE = 2;

export default async function EquipoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token);

  // Public profile: any authenticated user can view a team's basic page.
  // Management UI (logo, invitations, leave) is rendered only when the
  // viewer is a member.
  let team;
  try {
    team = await TeamService.getPublicProfile(id, user.id);
  } catch (err) {
    if (isUserFacingError(err)) notFound();
    throw err;
  }

  // Only members see invitations/management; we fetch them lazily so non-members
  // never receive PII via this page. Uses the dedicated listPendingInvitations
  // helper to avoid a full second `team.findUnique` round-trip.
  const invitationsForMember = team.viewerIsMember
    ? await TeamService.listPendingInvitations(id, user.id)
    : [];

  const slotsLeft = MAX_TEAM_SIZE - team.members.length;
  const hasPendingInvitation = invitationsForMember.length > 0;
  const canInvite = team.viewerIsMember && slotsLeft > 0 && !hasPendingInvitation;
  const isLastMember = team.members.length === 1 && team.viewerIsMember;

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <TeamLogo url={team.logoUrl} name={team.name} size="lg" />
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Equipo</p>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-extrabold text-brand-navy">{team.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${categoryBadgeClass(team.category)}`}>
                {CATEGORY_LABEL[team.category]}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Equipo desde {team.createdAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
        {team.viewerIsMember && (
          <Link
            href={'/equipos' as Route}
            className="text-sm px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
          >
            ← Mis equipos
          </Link>
        )}
      </div>

      {team.viewerIsMember && (
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
          <LogoUploader teamId={team.id} teamName={team.name} currentLogoUrl={team.logoUrl} />
        </section>
      )}

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-brand-navy">Jugadores ({team.members.length}/{MAX_TEAM_SIZE})</h2>
        </div>
        <ul className="space-y-2">
          {team.members.map((m) => (
            <li key={m.userId}>
              <Link
                href={`/jugadores/${m.userId}` as Route}
                className="flex items-center gap-2 text-sm text-slate-700 hover:underline"
              >
                <UserAvatar url={m.avatarUrl} name={m.name} size="sm" />
                <span className="font-medium">{m.name}</span>
              </Link>
            </li>
          ))}
        </ul>

        {team.viewerIsMember && hasPendingInvitation && (
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Invitaciones pendientes</p>
            {invitationsForMember.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2">
                <span className="font-medium text-slate-700 text-sm">{inv.invitedUserName}</span>
                <CancelInvitationButton invitationId={inv.id} teamId={team.id} />
              </div>
            ))}
          </div>
        )}

        {canInvite && (
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Invitar jugador</p>
            <InviteForm teamId={team.id} />
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        <h2 className="text-base font-semibold text-brand-navy mb-3">Estadísticas</h2>
        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat label="Jugados" value={team.stats.played} />
          <Stat label="Ganados" value={team.stats.won} tone="emerald" />
          <Stat label="Empates" value={team.stats.drawn} tone="amber" />
          <Stat label="Perdidos" value={team.stats.lost} tone="rose" />
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-brand-navy mb-3">Histórico de partidos</h2>
        {team.history.length === 0 ? (
          <p className="text-sm text-slate-400">Este equipo todavía no ha jugado partidos confirmados.</p>
        ) : (
          <ul className="space-y-2">
            {team.history.map((m) => (
              <li
                key={m.matchId}
                className={`bg-white rounded-xl border border-slate-200/80 p-3 flex items-center justify-between gap-3 ${historyBg(m.outcome)}`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className={`text-xs font-bold uppercase tracking-wide ${outcomeText(m.outcome)}`}>
                    {outcomeLabel(m.outcome)}
                  </span>
                  <span className="text-slate-400 text-xs">vs</span>
                  <TeamLogo url={m.rivalLogoUrl} name={m.rivalTeamName} size="sm" />
                  <Link
                    href={`/equipos/${m.rivalTeamId}` as Route}
                    className="text-sm font-medium text-slate-700 hover:underline truncate"
                  >
                    {m.rivalTeamName}
                  </Link>
                  <Link
                    href={`/ligas/${m.leagueSlug}/partidos/${m.matchId}` as Route}
                    className="text-xs text-slate-400 truncate hover:underline"
                  >
                    · {m.leagueName}
                  </Link>
                </div>
                <span className="text-xs text-slate-500 shrink-0">{m.setsDisplay || '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-brand-navy mb-3">Ligas</h2>
        {team.registrations.length === 0 ? (
          <p className="text-sm text-slate-400">Este equipo aún no se ha apuntado a ninguna liga.</p>
        ) : (
          <ul className="space-y-2">
            {team.registrations.map((r) => (
              <li key={r.id} className="bg-white rounded-xl border border-slate-200/80 p-3 flex items-center justify-between gap-3">
                <div className="text-sm">
                  <Link href={`/ligas/${r.leagueSlug}` as Route} className="font-medium text-slate-700 hover:underline">
                    {r.leagueName}
                  </Link>
                  <span className="ml-2 text-xs text-slate-400">
                    {r.isWithdrawn
                      ? 'Retirado'
                      : `Apuntado el ${r.registeredAt.toLocaleDateString('es-ES')}`}
                  </span>
                </div>
                <span className="text-xs text-slate-500 px-2 py-0.5 rounded-full bg-slate-100">
                  {r.leagueStatus}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {team.viewerIsMember && (
        <section>
          <LeaveTeamButton teamId={id} isLastMember={isLastMember} />
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'emerald' | 'amber' | 'rose' }) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-600'
        : tone === 'rose'
          ? 'text-rose-600'
          : 'text-brand-navy';
  return (
    <div className="bg-slate-50 rounded-xl py-2">
      <p className={`text-2xl font-extrabold ${toneClass}`}>{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function historyBg(outcome: 'won' | 'lost' | 'drawn'): string {
  if (outcome === 'won') return 'border-l-4 border-l-emerald-300';
  if (outcome === 'lost') return 'border-l-4 border-l-rose-300';
  return 'border-l-4 border-l-amber-300';
}

function outcomeText(outcome: 'won' | 'lost' | 'drawn'): string {
  if (outcome === 'won') return 'text-emerald-700';
  if (outcome === 'lost') return 'text-rose-600';
  return 'text-amber-600';
}

function outcomeLabel(outcome: 'won' | 'lost' | 'drawn'): string {
  if (outcome === 'won') return 'Ganado';
  if (outcome === 'lost') return 'Perdido';
  return 'Empate';
}
