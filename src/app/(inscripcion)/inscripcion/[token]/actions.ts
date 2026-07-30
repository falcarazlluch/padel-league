'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { EnrollmentService } from '@/modules/organizations';
import { CATEGORY_VALUES } from '@/modules/leagues';
import { isUserFacingError } from '@/shared/errors';

type ActionState = { error?: string; success?: true; info?: string };

async function requireSession(token: string) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    redirect(`/login?next=${encodeURIComponent(`/inscripcion/${token}`)}` as Route);
  }
  return getValidatedSession(sessionToken);
}

function fail(err: unknown): ActionState {
  if (isUserFacingError(err)) return { error: (err as Error).message };
  throw err;
}

/** Step 1 → 2. Creates or resumes the enrollment and moves the wizard on. */
export async function startEnrollmentAction(inviteToken: string): Promise<ActionState> {
  const user = await requireSession(inviteToken);
  let nextStep: number;
  try {
    const started = await EnrollmentService.start(inviteToken, user.id);
    // Where to land is derived server-side from the freshly-written row, so a
    // resumed enrolment reopens exactly where the player left it.
    const view = await EnrollmentService.getView(started.leagueId, user.id);
    nextStep = view.currentStep;
  } catch (err) {
    return fail(err);
  }
  redirect(`/inscripcion/${inviteToken}?paso=${nextStep}` as Route);
}

const profileSchema = z.object({
  inviteToken: z.string().min(1),
  name: z.string().trim().min(3, 'Escribe tu nombre y apellido.').max(80),
  phone: z.string().trim().min(6, 'Escribe un teléfono de contacto.').max(30),
  category: z.enum(CATEGORY_VALUES),
});

/** Step 2 → 3. */
export async function saveProfileAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const rawToken = formData.get('inviteToken');
  const inviteToken = typeof rawToken === 'string' ? rawToken : '';
  const user = await requireSession(inviteToken);

  const parsed = profileSchema.safeParse({
    inviteToken,
    name: formData.get('name'),
    phone: formData.get('phone'),
    category: formData.get('category'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await EnrollmentService.saveProfile(user.id, {
      name: parsed.data.name,
      phone: parsed.data.phone,
      category: parsed.data.category,
    });
  } catch (err) {
    return fail(err);
  }
  redirect(`/inscripcion/${parsed.data.inviteToken}?paso=3` as Route);
}

const existingTeamSchema = z.object({
  inviteToken: z.string().min(1),
  leagueId: z.string().cuid(),
  teamId: z.string().cuid('Elige una de tus parejas.'),
});

/** Step 3, branch A — the pair already exists and is complete. */
export async function registerExistingTeamAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const parsed = existingTeamSchema.safeParse({
    inviteToken: formData.get('inviteToken'),
    leagueId: formData.get('leagueId'),
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
  redirect(`/inscripcion/${parsed.data.inviteToken}?paso=4` as Route);
}

const invitePartnerSchema = z
  .object({
    inviteToken: z.string().min(1),
    leagueId: z.string().cuid(),
    teamName: z.string().trim().max(60).optional(),
    partnerUserId: z.string().cuid().optional(),
    partnerEmail: z.string().trim().toLowerCase().email('Escribe un email válido.').optional(),
    partnerName: z.string().trim().max(80).optional(),
  })
  .refine((v) => Boolean(v.partnerUserId) || Boolean(v.partnerEmail), {
    message: 'Elige a tu pareja de la lista o escribe su email.',
  });

/** Step 3, branch B — invite the partner (existing account or plain email). */
export async function invitePartnerAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const parsed = invitePartnerSchema.safeParse({
    inviteToken: formData.get('inviteToken'),
    leagueId: formData.get('leagueId'),
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
  redirect(`/inscripcion/${parsed.data.inviteToken}?paso=4` as Route);
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
