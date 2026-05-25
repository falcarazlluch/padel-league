import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { errorToResponse } from '@/shared/errors/http';
import { ValidationError } from '@/shared/errors';
import { PreferencesService } from '@/modules/push';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  pushInvitations: z.boolean().optional(),
  pushMatchDates: z.boolean().optional(),
  pushResults: z.boolean().optional(),
  pushPhotos: z.boolean().optional(),
  pushChat: z.boolean().optional(),
  pushLeagueEvents: z.boolean().optional(),
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

export async function GET(): Promise<Response> {
  try {
    const user = await getUserOrUnauthorized();
    if (!user) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });
    const prefs = await PreferencesService.get(user.id);
    return NextResponse.json(prefs);
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function PUT(req: Request): Promise<Response> {
  try {
    const user = await getUserOrUnauthorized();
    if (!user) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('INVALID_BODY', 'Cuerpo de petición inválido.');
    }

    const prefs = await PreferencesService.upsert(user.id, parsed.data);
    return NextResponse.json(prefs);
  } catch (err) {
    return errorToResponse(err);
  }
}
