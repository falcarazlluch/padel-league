import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { IndependentMatchService, calculateAvailableSlots } from '@/modules/independent-matches';
import { InvalidTokenError } from '@/shared/errors';
import { JoinRequestButton } from './_components/join-request-button';
import { JoinRequestsPanel } from './_components/join-requests-panel';
import { InviteForm } from './_components/invite-form';
import { ChallengePanel } from './_components/challenge-panel';
import { cancelMatch } from './actions';

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

  let tokenError: string | null = null;
  if (token) {
    try {
      await IndependentMatchService.acceptInvitation(token, user.id);
      redirect(`/jugar/${id}` as Route);
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        tokenError = 'El enlace de invitación no es válido o ha caducado.';
      } else if ((err as Error).message?.includes('completo')) {
        tokenError = 'Este partido ya está completo.';
      } else if ((err as Error).message?.includes('cancelado')) {
        tokenError = 'Este partido fue cancelado.';
      } else {
        throw err;
      }
    }
  }

  const match = await IndependentMatchService.getById(id).catch(() => notFound());

  const isOrganizer = match.organizerId === user.id;
  const isParticipant = match.participants.some((p) => p.userId === user.id);
  const hasPendingRequest = match.joinRequests.some((r) => r.userId === user.id);
  const availableSlots = calculateAvailableSlots(match.maxPlayers, match.participants.length);

  const isChallengeMember =
    match.type === 'TEAM_CHALLENGE' &&
    match.status === 'PENDING_APPROVAL' &&
    match.challengedTeam != null;

  return (
    <div className="max-w-2xl space-y-6">
      {tokenError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {tokenError}
        </div>
      )}

      <div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900">{match.name}</h1>
          <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded ${statusStyle(match.status)}`}>
            {statusLabel(match.status)}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {match.type === 'TEAM_CHALLENGE' ? 'Reto de equipo' : 'Partido abierto'} · Organiza{' '}
          <strong>{match.organizer.name}</strong>
        </p>
        {match.scheduledAt && (
          <p className="text-sm text-gray-600 mt-1">
            {new Date(match.scheduledAt).toLocaleDateString('es-ES', {
              weekday: 'long', day: 'numeric', month: 'long',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        )}
        {match.location && <p className="text-sm text-gray-600">{match.location}</p>}
        {match.description && <p className="text-sm text-gray-500 mt-2">{match.description}</p>}
      </div>

      {isChallengeMember && !isOrganizer && (
        <ChallengePanel matchId={id} challengerTeamName={match.organizer.name} />
      )}

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
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-medium shrink-0">
                  {p.user.name[0]?.toUpperCase()}
                </span>
                {p.user.name}
                {p.userId === match.organizerId && <span className="text-xs text-gray-400">(organizador)</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {match.type === 'OPEN' && match.status === 'OPEN' && !isOrganizer && !isParticipant && !hasPendingRequest && availableSlots > 0 && (
        <JoinRequestButton matchId={id} />
      )}
      {hasPendingRequest && (
        <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
          Tu solicitud está pendiente de aprobación.
        </p>
      )}

      {isOrganizer && (
        <section className="space-y-4">
          {match.type === 'OPEN' && <JoinRequestsPanel requests={match.joinRequests} matchId={id} />}
          {['OPEN', 'PENDING_APPROVAL'].includes(match.status) && availableSlots > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Invitar por email</h3>
              <InviteForm matchId={id} />
              {match.invitations.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-1">Invitaciones enviadas:</p>
                  <ul className="space-y-1">
                    {match.invitations.map((inv) => (
                      <li key={inv.id} className="text-xs text-gray-600 flex items-center gap-2">
                        {inv.email}
                        {inv.acceptedAt ? <span className="text-green-600">✓ Aceptada</span> : <span className="text-gray-400">Pendiente</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {match.status !== 'CANCELLED' && match.status !== 'REJECTED' && (
            <form action={cancelMatch}>
              <input type="hidden" name="matchId" value={id} />
              <button type="submit"
                className="text-sm text-red-600 hover:text-red-800 transition-colors"
                onClick={(e) => { if (!confirm('¿Seguro que quieres cancelar este partido?')) e.preventDefault(); }}>
                Cancelar partido
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
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
    OPEN: 'bg-green-50 text-green-700', PENDING_APPROVAL: 'bg-yellow-50 text-yellow-700',
    CONFIRMED: 'bg-blue-50 text-blue-700', REJECTED: 'bg-red-50 text-red-700',
    CANCELLED: 'bg-gray-100 text-gray-500',
  };
  return map[status] ?? 'bg-gray-100 text-gray-500';
}
