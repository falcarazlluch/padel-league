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
          scheduledAt: match?.scheduledAt?.toLocaleDateString('es-ES') ?? undefined,
          location: match?.location ?? undefined,
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
      scheduledAt: match?.scheduledAt?.toLocaleDateString('es-ES') ?? undefined,
      location: match?.location ?? undefined,
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
            scheduledAt: match?.scheduledAt?.toLocaleDateString('es-ES') ?? undefined,
            location: match?.location ?? undefined,
          },
          dedupKey: `ind-invite-${invitationId}-${m.userId}`,
        }),
      ),
  );
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
