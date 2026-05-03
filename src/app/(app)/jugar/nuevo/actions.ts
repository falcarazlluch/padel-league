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
import { logger } from '@/shared/logger';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

type ActionResult = { error: string } | { success: true; matchId: string };

const createOpenSchema = z
  .object({
    name: z.string().min(1, 'El nombre es obligatorio.').max(100),
    visibility: z.enum(['PUBLIC', 'PRIVATE']),
    hostKind: z.enum(['USER', 'TEAM']),
    hostTeamId: z.string().cuid().optional().or(z.literal('').transform(() => undefined)),
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
  })
  .refine((v) => v.hostKind === 'USER' || (v.hostKind === 'TEAM' && Boolean(v.hostTeamId)), {
    message: 'Selecciona el equipo organizador.',
    path: ['hostTeamId'],
  });

export async function createOpenMatch(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getSession();
  const parsed = createOpenSchema.safeParse({
    name: formData.get('name'),
    visibility: formData.get('visibility'),
    hostKind: formData.get('hostKind'),
    hostTeamId: formData.get('hostTeamId') ?? undefined,
    scheduledAt: formData.get('scheduledAt') || undefined,
    location: formData.get('location') || undefined,
    description: formData.get('description') || undefined,
    maxPlayers: formData.get('maxPlayers'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  const { hostKind, hostTeamId, ...rest } = parsed.data;
  const effectiveMaxPlayers = hostKind === 'TEAM' ? (4 as const) : rest.maxPlayers;

  try {
    const match = await IndependentMatchService.createOpen({
      ...rest,
      organizerId: user.id,
      maxPlayers: effectiveMaxPlayers,
      hostTeamId: hostKind === 'TEAM' ? hostTeamId : undefined,
    });
    revalidatePath('/jugar');
    return { success: true, matchId: match.id };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    logger().error(
      { err, userId: user.id, hostKind, hostTeamId, ...rest },
      'createOpenMatch.unexpected',
    );
    return {
      error: `Error inesperado al crear el partido: ${(err as Error)?.message ?? 'desconocido'}`,
    };
  }
}
