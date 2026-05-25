import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { errorToResponse } from '@/shared/errors/http';
import { ValidationError } from '@/shared/errors';
import { checkRateLimit, buildRateLimitKey } from '@/shared/auth/rate-limit';
import { PushService } from '@/modules/push';

export const dynamic = 'force-dynamic';

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  p256dh: z.string().min(1).max(512),
  auth: z.string().min(1).max(512),
  userAgent: z.string().max(512).optional(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

async function getUserOrUnauthorized() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await getValidatedSession(token);
  } catch {
    return null;
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await getUserOrUnauthorized();
    if (!user) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });

    await checkRateLimit(buildRateLimitKey('push-subscribe', 'user', user.id), { limit: 20 });

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = subscribeSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('INVALID_BODY', 'Cuerpo de petición inválido.');
    }

    await PushService.subscribe(user.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  try {
    const user = await getUserOrUnauthorized();
    if (!user) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = unsubscribeSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('INVALID_BODY', 'Cuerpo de petición inválido.');
    }

    await PushService.unsubscribe(user.id, parsed.data.endpoint);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorToResponse(err);
  }
}
