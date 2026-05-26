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

const deleteTeamSchema = z.object({ teamId: z.string().cuid() });

export async function deleteTeamAction(teamId: string): Promise<{ error?: string }> {
  const acting = await getSession();
  const parsed = deleteTeamSchema.safeParse({ teamId });
  if (!parsed.success) return { error: 'Identificador inválido.' };

  try {
    await TeamService.adminDelete(parsed.data.teamId, acting.id);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  revalidatePath('/admin/equipos');
  return {};
}
