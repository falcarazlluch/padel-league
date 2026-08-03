'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { LeagueService } from '@/modules/leagues';
import { LeagueRegistrationService } from '@/modules/teams';
import { InviteLinkService } from '@/modules/organizations';
import { getTenantId } from '@/shared/tenant/context';
import { isUserFacingError } from '@/shared/errors';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

const categoryEnum = z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
const dateString = z.string().refine((d) => !isNaN(Date.parse(d)), 'Fecha inválida');

// Discriminator + bloque común a los tres tipos. La forma final del input se
// compone más abajo via z.discriminatedUnion según el campo `type`.
const baseSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
  description: z.string().max(500).optional(),
  registrationStart: dateString,
  registrationEnd: dateString,
  startDate: dateString,
  endDate: dateString,
  category: categoryEnum.optional(),
});

const leagueSchema = baseSchema.extend({
  type: z.literal('LEAGUE'),
});

// El wizard envía siempre todos los hidden inputs específicos del tipo (con
// "" cuando no aplican). Trata string vacío como undefined antes de coerce
// para que `.optional()` lo acepte sin chocar con `min()`.
const optionalCoerceInt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(min).max(max).optional(),
  );

const americanaSchema = baseSchema.extend({
  type: z.literal('AMERICANA'),
  americanaVariant: z.enum(['ROTATING_INDIVIDUAL', 'FIXED_PAIRS']),
  americanaRoundFormat: z.enum(['FIRST_TO_GAMES', 'BY_TIME']),
  americanaTargetGames: optionalCoerceInt(4, 16),
  americanaRoundMinutes: optionalCoerceInt(5, 90),
  americanaCourts: z.coerce.number().int().min(1).max(4),
});

const tournamentSchema = baseSchema.extend({
  type: z.literal('TOURNAMENT'),
  hasGroupPhase: z.coerce.boolean(),
  groupCount: optionalCoerceInt(2, 16),
  teamsPerGroup: optionalCoerceInt(3, 16),
  qualifiersPerGroup: optionalCoerceInt(1, 8),
  bracketSeedingMode: z.enum(['AUTO', 'MANUAL']).optional(),
});

const createLeagueSchema = z.discriminatedUnion('type', [
  leagueSchema,
  americanaSchema,
  tournamentSchema,
]);

type CreateLeagueState = {
  error?: string;
};

export async function createLeagueAction(
  _prev: CreateLeagueState | null,
  formData: FormData,
): Promise<CreateLeagueState> {
  const user = await getSession();

  // Normaliza el FormData a un objeto plano; los campos numéricos llegan como
  // string y el `hasGroupPhase` checkbox llega como "on" | undefined → "true" | "false".
  const raw = Object.fromEntries(formData);
  if (raw['hasGroupPhase'] !== undefined) {
    raw['hasGroupPhase'] = raw['hasGroupPhase'] === 'on' || raw['hasGroupPhase'] === 'true' ? 'true' : 'false';
  }
  // El campo `type` debe llegar siempre; sin él el discriminatedUnion falla.
  if (typeof raw['type'] !== 'string') raw['type'] = 'LEAGUE';

  const parsed = createLeagueSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  }
  const data = parsed.data;
  // The competition belongs to whichever tenant the admin created it from —
  // never to a tenant chosen in the form, which would be a cross-tenant write.
  const organizationId = await getTenantId();
  let slug: string;
  try {
    const league = await LeagueService.create({
      organizationId,
      name: data.name,
      description: data.description,
      registrationStart: new Date(data.registrationStart),
      registrationEnd: new Date(data.registrationEnd),
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      category: data.category,
      createdByUserId: user.id,
      type: data.type,
      americana: data.type === 'AMERICANA'
        ? {
            americanaVariant: data.americanaVariant,
            americanaRoundFormat: data.americanaRoundFormat,
            americanaTargetGames: data.americanaTargetGames,
            americanaRoundMinutes: data.americanaRoundMinutes,
            americanaCourts: data.americanaCourts,
          }
        : undefined,
      tournament: data.type === 'TOURNAMENT'
        ? {
            hasGroupPhase: data.hasGroupPhase,
            groupCount: data.groupCount,
            teamsPerGroup: data.teamsPerGroup,
            qualifiersPerGroup: data.qualifiersPerGroup,
            bracketSeedingMode: data.bracketSeedingMode,
          }
        : undefined,
    });
    slug = league.slug;
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  redirect(`/ligas/${slug}` as Route);
}

