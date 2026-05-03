import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { IndependentMatchService, calculateAvailableSlots, isMatchPast } from '@/modules/independent-matches';
import { prisma } from '@/shared/db/client';
import { UserAvatar } from '@/modules/users/presentation/user-avatar';
import { JoinPublicMatchButton } from './_components/join-public-match-button';
import { InviteForm } from './_components/invite-form';
import { CancelMatchButton } from './_components/cancel-match-button';
import { CancelInvitationButton } from './_components/cancel-invitation-button';
import { LeaveMatchButton } from './_components/leave-match-button';
import { MatchChat } from './_components/match-chat';
import { EditDateButton } from './_components/edit-date-button';
import { PendingInvitationActions } from '../_components/pending-invitation-actions';
import { AddToCalendarButton } from '@/app/(app)/_components/add-to-calendar-button';

export default async function JugarDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    const next = encodeURIComponent(`/jugar/${id}${token ? `?token=${token}` : ''}`);
    redirect(`/login?next=${next}` as Route);
  }
  const user = await getValidatedSession(sessionToken).catch(() => {
    const next = encodeURIComponent(`/jugar/${id}${token ? `?token=${token}` : ''}`);
    return redirect(`/login?next=${next}` as Route);
  });

  // The email link historically auto-accepted via `?token=`. We no longer do
  // that — the invitee lands on the page, reviews date/players/location and
  // confirms manually below. The token query param is kept for compatibility
  // (older emails still link with it) but ignored.
  void token;

  const match = await IndependentMatchService.getById(id).catch(() => notFound());

  const isOrganizer = match.organizerId === user.id;
  const isParticipant = match.participants.some((p) => p.userId === user.id);
  const availableSlots = calculateAvailableSlots(match.maxPlayers, match.participants.length);
  const matchPast = isMatchPast(match);

  // Pending invitation lookup (user-direct or via team membership) so the page
  // can show inline accept/reject buttons when the visitor was invited but is
  // not yet a participant.
  let hasPendingInvitation = false;
  if (!isOrganizer && !isParticipant && !matchPast && match.status === 'OPEN') {
    const userTeams = await prisma.teamMember.findMany({
      where: { userId: user.id },
      select: { teamId: true },
    });
    const userTeamIds = userTeams.map((t) => t.teamId);
    const inv = await prisma.independentMatchInvitation.findFirst({
      where: {
        matchId: id,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
        OR: [
          { invitedUserId: user.id },
          ...(userTeamIds.length > 0 ? [{ invitedTeamId: { in: userTeamIds } }] : []),
        ],
      },
      select: { id: true },
    });
    hasPendingInvitation = !!inv;
  }

  // Anyone with chat access can see the chat: organizer, accepted participants
  // and pending invitees (which we already inferred above for the banner).
  const canChat = isOrganizer || isParticipant || hasPendingInvitation;
  const chatMessages = canChat
    ? await IndependentMatchService.listChatMessages(id, user.id).catch(() => [])
    : [];
  // Server-component: Date.now() is read once per request render, which is
  // safe here. react-hooks/purity flags it conservatively for client components.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  return (
    <div className="max-w-2xl space-y-6">
      {hasPendingInvitation && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700 mb-1">
              Tienes una invitación pendiente
            </p>
            <p className="text-sm text-slate-700">
              Revisa los detalles del partido y confirma tu asistencia.
            </p>
          </div>
          <PendingInvitationActions matchId={id} />
        </div>
      )}

      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">
              Partido abierto
            </p>
            <h1 className="text-2xl font-extrabold text-brand-navy">{match.name}</h1>
          </div>
          <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded ${statusStyle(match.status)}`}>
            {statusLabel(match.status)}
          </span>
        </div>
        <p className="text-sm text-slate-400 mt-1">
          Organiza <strong className="text-brand-navy">{match.organizer.name}</strong>
        </p>
        <div className="mt-1 flex flex-col sm:flex-row sm:items-center gap-2">
          <p className="text-sm text-gray-600">
            {match.scheduledAt ? formatScheduledAt(match.scheduledAt) : 'Fecha por definir'}
          </p>
          {match.scheduledAt && (
            <AddToCalendarButton href={`/api/calendar/independent-match/${id}/event.ics`} />
          )}
          {isOrganizer && !matchPast && match.status !== 'CANCELLED' && (
            <EditDateButton
              matchId={id}
              initialScheduledAt={match.scheduledAt ? match.scheduledAt.toISOString() : null}
            />
          )}
        </div>
        {match.location && <p className="text-sm text-gray-600">{match.location}</p>}
        {match.description && <p className="text-sm text-gray-500 mt-2">{match.description}</p>}
      </div>

      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">
          Participantes ({match.participants.length}/{match.maxPlayers})
        </h2>
        {match.participants.length === 0 ? (
          <p className="text-sm text-gray-400">Nadie se ha unido todavía.</p>
        ) : (
          <ul className="space-y-1">
            {match.participants.map((p) => (
              <li key={p.userId} className="text-sm text-gray-700 flex items-center gap-2">
                <UserAvatar url={p.user.avatarUrl} name={p.user.name} size="sm" />
                {p.user.name}
                {p.userId === match.organizerId && <span className="text-xs text-gray-400">(organizador)</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {matchPast && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-600">
          Este partido ya ha tenido lugar. No se admiten más invitaciones ni nuevas inscripciones.
        </div>
      )}

      {!matchPast && match.status === 'OPEN' && match.visibility === 'PUBLIC' && !isOrganizer && !isParticipant && availableSlots > 0 && (
        <JoinPublicMatchButton matchId={id} />
      )}

      {!matchPast && !isOrganizer && isParticipant && match.status !== 'CANCELLED' && (
        <LeaveMatchButton matchId={id} />
      )}

      {isOrganizer && (
        <section className="space-y-4">
          {!matchPast && match.status === 'OPEN' && availableSlots > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Invitar</h3>
              <InviteForm matchId={id} availableSlots={availableSlots} />
              {match.invitations.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-1">Invitaciones enviadas:</p>
                  <ul className="space-y-1">
                    {match.invitations.map((inv) => {
                      const label = inv.email ?? inv.invitedUser?.name ?? inv.invitedTeam?.name ?? '—';
                      const icon = inv.invitedTeam ? '🏆 ' : inv.invitedUser ? '👤 ' : '✉️ ';
                      const expired = !inv.acceptedAt && inv.expiresAt.getTime() < nowMs;
                      return (
                        <li key={inv.id} className="text-xs text-gray-600 flex items-center gap-2 flex-wrap">
                          <span>{icon}{label}</span>
                          {inv.acceptedAt ? (
                            <span className="text-green-600">✓ Aceptada</span>
                          ) : expired ? (
                            <>
                              <span className="text-slate-500">⏰ Caducada</span>
                              <CancelInvitationButton matchId={id} invitationId={inv.id} />
                            </>
                          ) : (
                            <>
                              <span className="text-gray-400">Pendiente</span>
                              <CancelInvitationButton matchId={id} invitationId={inv.id} />
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
          {match.status !== 'CANCELLED' && match.status !== 'REJECTED' && (
            <CancelMatchButton matchId={id} />
          )}
        </section>
      )}

      {canChat && (
        <MatchChat
          matchId={id}
          currentUserId={user.id}
          messages={chatMessages.map((m) => ({
            id: m.id,
            userId: m.userId,
            userName: m.userName,
            avatarUrl: m.avatarUrl,
            content: m.content,
            createdAt: m.createdAt.toISOString(),
          }))}
        />
      )}
    </div>
  );
}

// Pre-formatear en servidor con timezone explícito evita hydration mismatch
// (servidor en UTC vs cliente en Europe/Madrid renderizarían horas distintas).
function formatScheduledAt(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(date);
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    OPEN: 'Abierto', PENDING_APPROVAL: 'Pendiente', CONFIRMED: 'Confirmado',
    REJECTED: 'Rechazado', CANCELLED: 'Cancelado',
  };
  return map[status] ?? status;
}

function statusStyle(status: string): string {
  const map: Record<string, string> = {
    OPEN: 'bg-gradient-to-r from-blue-50 to-sky-100 text-blue-700',
    PENDING_APPROVAL: 'bg-gradient-to-r from-yellow-50 to-amber-100 text-amber-700',
    CONFIRMED: 'bg-gradient-to-r from-emerald-50 to-green-100 text-emerald-700',
    REJECTED: 'bg-gradient-to-r from-red-50 to-rose-100 text-red-600',
    CANCELLED: 'bg-gray-100 text-gray-500',
  };
  return map[status] ?? 'bg-gray-100 text-gray-500';
}
