'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { headers } from 'next/headers';
import { z } from 'zod';
import { prisma } from '@/shared/db/client';
import { PasswordService } from '@/shared/auth/password';
import { SessionService } from '@/shared/auth/session';
import { RegistrationCodeService } from '@/modules/users';
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
  invitationCode: z.string().trim().min(1, 'Código de invitación obligatorio.'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Las contraseñas no coinciden.',
  path: ['confirmPassword'],
});

export async function registerAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    invitationCode: formData.get('invitationCode'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  }
  const { email, name, password, invitationCode } = parsed.data;

  const headerStore = await headers();
  const ip = headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const userAgent = headerStore.get('user-agent') ?? undefined;

  let userId: string;
  try {
    await checkRateLimit(buildRateLimitKey('register', 'ip', ip), { limit: 5 });

    const valid = await RegistrationCodeService.findValid(invitationCode);
    if (!valid) {
      throw new DomainError('INVALID_CODE', 'El código de invitación no es válido o ya fue usado.');
    }

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw new ConflictError('EMAIL_EXISTS', 'Ya existe una cuenta con ese email.');
    }

    const passwordHash = await PasswordService.hash(password);

    userId = await prisma.$transaction(async (tx) => {
      // Re-check the code is still unused inside the transaction (race-safe).
      const codeRow = await tx.registrationCode.findUnique({ where: { id: valid.id } });
      if (!codeRow || codeRow.usedAt !== null) {
        throw new DomainError('INVALID_CODE', 'El código de invitación ya no es válido.');
      }

      const user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          emailVerifiedAt: new Date(),
          role: 'PLAYER',
        },
      });

      await tx.registrationCode.update({
        where: { id: valid.id },
        data: { usedAt: new Date(), usedByUserId: user.id },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'auth.register.success',
          targetType: 'User',
          targetId: user.id,
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
  redirect('/dashboard' as Route);
}
