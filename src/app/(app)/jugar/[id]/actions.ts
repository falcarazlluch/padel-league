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

const inviteUserSchema = z.object({
  matchId: z.string().cuid(),
  invitedUserId: z.string().cuid('Selecciona un jugador del listado.'),
});

export async function inviteUserToMatchAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const parsed = inviteUserSchema.safeParse({
    matchId: formData.get('matchId'),
    invitedUserId: formData.get('invitedUserId'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    const { invitationId, isNew } = await IndependentMatchService.inviteUser(
      parsed.data.matchId,
      user.id,
      parsed.data.invitedUserId,
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
      const invitee = await prisma.user.findUnique({
        where: { id: parsed.data.invitedUserId },
        select: { name: true, email: true },
      });

      // Email is best-effort; if the user has none configured we skip silently.
      if (invitee?.email) {
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

      await NotificationService.create({
        userId: parsed.data.invitedUserId,
        type: 'INDEPENDENT_MATCH_INVITE',
        title: 'Invitación a partido',
        body: `${match?.organizer.name ?? 'Alguien'} te invita a "${match?.name ?? 'un partido'}".`,
        metadata: { matchId: parsed.data.matchId },
      });
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

export async function respondToChallenge(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const matchId = formData.get('matchId');
  const response = formData.get('response');
  if (typeof matchId !== 'string' || (response !== 'accept' && response !== 'reject'))
    return { error: 'Datos inválidos.' };

  try {
    if (response === 'accept') {
      await IndependentMatchService.acceptChallenge(matchId, user.id);
    } else {
      await IndependentMatchService.rejectChallenge(matchId, user.id);
    }

    const match = await prisma.independentMatch.findUnique({
      where: { id: matchId },
      include: {
        organizer: { select: { email: true, name: true } },
        challengedTeam: { select: { name: true } },
      },
    });

    if (match?.organizer) {
      const q = queue();
      await q.start();
      await q.publish('send-email', {
        template: 'ind-match-challenge-response',
        to: match.organizer.email,
        data: {
          challengedTeamName: match.challengedTeam?.name ?? 'Equipo',
          matchName: match.name,
          accepted: response === 'accept',
          matchUrl: `${env().APP_URL}/jugar/${matchId}`,
        },
        dedupKey: `ind-challenge-response-${matchId}-${response}`,
      });
    }

    revalidatePath(`/jugar/${matchId}`);
    revalidatePath('/jugar');
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
