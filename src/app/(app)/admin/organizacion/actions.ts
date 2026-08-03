'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { OrganizationService } from '@/modules/organizations';
import { getTenantId } from '@/shared/tenant/context';
import { isUserFacingError } from '@/shared/errors';

type ActionState = { error?: string; success?: string };

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Usa un color hex tipo #0D1E45.');

/**
 * Everything an ORG_ADMIN may change about their own tenant.
 *
 * Deliberately absent: `slug` (it is the subdomain — renaming it would break
 * every inscription link already handed out) and `isActive` (a platform-level
 * decision; `OrganizationService.update` escalates to SUPER_ADMIN for that
 * field, so it could not be set from here even if the form sent it).
 */
const brandingSchema = z.object({
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres.').max(80),
  tagline: z.string().trim().max(140).optional(),
  logoUrl: z.string().trim().url('La URL del logo no es válida.').optional(),
  contactEmail: z.string().trim().email('Email de contacto inválido.').optional(),
  primaryColor: hexColor,
  secondaryColor: hexColor,
  accentColor: hexColor,
});

export async function updateOrgBrandingAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token);

  // The tenant comes from the host, never from the form: otherwise an admin of
  // one club could repaint another by posting a different id.
  const organizationId = await getTenantId();
  if (!organizationId) {
    return { error: 'Esta pantalla solo existe dentro del entorno de una organización.' };
  }

  const parsed = brandingSchema.safeParse({
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
    await OrganizationService.update(organizationId, user.id, {
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
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }

  // The brand is painted by the root layout, so every page needs revalidating.
  revalidatePath('/', 'layout');
  return { success: 'Branding actualizado. Recarga para verlo aplicado en toda la app.' };
}
