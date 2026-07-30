'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { OrganizationService } from '@/modules/organizations';
import { prisma } from '@/shared/db/client';
import { isUserFacingError, NotFoundError } from '@/shared/errors';

type ActionState = { error?: string; success?: string };

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

function fail(err: unknown): ActionState {
  if (isUserFacingError(err)) return { error: (err as Error).message };
  throw err;
}

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Usa un color hex tipo #0D1E45.');

const createSchema = z.object({
  slug: z.string().trim().toLowerCase(),
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres.').max(80),
  logoUrl: z.string().trim().url('La URL del logo no es válida.').optional(),
  primaryColor: hexColor.optional(),
  secondaryColor: hexColor.optional(),
  accentColor: hexColor.optional(),
  contactEmail: z.string().trim().email('Email de contacto inválido.').optional(),
  tagline: z.string().trim().max(140).optional(),
});

export async function createOrganizationAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const user = await getSession();
  const parsed = createSchema.safeParse({
    slug: formData.get('slug'),
    name: formData.get('name'),
    logoUrl: formData.get('logoUrl') || undefined,
    primaryColor: formData.get('primaryColor') || undefined,
    secondaryColor: formData.get('secondaryColor') || undefined,
    accentColor: formData.get('accentColor') || undefined,
    contactEmail: formData.get('contactEmail') || undefined,
    tagline: formData.get('tagline') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await OrganizationService.create(
      {
        slug: parsed.data.slug,
        name: parsed.data.name,
        logoUrl: parsed.data.logoUrl ?? null,
        ...(parsed.data.primaryColor ? { primaryColor: parsed.data.primaryColor } : {}),
        ...(parsed.data.secondaryColor ? { secondaryColor: parsed.data.secondaryColor } : {}),
        ...(parsed.data.accentColor ? { accentColor: parsed.data.accentColor } : {}),
        contactEmail: parsed.data.contactEmail ?? null,
        tagline: parsed.data.tagline ?? null,
      },
      user.id,
    );
  } catch (err) {
    return fail(err);
  }
  revalidatePath('/admin/organizaciones');
  return { success: `Organización "${parsed.data.name}" creada.` };
}

const roleSchema = z.object({
  organizationId: z.string().cuid(),
  email: z.string().trim().toLowerCase().email('Email inválido.'),
  role: z.enum(['ORG_ADMIN', 'ORG_PLAYER']),
});

/**
 * Designates an org admin by email — the platform operator normally knows the
 * club contact's address, not their user id.
 */
export async function setOrgMemberRoleAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const user = await getSession();
  const parsed = roleSchema.safeParse({
    organizationId: formData.get('organizationId'),
    email: formData.get('email'),
    role: formData.get('role'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    const target = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, name: true, deletedAt: true },
    });
    if (!target || target.deletedAt) {
      throw new NotFoundError(
        'USER_NOT_FOUND',
        `No hay ninguna cuenta con el email ${parsed.data.email}.`,
      );
    }
    await OrganizationService.setMemberRole(
      parsed.data.organizationId,
      target.id,
      parsed.data.role,
      user.id,
    );
    revalidatePath('/admin/organizaciones');
    return {
      success:
        parsed.data.role === 'ORG_ADMIN'
          ? `${target.name} ya puede administrar esta organización.`
          : `${target.name} añadido como jugador.`,
    };
  } catch (err) {
    return fail(err);
  }
}

export async function setOrgActiveAction(
  organizationId: string,
  isActive: boolean,
): Promise<ActionState> {
  const user = await getSession();
  try {
    await OrganizationService.update(organizationId, user.id, { isActive });
  } catch (err) {
    return fail(err);
  }
  revalidatePath('/admin/organizaciones');
  return {};
}
