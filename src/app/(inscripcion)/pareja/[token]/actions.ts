'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { EnrollmentService } from '@/modules/organizations';
import { isUserFacingError } from '@/shared/errors';

type ActionState = { error?: string; success?: true };

async function requireSession(token: string) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    redirect(`/login?next=${encodeURIComponent(`/pareja/${token}`)}` as Route);
  }
  return getValidatedSession(sessionToken);
}

export async function acceptPartnerInviteAction(token: string): Promise<ActionState> {
  const user = await requireSession(token);
  let slug: string;
  try {
    const res = await EnrollmentService.acceptPartnerInvite(token, user.id);
    slug = res.leagueSlug;
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  revalidatePath('/dashboard');
  revalidatePath('/ligas');
  redirect(`/inscripcion/estado/${slug}` as Route);
}

export async function declinePartnerInviteAction(token: string): Promise<ActionState> {
  const user = await requireSession(token);
  try {
    await EnrollmentService.declinePartnerInvite(token, user.id);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  revalidatePath(`/pareja/${token}`);
  return { success: true };
}
