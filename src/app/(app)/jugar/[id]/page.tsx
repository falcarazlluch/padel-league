import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { IndependentMatchService, calculateAvailableSlots } from '@/modules/independent-matches';
import { InvalidTokenError } from '@/shared/errors';
import { UserAvatar } from '@/modules/users/presentation/user-avatar';
import { JoinPublicMatchButton } from './_components/join-public-match-button';
import { InviteForm } from './_components/invite-form';
import { CancelMatchButton } from './_components/cancel-match-button';
import { CancelInvitationButton } from './_components/cancel-invitation-button';

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
  const availableSlots = calculateAvailableSlots(match.maxPlayers, match.participants.length);

  return (
    <div className="max-w-2xl space-y-6">
      {tokenError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {tokenError}
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
        {match.scheduledAt && (
          <p className="text-sm text-gray-600 mt-1">{formatScheduledAt(match.scheduledAt)}</p>
        )}
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

      {match.status === 'OPEN' && match.visibility === 'PUBLIC' && !isOrganizer && !isParticipant && availableSlots > 0 && (
        <JoinPublicMatchButton matchId={id} />
      )}

      {isOrganizer && (
        <section className="space-y-4">
          {match.status === 'OPEN' && availableSlots > 0 && (
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
                      const expired = !inv.acceptedAt && inv.expiresAt.getTime() < Date.now();
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
