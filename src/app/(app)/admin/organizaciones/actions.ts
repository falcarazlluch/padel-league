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

const identitySchema = z.object({
  organizationId: z.string().cuid(),
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres.').max(80),
  tagline: z.string().trim().max(140).optional(),
  logoUrl: z.string().trim().url('La URL del logo no es válida.').optional(),
  contactEmail: z.string().trim().email('Email de contacto inválido.').optional(),
  primaryColor: hexColor,
  secondaryColor: hexColor,
  accentColor: hexColor,
});

/**
 * The platform's own version of the branding editor.
 *
 * The tenant screen at `/admin/organizacion` reads the organization from the
 * host, which is exactly right there and useless here: the platform admin edits
 * clubs from the apex domain, where there is no tenant. So the id travels in the
 * form, and `assertPlatformSuperAdmin` (inside `OrganizationService.update`, via
 * the `isActive` branch) is not enough — we check the role here before trusting
 * that id at all.
 */
export async function updateOrgIdentityAsPlatformAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const user = await getSession();
  if (user.role !== 'SUPER_ADMIN') {
    return { error: 'Solo un Super Admin de la plataforma puede editar otras organizaciones.' };
  }

  const parsed = identitySchema.safeParse({
    organizationId: formData.get('organizationId'),
    name: formData.get('name'),
    tagline: formData.get('tagline') || undefined,
    logoUrl: formData.get('logoUrl') || undefined,
    contactEmail: formData.get('contactEmail') || undefined,
    primaryColor: formData.get('primaryColor'),
    secondaryColor: formData.get('secondaryColor'),
    accentColor: formData.get('accentColor'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await OrganizationService.update(parsed.data.organizationId, user.id, {
      name: parsed.data.name,
      // Empty means "clear it", hence null rather than leaving it untouched.
      tagline: parsed.data.tagline ?? null,
      logoUrl: parsed.data.logoUrl ?? null,
      contactEmail: parsed.data.contactEmail ?? null,
      primaryColor: parsed.data.primaryColor,
      secondaryColor: parsed.data.secondaryColor,
      accentColor: parsed.data.accentColor,
    });
  } catch (err) {
    return fail(err);
  }

  revalidatePath('/admin/organizaciones');
  revalidatePath(`/admin/organizaciones/${parsed.data.organizationId}`);
  return { success: 'Identidad actualizada. El subdominio del club la sirve ya.' };
}

const memberRefSchema = z.object({
  organizationId: z.string().cuid(),
  userId: z.string().cuid(),
});

/** Promote/demote a member from the platform's org detail screen. */
export async function setOrgMemberRoleByIdAction(
  organizationId: string,
  userId: string,
  role: 'ORG_ADMIN' | 'ORG_PLAYER',
): Promise<ActionState> {
  const user = await getSession();
  const parsed = memberRefSchema.safeParse({ organizationId, userId });
  if (!parsed.success) return { error: 'Datos inválidos.' };
  try {
    await OrganizationService.setMemberRole(organizationId, userId, role, user.id);
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/admin/organizaciones/${organizationId}`);
  revalidatePath('/admin/organizaciones');
  return {};
}

/**
 * Drops the membership. Deliberately does NOT touch the account: the person
 * keeps their platform user, their history and any competition they already
 * entered — they simply stop seeing this club's environment.
 */
export async function removeOrgMemberAction(
  organizationId: string,
  userId: string,
): Promise<ActionState> {
  const user = await getSession();
  const parsed = memberRefSchema.safeParse({ organizationId, userId });
  if (!parsed.success) return { error: 'Datos inválidos.' };
  try {
    await OrganizationService.removeMember(organizationId, userId, user.id);
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/admin/organizaciones/${organizationId}`);
  revalidatePath('/admin/organizaciones');
  return {};
}
