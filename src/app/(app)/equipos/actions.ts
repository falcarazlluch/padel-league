'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { TeamService } from '@/modules/teams';
import { isUserFacingError } from '@/shared/errors';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

const categoryEnum = z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);

const createTeamSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(60),
  category: categoryEnum,
});

export async function createTeamAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSession();
  const parsed = createTeamSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  let teamId: string;
  try {
    const team = await TeamService.create({
      name: parsed.data.name,
      category: parsed.data.category,
      createdByUserId: user.id,
    });
    teamId = team.id;
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  revalidatePath('/equipos');
  redirect(`/equipos/${teamId}` as Route);
}

const inviteSchema = z.object({
  teamId: z.string().cuid(),
  invitedUserIdentifier: z.string().min(1, 'Email o nombre obligatorio').max(255),
});

export async function inviteToTeamAction(
  _prev: { error?: string; success?: true } | null,
  formData: FormData,
): Promise<{ error?: string; success?: true }> {
  const user = await getSession();
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await TeamService.invite({
      teamId: parsed.data.teamId,
      invitedByUserId: user.id,
      invitedUserIdentifier: parsed.data.invitedUserIdentifier,
    });
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }

  revalidatePath(`/equipos/${parsed.data.teamId}`);
  return { success: true };
}

export async function cancelInvitationAction(invitationId: string, teamId: string): Promise<{ error?: string }> {
  const user = await getSession();
  try {
    await TeamService.cancelInvitation(invitationId, user.id);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  revalidatePath(`/equipos/${teamId}`);
  return {};
}

export async function acceptInvitationAction(invitationId: string): Promise<{ error?: string }> {
  const user = await getSession();
  try {
    await TeamService.acceptInvitation(invitationId, user.id);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  revalidatePath('/equipos');
  revalidatePath('/dashboard');
  return {};
}

export async function rejectInvitationAction(invitationId: string): Promise<{ error?: string }> {
  const user = await getSession();
  try {
    await TeamService.rejectInvitation(invitationId, user.id);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  revalidatePath('/equipos');
  revalidatePath('/dashboard');
  return {};
}
