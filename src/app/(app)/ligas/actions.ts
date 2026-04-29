'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { LeagueService } from '@/modules/leagues';
import { prisma } from '@/shared/db/client';
import { isUserFacingError } from '@/shared/errors';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

const createLeagueSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
  description: z.string().max(500).optional(),
  startDate: z.string().refine((d) => !isNaN(Date.parse(d)), 'Fecha de inicio inválida'),
  endDate: z.string().refine((d) => !isNaN(Date.parse(d)), 'Fecha de fin inválida'),
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
  const { name, description, startDate, endDate } = parsed.data;
  if (new Date(endDate) <= new Date(startDate)) {
    return { error: 'La fecha de fin debe ser posterior a la de inicio.' };
  }
  let slug: string;
  try {
    const league = await LeagueService.create({
      name,
      description,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      createdByUserId: user.id,
    });
    slug = league.slug;
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  redirect(`/ligas/${slug}` as Route);
}

const createTeamSchema = z.object({
  leagueId: z.string().cuid(),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(60),
});

export async function createTeamAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  await getSession();
  const parsed = createTeamSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  const { leagueId, name } = parsed.data;
  try {
    await LeagueService.createTeam({ leagueId, name });
    return {};
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

const addMemberSchema = z.object({
  teamId: z.string().cuid(),
  userEmail: z.string().email('Email inválido'),
});

export async function addTeamMemberAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  await getSession();
  const parsed = addMemberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  const { teamId, userEmail } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!user) return { error: 'No existe ningún usuario con ese email.' };

  try {
    await LeagueService.addTeamMember(teamId, user.id);
    return {};
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

export async function removeTeamMemberAction(teamId: string, userId: string): Promise<{ error?: string }> {
  await getSession();
  try {
    await LeagueService.removeTeamMember(teamId, userId);
    return {};
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

export async function activateLeagueAction(leagueId: string): Promise<{ error?: string }> {
  const user = await getSession();
  try {
    await LeagueService.activateLeague(leagueId, user.id);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
  // DO NOT generate fixtures here — activateLeague handles it in its own transaction
  return {};
}

const updateLeagueSchema = z.object({
  leagueId: z.string().cuid(),
  slug: z.string().min(1),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
  description: z.string().max(500).optional(),
  endDate: z.string().refine((d) => !isNaN(Date.parse(d)), 'Fecha de fin inválida'),
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
    endDate: formData.get('endDate'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await LeagueService.updateLeague(parsed.data.leagueId, user.id, {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      endDate: new Date(parsed.data.endDate),
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
