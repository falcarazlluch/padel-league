'use server';

import { cookies } from 'next/headers';
import { prisma } from '@/shared/db/client';
import { SignedTokenService } from '@/shared/auth/signed-tokens';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { queue } from '@/shared/queue/client';
import { assertSuperAdmin } from '@/shared/auth/rbac';
import { ConflictError } from '@/shared/errors';
import { SignedTokenPurpose } from '@prisma/client';
import { env } from '@/shared/config/env';
import { logger } from '@/shared/logger';
import { getValidatedSession } from '@/shared/auth/session-cache';

export async function inviteUserAction(formData: FormData): Promise<{ error?: string; success?: string }> {
  const emailRaw = formData.get('email');
  const nameRaw = formData.get('name');
  const email = (typeof emailRaw === 'string' ? emailRaw : '').toLowerCase().trim();
  const name = (typeof nameRaw === 'string' ? nameRaw : '').trim();

  if (!email || !email.includes('@')) return { error: 'Email inválido.' };

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return { error: 'No autenticado.' };
    const actor = await getValidatedSession(token);
    assertSuperAdmin(actor);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictError('USER_EXISTS', 'Ya existe un usuario con ese email.');

    const user = await prisma.user.create({
      data: {
        email,
        name: name || 'Pendiente',
        passwordHash: `__invited__${Date.now()}`,
        emailVerifiedAt: null,
      },
    });

    const inviteToken = await SignedTokenService.issue({
      purpose: SignedTokenPurpose.USER_INVITATION,
      subjectId: user.id,
      ttlSeconds: 7 * 24 * 60 * 60,
    });

    const inviteUrl = `${env().APP_URL}/aceptar-invitacion/${inviteToken}`;

    const q = queue();
    await q.start();
    await q.publish('send-email', {
      template: 'invitation',
      to: email,
      data: { name: name || 'Jugador', inviteUrl },
      dedupKey: `invitation-${user.id}`,
    });

    await prisma.auditLog.create({
      data: { actorId: actor.id, action: 'user.invited', targetType: 'User', targetId: user.id },
    });

    logger().info({ actorId: actor.id, invitedUserId: user.id }, 'user.invited');
    return { success: `Invitación enviada a ${email}.` };
  } catch (err) {
    if (err instanceof ConflictError) {
      return { error: (err as Error).message };
    }
    logger().error({ err }, 'invite-user.unexpected');
    return { error: 'Error inesperado.' };
  }
}
