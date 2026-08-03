'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { EnrollmentService } from '@/modules/organizations';
import { CATEGORY_VALUES } from '@/modules/leagues/presentation/category';
import { isUserFacingError } from '@/shared/errors';

type ActionState = { error?: string; success?: true };

async function requireSession(token: string) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    // Back to the wizard's own auth step, not /login — the invite context
    // (and the org membership it grants) would be lost otherwise.
    redirect(`/inscripcion/${token}?paso=2` as Route);
  }
  return getValidatedSession(sessionToken);
}

function fail(err: unknown): ActionState {
  if (isUserFacingError(err)) return { error: (err as Error).message };
  throw err;
}

function wizardHref(token: string, step: number, slug: string): string {
  return `/inscripcion/${token}?paso=${step}&liga=${encodeURIComponent(slug)}`;
}

const profileSchema = z.object({
  inviteToken: z.string().min(1),
  leagueId: z.string().cuid(),
  leagueSlug: z.string().min(1),
  nextStep: z.coerce.number().int().min(1).max(6),
  name: z.string().trim().min(3, 'Escribe tu nombre y apellido.').max(80),
  phone: z.string().trim().min(6, 'Escribe un teléfono de contacto.').max(30),
  category: z.enum(CATEGORY_VALUES),
});

/**
 * The profile step is where the enrolment actually begins: it joins the tenant
 * and creates the `TournamentEnrollment` before saving the details. Doing it
 * here rather than on page load keeps opening a link side-effect-free, and it is
 * the first point at which the player has unambiguously committed.
 */
export async function saveProfileAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const parsed = profileSchema.safeParse({
    inviteToken: formData.get('inviteToken'),
    leagueId: formData.get('leagueId'),
    leagueSlug: formData.get('leagueSlug'),
    nextStep: formData.get('nextStep'),
    name: formData.get('name'),
    phone: formData.get('phone'),
    category: formData.get('category'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  const user = await requireSession(parsed.data.inviteToken);

  try {
    await EnrollmentService.start(parsed.data.inviteToken, user.id, parsed.data.leagueId);
    await EnrollmentService.saveProfile(user.id, {
      name: parsed.data.name,
      phone: parsed.data.phone,
      category: parsed.data.category,
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath('/dashboard');
  redirect(wizardHref(parsed.data.inviteToken, parsed.data.nextStep, parsed.data.leagueSlug) as Route);
}

const existingTeamSchema = z.object({
  inviteToken: z.string().min(1),
  leagueId: z.string().cuid(),
  leagueSlug: z.string().min(1),
  nextStep: z.coerce.number().int().min(1).max(6),
  teamId: z.string().cuid('Elige una de tus parejas.'),
});

/** Partner branch A — the pair already exists and is complete. */
export async function registerExistingTeamAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const parsed = existingTeamSchema.safeParse({
    inviteToken: formData.get('inviteToken'),
    leagueId: formData.get('leagueId'),
    leagueSlug: formData.get('leagueSlug'),
    nextStep: formData.get('nextStep'),
    teamId: formData.get('teamId'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  const user = await requireSession(parsed.data.inviteToken);

  try {
    await EnrollmentService.registerWithExistingTeam({
      leagueId: parsed.data.leagueId,
      teamId: parsed.data.teamId,
      userId: user.id,
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath('/dashboard');
  revalidatePath('/ligas');
  redirect(wizardHref(parsed.data.inviteToken, parsed.data.nextStep, parsed.data.leagueSlug) as Route);
}

const invitePartnerSchema = z
  .object({
    inviteToken: z.string().min(1),
    leagueId: z.string().cuid(),
    leagueSlug: z.string().min(1),
    nextStep: z.coerce.number().int().min(1).max(6),
    teamName: z.string().trim().max(60).optional(),
    partnerUserId: z.string().cuid().optional(),
    partnerEmail: z.string().trim().toLowerCase().email('Escribe un email válido.').optional(),
    partnerName: z.string().trim().max(80).optional(),
  })
  .refine((v) => Boolean(v.partnerUserId) || Boolean(v.partnerEmail), {
    message: 'Elige a tu pareja de la lista o escribe su email.',
  });

/** Partner branch B — invite the partner (existing account or plain email). */
export async function invitePartnerAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const parsed = invitePartnerSchema.safeParse({
    inviteToken: formData.get('inviteToken'),
    leagueId: formData.get('leagueId'),
    leagueSlug: formData.get('leagueSlug'),
    nextStep: formData.get('nextStep'),
    teamName: formData.get('teamName') || undefined,
    partnerUserId: formData.get('partnerUserId') || undefined,
    partnerEmail: formData.get('partnerEmail') || undefined,
    partnerName: formData.get('partnerName') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  const user = await requireSession(parsed.data.inviteToken);

  try {
    await EnrollmentService.invitePartner({
      leagueId: parsed.data.leagueId,
      userId: user.id,
      ...(parsed.data.teamName ? { teamName: parsed.data.teamName } : {}),
      ...(parsed.data.partnerUserId ? { partnerUserId: parsed.data.partnerUserId } : {}),
      ...(parsed.data.partnerEmail ? { partnerEmail: parsed.data.partnerEmail } : {}),
      ...(parsed.data.partnerName ? { partnerName: parsed.data.partnerName } : {}),
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath('/dashboard');
  redirect(wizardHref(parsed.data.inviteToken, parsed.data.nextStep, parsed.data.leagueSlug) as Route);
}

const leagueRefSchema = z.object({
  inviteToken: z.string().min(1),
  leagueId: z.string().cuid(),
});

/** Undo the pending partner invite so the player can pick someone else. */
export async function cancelPartnerInviteAction(
  inviteToken: string,
  leagueId: string,
): Promise<ActionState> {
  const parsed = leagueRefSchema.safeParse({ inviteToken, leagueId });
  if (!parsed.success) return { error: 'Datos inválidos.' };
  const user = await requireSession(inviteToken);
  try {
    await EnrollmentService.cancelPartnerInvite({ leagueId, userId: user.id });
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/inscripcion/${inviteToken}`);
  return { success: true };
}

/** Abandon the enrolment entirely (also withdraws an existing registration). */
export async function cancelEnrollmentAction(
  inviteToken: string,
  leagueId: string,
): Promise<ActionState> {
  const parsed = leagueRefSchema.safeParse({ inviteToken, leagueId });
  if (!parsed.success) return { error: 'Datos inválidos.' };
  const user = await requireSession(inviteToken);
  try {
    await EnrollmentService.cancel({ leagueId, userId: user.id });
  } catch (err) {
    return fail(err);
  }
  revalidatePath('/dashboard');
  revalidatePath('/ligas');
  revalidatePath(`/inscripcion/${inviteToken}`);
  return { success: true };
}
