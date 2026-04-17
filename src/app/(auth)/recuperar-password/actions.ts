'use server';

import { headers } from 'next/headers';
import { prisma } from '@/shared/db/client';
import { SignedTokenService } from '@/shared/auth/signed-tokens';
import { queue } from '@/shared/queue/client';
import { checkRateLimit, buildRateLimitKey } from '@/shared/auth/rate-limit';
import { SignedTokenPurpose } from '@prisma/client';
import { env } from '@/shared/config/env';
import { logger } from '@/shared/logger';

export async function requestPasswordResetAction(
  formData: FormData,
): Promise<{ message: string }> {
  const emailRaw = formData.get('email');
  const email = (typeof emailRaw === 'string' ? emailRaw : '').toLowerCase().trim();
  const headerStore = await headers();
  const ip = headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // Rate limiting — always return same message to avoid email enumeration
  try {
    await checkRateLimit(buildRateLimitKey('password-reset', 'ip', ip), { limit: 5 });
  } catch {
    return { message: 'Si ese email está registrado, recibirás un enlace en breve.' };
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user?.emailVerifiedAt) {
      const resetToken = await SignedTokenService.issue({
        purpose: SignedTokenPurpose.PASSWORD_RESET,
        subjectId: user.id,
        ttlSeconds: 60 * 60, // 1 hour
      });

      const resetUrl = `${env().APP_URL}/recuperar-password/${resetToken}`;

      const q = queue();
      await q.start();
      await q.publish('send-email', {
        template: 'password-reset',
        to: email,
        data: { name: user.name, resetUrl },
        dedupKey: `reset-${user.id}-${Math.floor(Date.now() / 60000)}`,
      });

      logger().info({ userId: user.id }, 'auth.password.reset.requested');
    }
  } catch (err) {
    logger().error({ err }, 'password-reset.unexpected');
  }

  return { message: 'Si ese email está registrado, recibirás un enlace en breve.' };
}
