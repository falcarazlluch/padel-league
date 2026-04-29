'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { MatchService } from '@/modules/leagues';
import { NotificationService } from '@/modules/notifications';
import { isUserFacingError } from '@/shared/errors';
import { queue } from '@/shared/queue/client';
import { env } from '@/shared/config/env';
import { prisma } from '@/shared/db/client';
import { logger } from '@/shared/logger';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

type MatchMember = { userId: string; user: { email: string; name: string } };
type MatchTeamInfo = {
  teamA: { id: string; name: string; members: MatchMember[] };
  teamB: { id: string; name: string; members: MatchMember[] };
  leagueSlug: string;
  winnerTeam: { name: string } | null;
};

async function fetchMatchTeamInfo(matchId: string): Promise<MatchTeamInfo | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      league: { select: { slug: true } },
      teamA: { include: { members: { include: { user: { select: { email: true, name: true } } } } } },
      teamB: { include: { members: { include: { user: { select: { email: true, name: true } } } } } },
    },
  });
  if (!match) return null;

  const winnerTeamId = match.winnerTeamId;
  const winnerTeam = winnerTeamId
    ? winnerTeamId === match.teamAId
      ? { name: match.teamA.name }
      : { name: match.teamB.name }
    : null;

  return {
    teamA: {
      id: match.teamA.id,
      name: match.teamA.name,
      members: match.teamA.members.map((m) => ({ userId: m.userId, user: { email: m.user.email, name: m.user.name } })),
    },
    teamB: {
      id: match.teamB.id,
      name: match.teamB.name,
      members: match.teamB.members.map((m) => ({ userId: m.userId, user: { email: m.user.email, name: m.user.name } })),
    },
    leagueSlug: match.league.slug,
    winnerTeam,
  };
}

const submitResultSchema = z.object({
  matchId: z.string().cuid(),
  setsCount: z.coerce.number().int().min(2).max(5),
});

export async function submitResultAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSession();

  const base = submitResultSchema.safeParse(Object.fromEntries(formData));
  if (!base.success) return { error: base.error.issues[0]?.message ?? 'Datos inválidos.' };

  const { matchId, setsCount } = base.data;
  const rawSets: Array<{ gamesA: number; gamesB: number }> = [];
  for (let i = 0; i < setsCount; i++) {
    const rawA = formData.get(`gamesA_${i}`);
    const rawB = formData.get(`gamesB_${i}`);
    if (rawA === null || rawB === null)
      return { error: 'Los marcadores de los sets son inválidos.' };
    rawSets.push({ gamesA: Number(rawA), gamesB: Number(rawB) });
  }
  if (rawSets.some((s) => !Number.isInteger(s.gamesA) || s.gamesA < 0 || !Number.isInteger(s.gamesB) || s.gamesB < 0))
    return { error: 'Los marcadores de los sets son inválidos.' };

  try {
    await MatchService.submitResult(matchId, user.id, { sets: rawSets });
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }

  revalidatePath('/dashboard');
  revalidatePath('/partidos');
  revalidatePath('/ligas', 'layout');

  try {
    const info = await fetchMatchTeamInfo(matchId);
    if (info) {
      const submitterIsA = info.teamA.members.some((m) => m.userId === user.id);
      const rivalTeam = submitterIsA ? info.teamB : info.teamA;
      const submitterTeamName = submitterIsA ? info.teamA.name : info.teamB.name;
      const matchUrl = `${env().APP_URL}/ligas/${info.leagueSlug}/partidos/${matchId}`;

      await NotificationService.createMany(
        rivalTeam.members.map((m) => ({
          userId: m.userId,
          type: 'RESULT_SUBMITTED' as const,
          title: 'Resultado enviado — pendiente de confirmación',
          body: `${submitterTeamName} ha enviado el resultado. Tienes 7 días para confirmar o disputar.`,
          metadata: { matchId },
        })),
      );

      const q = queue();
      await q.start();
      for (const member of rivalTeam.members) {
        await q.publish('send-email', {
          template: 'result-submitted',
          to: member.user.email,
          data: {
            matchTeamA: info.teamA.name,
            matchTeamB: info.teamB.name,
            submitterTeam: submitterTeamName,
            matchUrl,
          },
          dedupKey: `result-submitted-${matchId}-${member.userId}`,
        });
      }
    }
  } catch (err) {
    logger().warn({ err, matchId }, 'action.submit.side-effect.failed');
  }

  return {};
}

export async function confirmResultAction(matchId: string): Promise<{ error?: string }> {
  const user = await getSession();
  try {
    await MatchService.confirmResult(matchId, user.id);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }

  revalidatePath('/dashboard');
  revalidatePath('/partidos');
  revalidatePath('/ligas', 'layout');

  try {
    const info = await fetchMatchTeamInfo(matchId);
    if (info) {
      const confirmerIsA = info.teamA.members.some((m) => m.userId === user.id);
      const submitterTeam = confirmerIsA ? info.teamB : info.teamA;
      const matchUrl = `${env().APP_URL}/ligas/${info.leagueSlug}/partidos/${matchId}`;

      await NotificationService.createMany(
        submitterTeam.members.map((m) => ({
          userId: m.userId,
          type: 'RESULT_CONFIRMED' as const,
          title: 'Resultado confirmado',
          body: `El resultado del partido ha sido confirmado. ${info.winnerTeam ? `Ganador: ${info.winnerTeam.name}.` : 'Partido empatado.'}`,
          metadata: { matchId },
        })),
      );

      const q = queue();
      await q.start();
      for (const member of submitterTeam.members) {
        await q.publish('send-email', {
          template: 'result-confirmed',
          to: member.user.email,
          data: {
            matchTeamA: info.teamA.name,
            matchTeamB: info.teamB.name,
            winnerTeamName: info.winnerTeam?.name ?? null,
            matchUrl,
          },
          dedupKey: `result-confirmed-${matchId}-${member.userId}`,
        });
      }
    }
  } catch (err) {
    logger().warn({ err, matchId }, 'action.confirm.side-effect.failed');
  }

  return {};
}

const disputeSchema = z.object({
  matchId: z.string().cuid(),
  reason: z.string().min(10, 'El motivo debe tener al menos 10 caracteres.').max(1000),
});

export async function disputeResultAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSession();
  const parsed = disputeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await MatchService.disputeResult(parsed.data.matchId, user.id, parsed.data.reason);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }

  revalidatePath('/dashboard');
  revalidatePath('/partidos');
  revalidatePath('/ligas', 'layout');

  try {
    const info = await fetchMatchTeamInfo(parsed.data.matchId);
    if (info) {
      const disputerIsA = info.teamA.members.some((m) => m.userId === user.id);
      const submitterTeam = disputerIsA ? info.teamB : info.teamA;
      await NotificationService.createMany(
        submitterTeam.members.map((m) => ({
          userId: m.userId,
          type: 'RESULT_REJECTED' as const,
          title: 'Resultado disputado',
          body: 'El equipo rival ha disputado el resultado que enviaste. Un administrador revisará el caso.',
          metadata: { matchId: parsed.data.matchId },
        })),
      );
    }
  } catch (err) {
    logger().warn({ err, matchId: parsed.data.matchId }, 'action.dispute.side-effect.failed');
  }

  return {};
}