export async function activateLeagueAction(leagueId: string): Promise<{ error?: string }> {
  const user = await getSession();
  try {
    await LeagueService.activateLeague(leagueId, user.id);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  return {};
}

export async function materializeTournamentBracketAction(
  leagueId: string,
): Promise<{ error?: string }> {
  const user = await getSession();
  try {
    await LeagueService.materializeTournamentBracket(leagueId, user.id);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  revalidatePath('/ligas', 'layout');
  revalidatePath('/admin/inscripciones');
  return {};
}

export async function reorderSeedAction(
  registrationId: string,
  direction: 'UP' | 'DOWN',
): Promise<{ error?: string }> {
  const user = await getSession();
  try {
    await LeagueService.reorderSeed(registrationId, direction, user.id);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  revalidatePath('/ligas', 'layout');
  return {};
}

const substituteBracketSlotSchema = z.object({
  matchId: z.string().cuid(),
  slot: z.enum(['A', 'B']),
  newTeamId: z.string().cuid(),
});

export async function substituteBracketSlotAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: true }> {
  const user = await getSession();
  const parsed = substituteBracketSlotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await LeagueService.substituteBracketSlot(
      parsed.data.matchId,
      parsed.data.slot,
      parsed.data.newTeamId,
      user.id,
    );
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  revalidatePath('/ligas', 'layout');
  return { success: true };
}

const updateLeagueSchema = z.object({
  leagueId: z.string().cuid(),
  slug: z.string().min(1),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
  description: z.string().max(500).optional(),
  registrationStart: dateString.optional(),
  registrationEnd: dateString.optional(),
  startDate: dateString.optional(),
  endDate: dateString,
  category: categoryEnum.optional(),
});

export async function updateLeagueAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: true }> {
  const user = await getSession();
  const parsed = updateLeagueSchema.safeParse({
    leagueId: formData.get('leagueId'),
    slug: formData.get('slug'),
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    registrationStart: formData.get('registrationStart') || undefined,
    registrationEnd: formData.get('registrationEnd') || undefined,
    startDate: formData.get('startDate') || undefined,
    endDate: formData.get('endDate'),
    category: formData.get('category') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await LeagueService.updateLeague(parsed.data.leagueId, user.id, {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      endDate: new Date(parsed.data.endDate),
      ...(parsed.data.registrationStart && { registrationStart: new Date(parsed.data.registrationStart) }),
      ...(parsed.data.registrationEnd && { registrationEnd: new Date(parsed.data.registrationEnd) }),
      ...(parsed.data.startDate && { startDate: new Date(parsed.data.startDate) }),
      ...(parsed.data.category && { category: parsed.data.category }),
    });
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }

  revalidatePath('/ligas');
  revalidatePath(`/ligas/${parsed.data.slug}`);
  return { success: true };
}

export async function deleteLeagueAction(leagueId: string): Promise<{ error?: string }> {
  const user = await getSession();
  try {
    await LeagueService.deleteLeague(leagueId, user.id);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  revalidatePath('/ligas');
  revalidatePath('/dashboard');
  redirect('/ligas' as Route);
}

// ─── Enlaces de inscripción (whitelabel) ─────────────────────────────────

const createInviteLinkSchema = z.object({
  leagueId: z.string().cuid(),
  label: z.string().trim().max(80).optional(),
  maxUses: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(1).max(1000).optional(),
  ),
});

export async function createInviteLinkAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: true }> {
  const user = await getSession();
  const parsed = createInviteLinkSchema.safeParse({
    leagueId: formData.get('leagueId'),
    label: formData.get('label') || undefined,
    maxUses: formData.get('maxUses'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await InviteLinkService.create(
      {
        leagueId: parsed.data.leagueId,
        label: parsed.data.label ?? null,
        maxUses: parsed.data.maxUses ?? null,
      },
      user.id,
    );
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  revalidatePath('/ligas', 'layout');
  return { success: true };
}

const createOrgInviteLinkSchema = z.object({
  label: z.string().trim().max(80).optional(),
  maxUses: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(1).max(5000).optional(),
  ),
});

/**
 * Organization-wide inscription link: the one an admin hands out once and
 * reuses all season. The tenant comes from the host, never from the form, so
 * this cannot mint a link for someone else's organization.
 */
export async function createOrgInviteLinkAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: true }> {
  const user = await getSession();
  const organizationId = await getTenantId();
  if (!organizationId) {
    return { error: 'Los enlaces de organización solo se generan dentro del entorno de la organización.' };
  }
  const parsed = createOrgInviteLinkSchema.safeParse({
    label: formData.get('label') || undefined,
    maxUses: formData.get('maxUses'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await InviteLinkService.create(
      {
        organizationId,
        label: parsed.data.label ?? null,
        maxUses: parsed.data.maxUses ?? null,
      },
      user.id,
    );
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  revalidatePath('/admin/inscripciones');
  return { success: true };
}

export async function revokeInviteLinkAction(linkId: string): Promise<{ error?: string }> {
  const user = await getSession();
  try {
    await InviteLinkService.revoke(linkId, user.id);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  revalidatePath('/ligas', 'layout');
  return {};
}

const registerIndividualSchema = z.object({
  leagueId: z.string().cuid(),
});

export async function registerIndividualAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: true }> {
  const user = await getSession();
  const parsed = registerIndividualSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await LeagueRegistrationService.registerIndividual({
      leagueId: parsed.data.leagueId,
      userId: user.id,
    });
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }

  revalidatePath('/ligas');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function withdrawIndividualAction(
  leagueId: string,
): Promise<{ error?: string }> {
  const user = await getSession();
  try {
    await LeagueRegistrationService.withdrawIndividual({ leagueId, userId: user.id });
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  revalidatePath('/ligas');
  revalidatePath('/dashboard');
  return {};
}

const registerSchema = z.object({
  leagueId: z.string().cuid(),
  teamId: z.string().cuid(),
});

export async function registerTeamAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: true }> {
  const user = await getSession();
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await LeagueRegistrationService.register({
      leagueId: parsed.data.leagueId,
      teamId: parsed.data.teamId,
      userId: user.id,
    });
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }

  revalidatePath('/ligas');
  revalidatePath('/equipos');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function withdrawTeamAction(
  leagueId: string,
  teamId: string,
): Promise<{ error?: string }> {
  const user = await getSession();
  try {
    await LeagueRegistrationService.withdraw({ leagueId, teamId, userId: user.id });
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }

  revalidatePath('/ligas');
  revalidatePath('/equipos');
  revalidatePath('/dashboard');
  return {};
}
