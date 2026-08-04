'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { headers } from 'next/headers';
import { z } from 'zod';
import { prisma } from '@/shared/db/client';
import { PasswordService } from '@/shared/auth/password';
import { SessionService } from '@/shared/auth/session';
import { RegistrationCodeService } from '@/modules/users';
import { CATEGORY_VALUES } from '@/modules/leagues/presentation/category';
import { EnrollmentService, InviteLinkService, OrganizationService } from '@/modules/organizations';
import { ConflictError, DomainError, isUserFacingError } from '@/shared/errors';
import { checkRateLimit, buildRateLimitKey } from '@/shared/auth/rate-limit';
import { logger } from '@/shared/logger';

const schema = z.object({
  email: z.string().email('Email inválido.').transform((v) => v.toLowerCase().trim()),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres.').max(80),
  password: z.string()
    .min(10, 'La contraseña debe tener al menos 10 caracteres.')
    .refine((v) => /\d/.test(v) && /[a-zA-Z]/.test(v), 'La contraseña debe contener al menos un número y una letra.'),
  confirmPassword: z.string(),
  // Level of play. Asked at sign-up (it used to be collected mid-wizard), and
  // optional so the classic code-only signup keeps working if the field is
  // absent — the schema default matches the column default.
  category: z.enum(CATEGORY_VALUES).default('INTERMEDIATE'),
  // Exactly one of these three is required — see `resolveEntryPass` below.
  invitationCode: z.string().trim().optional(),
  inviteToken: z.string().trim().optional(),
  partnerToken: z.string().trim().optional(),
  next: z.string().trim().optional(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Las contraseñas no coinciden.',
  path: ['confirmPassword'],
});

/**
 * Only same-origin absolute paths are accepted as a post-signup destination, so
 * a crafted `?next=` on the registration link cannot bounce a new user to
 * another site.
 */
function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard';
  return raw;
}

/**
 * What entitles this person to an account. A tournament inscription link or a
 * partner invite substitutes for the admin-issued registration code — that is
 * the point of the whitelabel flow: the organiser hands out one link, not codes.
 * The link also carries the organization to join.
 */
async function resolveEntryPass(input: {
  invitationCode?: string;
  inviteToken?: string;
  partnerToken?: string;
}): Promise<
  | { kind: 'code'; codeId: string }
  | { kind: 'invite'; organizationId: string }
  | { kind: 'partner'; organizationId: string | null }
> {
  if (input.inviteToken) {
    // Throws a user-facing DomainError when revoked/expired/closed.
    const { organizationId } = await InviteLinkService.resolveForEnrollment(input.inviteToken);
    return { kind: 'invite', organizationId };
  }
  if (input.partnerToken) {
    const invite = await EnrollmentService.getPartnerInvite(input.partnerToken, null);
    if (!invite) {
      throw new DomainError('INVITE_INVALID', 'Esta invitación de pareja no existe.');
    }
    // WRONG_ACCOUNT cannot apply here — there is no session yet.
    if (invite.blockedReason) {
      throw new DomainError(
        'INVITE_INVALID',
        'Esta invitación de pareja ya no es válida. Pide a tu pareja que te envíe una nueva.',
      );
    }
    return { kind: 'partner', organizationId: invite.organization?.id ?? null };
  }
  if (input.invitationCode) {
    const valid = await RegistrationCodeService.findValid(input.invitationCode);
    if (!valid) {
      throw new DomainError('INVALID_CODE', 'El código de invitación no es válido o ya fue usado.');
    }
    return { kind: 'code', codeId: valid.id };
  }
  throw new DomainError('INVITE_REQUIRED', 'Código de invitación obligatorio.');
}

export async function registerAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    category: formData.get('category') || undefined,
    invitationCode: formData.get('invitationCode') || undefined,
    inviteToken: formData.get('inviteToken') || undefined,
    partnerToken: formData.get('partnerToken') || undefined,
    next: formData.get('next') || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  }
  const { email, name, password, category, invitationCode, inviteToken, partnerToken } = parsed.data;

  const headerStore = await headers();
  const ip = headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const userAgent = headerStore.get('user-agent') ?? undefined;

  let userId: string;
  try {
    await checkRateLimit(buildRateLimitKey('register', 'ip', ip), { limit: 5 });

    const pass = await resolveEntryPass({ invitationCode, inviteToken, partnerToken });

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw new ConflictError('EMAIL_EXISTS', 'Ya existe una cuenta con ese email.');
    }

    const passwordHash = await PasswordService.hash(password);

    userId = await prisma.$transaction(async (tx) => {
      // Re-check the code is still unused inside the transaction (race-safe).
      if (pass.kind === 'code') {
        const codeRow = await tx.registrationCode.findUnique({ where: { id: pass.codeId } });
        if (!codeRow || codeRow.usedAt !== null) {
          throw new DomainError('INVALID_CODE', 'El código de invitación ya no es válido.');
        }
      }

      const user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          emailVerifiedAt: new Date(),
          role: 'PLAYER',
          category,
        },
      });

      if (pass.kind === 'code') {
        await tx.registrationCode.update({
          where: { id: pass.codeId },
          data: { usedAt: new Date(), usedByUserId: user.id },
        });
      } else if (pass.organizationId) {
        // Entering through a tenant link makes you a member of that tenant —
        // without it the new account would land on a subdomain it cannot see.
        await OrganizationService.ensureMember(pass.organizationId, user.id, 'ORG_PLAYER', tx);
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'auth.register.success',
          targetType: 'User',
          targetId: user.id,
          metadata: { via: pass.kind },
          ipAddress: ip,
          userAgent,
        },
      });
      return user.id;
    });
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    logger().error({ err }, 'register.unexpected');
    return { error: 'Error inesperado. Inténtalo de nuevo.' };
  }

  const sessionToken = await SessionService.create(userId, ip, userAgent);
  await SessionService.setSessionCookie(sessionToken);
  redirect(safeNext(parsed.data.next) as Route);
}
