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
import { isUserFacingError } from '@/shared/errors';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

const categoryEnum = z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
const dateString = z.string().refine((d) => !isNaN(Date.parse(d)), 'Fecha inválida');

const createLeagueSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
  description: z.string().max(500).optional(),
  registrationStart: dateString,
  registrationEnd: dateString,
  startDate: dateString,
  endDate: dateString,
  category: categoryEnum.optional(),
});

export async function createLeagueAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSession();
  const parsed = createLeagueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  }
  const { name, description, registrationStart, registrationEnd, startDate, endDate, category } = parsed.data;
  let slug: string;
  try {
    const league = await LeagueService.create({
      name,
      description,
      registrationStart: new Date(registrationStart),
      registrationEnd: new Date(registrationEnd),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      category,
      createdByUserId: user.id,
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

const updateLeagueSchema = z.object({
  leagueId: z.string().cuid(),
  slug: z.string().min(1),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
  description: z.string().max(500).optional(),
  registrationStart: dateString.optional(),
  registrationEnd: dateString.optional(),
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
