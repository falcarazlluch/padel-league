import { prisma } from '@/shared/db/client';
import { RateLimitError } from '@/shared/errors';

export const WINDOW_MINUTES = 15;

export function buildRateLimitKey(action: string, scope: string, identifier: string): string {
  return `${action}:${scope}:${identifier}`;
}

export interface RateLimitConfig {
  /** Max hits allowed in the window */
  limit: number;
}

/**
 * Increments the counter for `key` and throws RateLimitError if the limit is exceeded.
 * Uses INSERT ... ON CONFLICT to atomically upsert and slide the window.
 */
export async function checkRateLimit(key: string, config: RateLimitConfig): Promise<void> {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);

  // Upsert: increment counter, or reset window if outside current window
  await prisma.$executeRaw`
    INSERT INTO rate_limit_buckets (id, key, count, window_start)
    VALUES (gen_random_uuid(), ${key}, 1, now())
    ON CONFLICT (key) DO UPDATE
    SET
      count = CASE
        WHEN rate_limit_buckets.window_start < ${windowStart}
        THEN 1
        ELSE rate_limit_buckets.count + 1
      END,
      window_start = CASE
        WHEN rate_limit_buckets.window_start < ${windowStart}
        THEN now()
        ELSE rate_limit_buckets.window_start
      END
  `;

  const bucket = await prisma.rateLimitBucket.findUnique({ where: { key } });
  if (bucket && bucket.windowStart >= windowStart && bucket.count > config.limit) {
    throw new RateLimitError(
      'RATE_LIMIT_EXCEEDED',
      `Demasiados intentos. Espera ${WINDOW_MINUTES} minutos.`,
    );
  }
}
