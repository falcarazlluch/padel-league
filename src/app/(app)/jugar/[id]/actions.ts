'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { IndependentMatchService } from '@/modules/independent-matches';
import { SignedTokenService, SignedTokenPurpose } from '@/shared/auth/signed-tokens';
import { isUserFacingError } from '@/shared/errors';
import { queue } from '@/shared/queue/client';
import { env } from '@/shared/config/env';
import { prisma } from '@/shared/db/client';
import { NotificationService } from '@/modules/notifications';

/** Human-friendly date+time for emails: e.g. "sábado, 13 de mayo de 2026, 18:30". */
function formatScheduledAt(date: Date | null | undefined): string | undefined {
  if (!date) return undefined;
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(date);
}

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

type ActionResult = { error: string } | { success: true };

export async function joinPublicMatchAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const matchId = formData.get('matchId');
  if (typeof matchId !== 'string') return { error: 'Datos inválidos.' };
  try {
    await IndependentMatchService.joinPublicMatch(matchId, user.id);
    revalidatePath(`/jugar/${matchId}`);
    revalidatePath('/jugar');
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

const inviteSchema = z.object({
  matchId: z.string().cuid(),
  email: z.string().email('Email inválido.').toLowerCase(),
});

export async function inviteByEmail(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getSession();
  const parsed = inviteSchema.safeParse({
    matchId: formData.get('matchId'),
    email: formData.get('email'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    const { invitationId, isNew } = await IndependentMatchService.inviteByEmail(
      parsed.data.matchId,
      user.id,
      parsed.data.email,
    );

    if (isNew) {
      const token = await SignedTokenService.issue({
        purpose: SignedTokenPurpose.INDEPENDENT_MATCH_INVITE,
        subjectId: invitationId,
        ttlSeconds: 7 * 24 * 60 * 60,
      });

      const matchUrl = `${env().APP_URL}/jugar/${parsed.data.matchId}?token=${token}`;

      const match = await prisma.independentMatch.findUnique({
        where: { id: parsed.data.matchId },
        include: { organizer: { select: { name: true } } },
      });

      const q = queue();
      await q.start();
      await q.publish('send-email', {
        template: 'ind-match-invite',
        to: parsed.data.email,
        data: {
          organizerName: match?.organizer.name ?? 'Organizador',
          matchName: match?.name ?? 'Partido',
          matchUrl,
          scheduledAt: formatScheduledAt(match?.scheduledAt),
          location: match?.location ?? undefined,
          addToCalendarUrl: match?.scheduledAt
            ? `${env().APP_URL}/api/calendar/independent-match/${parsed.data.matchId}/event.ics`
            : undefined,
        },
        dedupKey: `ind-invite-${invitationId}`,
      });

      const existingUser = await prisma.user.findUnique({ where: { email: parsed.data.email } });
      if (existingUser) {
        await NotificationService.create({
          userId: existingUser.id,
          type: 'INDEPENDENT_MATCH_INVITE',
          title: 'Invitación a partido',
          body: `${match?.organizer.name ?? 'Alguien'} te invita a "${match?.name ?? 'un partido'}".`,
          metadata: { matchId: parsed.data.matchId },
        });
      }
    }

    revalidatePath(`/jugar/${parsed.data.matchId}`);
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

const inviteEntitySchema = z
  .object({
    matchId: z.string().cuid(),
    invitedUserId: z.string().cuid().optional().or(z.literal('').transform(() => undefined)),
    invitedTeamId: z.string().cuid().optional().or(z.literal('').transform(() => undefined)),
  })
  .refine((v) => Boolean(v.invitedUserId) !== Boolean(v.invitedTeamId), {
    message: 'Selecciona un jugador o un equipo del listado.',
  });

export async function inviteEntityToMatchAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const parsed = inviteEntitySchema.safeParse({
    matchId: formData.get('matchId'),
    invitedUserId: formData.get('invitedUserId'),
    invitedTeamId: formData.get('invitedTeamId'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    if (parsed.data.invitedUserId) {
      const { invitationId, isNew } = await IndependentMatchService.inviteUser(
        parsed.data.matchId,
        user.id,
        parsed.data.invitedUserId,
      );
      if (isNew) {
        await issueInvitationToken(parsed.data.matchId, invitationId);
        await sendUserInviteEmail(parsed.data.matchId, parsed.data.invitedUserId, invitationId);
        await NotificationService.create({
          userId: parsed.data.invitedUserId,
          type: 'INDEPENDENT_MATCH_INVITE',
          title: 'Invitación a partido',
          body: `Te invitan a un partido.`,
          metadata: { matchId: parsed.data.matchId },
        });
      }
    } else if (parsed.data.invitedTeamId) {
      const { invitationId, isNew } = await IndependentMatchService.inviteTeam(
        parsed.data.matchId,
        user.id,
        parsed.data.invitedTeamId,
      );
      if (isNew) {
        await issueInvitationToken(parsed.data.matchId, invitationId);
        await sendTeamInviteNotifications(parsed.data.matchId, parsed.data.invitedTeamId, invitationId);
      }
    }

    revalidatePath(`/jugar/${parsed.data.matchId}`);
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

export async function acceptPendingInvitationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const matchId = formData.get('matchId');
  if (typeof matchId !== 'string') return { error: 'Datos inválidos.' };

  try {
    await IndependentMatchService.acceptPendingInvitationByMatchId(matchId, user.id);
    revalidatePath('/jugar');
    revalidatePath('/partidos');
    revalidatePath(`/jugar/${matchId}`);
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

export async function rejectPendingInvitationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const matchId = formData.get('matchId');
  if (typeof matchId !== 'string') return { error: 'Datos inválidos.' };

  try {
    await IndependentMatchService.rejectPendingInvitationByMatchId(matchId, user.id);
    revalidatePath('/jugar');
    revalidatePath('/partidos');
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

export async function cancelMatchInvitation(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const matchId = formData.get('matchId');
  const invitationId = formData.get('invitationId');
  if (typeof matchId !== 'string' || typeof invitationId !== 'string')
    return { error: 'Datos inválidos.' };

  try {
    await IndependentMatchService.cancelInvitation(matchId, invitationId, user.id);
    revalidatePath(`/jugar/${matchId}`);
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function issueInvitationToken(matchId: string, invitationId: string): Promise<string> {
  return SignedTokenService.issue({
    purpose: SignedTokenPurpose.INDEPENDENT_MATCH_INVITE,
    subjectId: invitationId,
    ttlSeconds: 7 * 24 * 60 * 60,
  });
}

async function sendUserInviteEmail(matchId: string, invitedUserId: string, invitationId: string): Promise<void> {
  const token = await issueInvitationToken(matchId, invitationId);
  const matchUrl = `${env().APP_URL}/jugar/${matchId}?token=${token}`;
  const match = await prisma.independentMatch.findUnique({
    where: { id: matchId },
    include: { organizer: { select: { name: true } } },
  });
  const invitee = await prisma.user.findUnique({
    where: { id: invitedUserId },
    select: { email: true },
  });
  if (!invitee?.email) return;

  const q = queue();
  await q.start();
  await q.publish('send-email', {
    template: 'ind-match-invite',
    to: invitee.email,
    data: {
      organizerName: match?.organizer.name ?? 'Organizador',
      matchName: match?.name ?? 'Partido',
      matchUrl,
      scheduledAt: formatScheduledAt(match?.scheduledAt),
      location: match?.location ?? undefined,
      addToCalendarUrl: match?.scheduledAt
        ? `${env().APP_URL}/api/calendar/independent-match/${matchId}/event.ics`
        : undefined,
    },
    dedupKey: `ind-invite-${invitationId}`,
  });
}

async function sendTeamInviteNotifications(matchId: string, invitedTeamId: string, invitationId: string): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: invitedTeamId },
    include: { members: { include: { user: { select: { id: true, email: true } } } } },
  });
  if (!team) return;

  const token = await issueInvitationToken(matchId, invitationId);
  const matchUrl = `${env().APP_URL}/jugar/${matchId}?token=${token}`;
  const match = await prisma.independentMatch.findUnique({
    where: { id: matchId },
    include: { organizer: { select: { name: true } } },
  });

  // In-app notification per team member.
  await NotificationService.createMany(
    team.members.map((m) => ({
      userId: m.userId,
      type: 'INDEPENDENT_MATCH_INVITE' as const,
      title: 'Invitación a partido',
      body: `${match?.organizer.name ?? 'Alguien'} ha invitado a tu equipo "${team.name}" a "${match?.name ?? 'un partido'}".`,
      metadata: { matchId },
    })),
  );

  // Email per team member with an email.
  const q = queue();
  await q.start();
  await Promise.all(
    team.members
      .filter((m) => Boolean(m.user.email))
      .map((m) =>
        q.publish('send-email', {
          template: 'ind-match-invite',
          to: m.user.email,
          data: {
            organizerName: match?.organizer.name ?? 'Organizador',
            matchName: match?.name ?? 'Partido',
            matchUrl,
            scheduledAt: formatScheduledAt(match?.scheduledAt),
            location: match?.location ?? undefined,
            addToCalendarUrl: match?.scheduledAt
              ? `${env().APP_URL}/api/calendar/independent-match/${matchId}/event.ics`
              : undefined,
          },
          dedupKey: `ind-invite-${invitationId}-${m.userId}`,
        }),
      ),
  );
}

export async function postChatMessageAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const matchId = formData.get('matchId');
  const content = formData.get('content');
  if (typeof matchId !== 'string' || typeof content !== 'string') {
    return { error: 'Datos inválidos.' };
  }
  try {
    await IndependentMatchService.postChatMessage(matchId, user.id, content);
    revalidatePath(`/jugar/${matchId}`);
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

const updateScheduledAtSchema = z
  .object({
    matchId: z.string().cuid(),
    dateMode: z.enum(['fixed', 'open']),
    scheduledAt: z.string().optional().or(z.literal('').transform(() => undefined)),
  })
  .refine((v) => v.dateMode === 'open' || (v.dateMode === 'fixed' && !!v.scheduledAt), {
    message: 'Indica una fecha y hora.',
    path: ['scheduledAt'],
  });

export async function updateScheduledAtAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const parsed = updateScheduledAtSchema.safeParse({
    matchId: formData.get('matchId'),
    dateMode: formData.get('dateMode'),
    scheduledAt: formData.get('scheduledAt') ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  const { matchId, dateMode, scheduledAt } = parsed.data;
  const next = dateMode === 'fixed' && scheduledAt ? new Date(scheduledAt) : null;
  if (next && Number.isNaN(next.getTime())) {
    return { error: 'Fecha no válida.' };
  }

  try {
    await IndependentMatchService.updateScheduledAt(matchId, user.id, next);
    revalidatePath(`/jugar/${matchId}`);
    revalidatePath('/jugar');
    revalidatePath('/partidos');
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

export async function leaveMatchAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const matchId = formData.get('matchId');
  if (typeof matchId !== 'string') return { error: 'Datos inválidos.' };
  try {
    await IndependentMatchService.leaveMatch(matchId, user.id);
    revalidatePath('/jugar');
    revalidatePath('/partidos');
    revalidatePath(`/jugar/${matchId}`);
    return { success: true };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

export async function cancelMatch(formData: FormData): Promise<void> {
  const user = await getSession();
  const matchId = formData.get('matchId');
  if (typeof matchId !== 'string') return;

  try {
    await IndependentMatchService.cancelMatch(matchId, user.id);
  } catch (err) {
    if (isUserFacingError(err)) return; // silently absorb — page reload will show updated state
    throw err;
  }

  revalidatePath(`/jugar/${matchId}`);
  revalidatePath('/jugar');
  redirect('/jugar' as Route);
}
