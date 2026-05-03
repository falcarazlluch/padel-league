'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { z } from 'zod';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { RegistrationCodeService } from '@/modules/users';
import { queue } from '@/shared/queue/client';
import { env } from '@/shared/config/env';
import { isUserFacingError } from '@/shared/errors';

type ActionResult = { error: string } | { success: true; email: string };

export type ShareLinkResult =
  | { error: string }
  | { ok: true; registerUrl: string; whatsappText: string; code: string };

function buildShareText(inviterName: string, registerUrl: string): string {
  return `¡Hola! 👋 ${inviterName} te invita a Padel League para gestionar ligas y partidos de pádel. Crea tu cuenta con este enlace personal: ${registerUrl}`;
}

const schema = z.object({
  email: z.string().email('Email inválido.').toLowerCase(),
});

export async function generateShareLinkAction(): Promise<ShareLinkResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token);

  try {
    const code = await RegistrationCodeService.generateForInvite(user.id);
    const registerUrl = `${env().APP_URL}/registro?code=${encodeURIComponent(code)}`;
    return {
      ok: true,
      code,
      registerUrl,
      whatsappText: buildShareText(user.name, registerUrl),
    };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}

export async function inviteFriendAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token);

  const parsed = schema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    const code = await RegistrationCodeService.generateForInvite(user.id);
    const registerUrl = `${env().APP_URL}/registro?code=${encodeURIComponent(code)}`;

    const q = queue();
    await q.start();
    await q.publish('send-email', {
      template: 'friend-invite',
      to: parsed.data.email,
      data: {
        inviterName: user.name,
        registerUrl,
        code,
      },
      dedupKey: `friend-invite-${code}`,
    });

    return { success: true, email: parsed.data.email };
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}
