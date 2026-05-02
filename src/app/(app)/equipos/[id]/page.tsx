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

  let team;
  try {
    team = await TeamService.getDetail(id, user.id);
  } catch (err) {
    if (isUserFacingError(err)) notFound();
    throw err;
  }

  const slotsLeft = MAX_TEAM_SIZE - team.members.length;
  const hasPendingInvitation = team.invitations.length > 0;
  const canInvite = slotsLeft > 0 && !hasPendingInvitation;

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
          </div>
        </div>
        <Link
          href={'/equipos' as Route}
          className="text-sm px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
        >
          ← Mis equipos
        </Link>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        <LogoUploader teamId={team.id} teamName={team.name} currentLogoUrl={team.logoUrl} />
      </section>

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-brand-navy">Jugadores ({team.members.length}/{MAX_TEAM_SIZE})</h2>
        </div>
        <ul className="space-y-2">
          {team.members.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 text-sm text-slate-700">
              <UserAvatar url={m.avatarUrl} name={m.name} size="sm" />
              <span className="font-medium">{m.name}</span>
            </li>
          ))}
        </ul>

        {hasPendingInvitation && (
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Invitaciones pendientes</p>
            {team.invitations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2">
                <span className="font-medium text-slate-700 text-sm">{inv.invitedUser.name}</span>
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
                    {r.withdrawnAt
                      ? `Baja el ${r.withdrawnAt.toLocaleDateString('es-ES')}`
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
    </div>
  );
}
