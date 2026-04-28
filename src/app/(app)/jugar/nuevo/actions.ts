'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { IndependentMatchService } from '@/modules/independent-matches';
import { isUserFacingError } from '@/shared/errors';
import { prisma } from '@/shared/db/client';
import { queue } from '@/shared/queue/client';
import { env } from '@/shared/config/env';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

type ActionResult = { error: string } | { success: true; matchId: string };

const createOpenSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(100),
  scheduledAt: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined))
    .refine((d) => d === undefined || !isNaN(d.getTime()), { message: 'Fecha no válida.' }),
  location: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  maxPlayers: z.coerce
    .number()
    .refine((n): n is 2 | 4 => n === 2 || n === 4, { message: 'El máximo de jugadores debe ser 2 o 4.' }),
});

export async function createOpenMatch(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const parsed = createOpenSchema.safeParse({
    name: formData.get('name'),
    scheduledAt: formData.get('scheduledAt') || undefined,
    location: formData.get('location') || undefined,
    description: formData.get('description') || undefined,
    maxPlayers: formData.get('maxPlayers'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    const match = await IndependentMatchService.createOpen({ ...parsed.data, organizerId: user.id });
    revalidatePath('/jugar');
    return { success: true, matchId: match.id };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

const createChallengeSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(100),
  organizerTeamId: z.string().cuid(),
  challengedTeamId: z.string().cuid(),
  leagueId: z.string().cuid(),
  scheduledAt: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined))
    .refine((d) => d === undefined || !isNaN(d.getTime()), { message: 'Fecha no válida.' }),
  location: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
});

export async function createChallenge(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const parsed = createChallengeSchema.safeParse({
    name: formData.get('name'),
    organizerTeamId: formData.get('organizerTeamId'),
    challengedTeamId: formData.get('challengedTeamId'),
    leagueId: formData.get('leagueId'),
    scheduledAt: formData.get('scheduledAt') || undefined,
    location: formData.get('location') || undefined,
    description: formData.get('description') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    const match = await IndependentMatchService.createChallenge({ ...parsed.data, organizerId: user.id });

    // Send email to challenged team members
    const challengedTeam = await prisma.team.findUnique({
      where: { id: parsed.data.challengedTeamId },
      include: { members: { include: { user: { select: { email: true, name: true } } } } },
    });
    const organizerTeam = await prisma.team.findUnique({
      where: { id: parsed.data.organizerTeamId },
      select: { name: true },
    });
    const matchUrl = `${env().APP_URL}/jugar/${match.id}`;
    const q = queue();
    await q.start();
    await Promise.all(
      (challengedTeam?.members ?? []).map((m) =>
        q.publish('send-email', {
          template: 'ind-match-challenge',
          to: m.user.email,
          data: {
            organizerTeamName: organizerTeam?.name ?? 'Equipo rival',
            matchName: match.name,
            matchUrl,
            scheduledAt: match.scheduledAt?.toLocaleDateString('es-ES') ?? undefined,
            location: match.location ?? undefined,
          },
          dedupKey: `ind-challenge-${match.id}-${m.user.email}`,
        }),
      ),
    );

    revalidatePath('/jugar');
    return { success: true, matchId: match.id };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}
