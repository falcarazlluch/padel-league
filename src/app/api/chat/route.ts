import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { HelpChatService } from '@/modules/help-chat';
import { logger } from '@/shared/logger';

const bodySchema = z.object({
  question: z.string().trim().min(1, 'La pregunta no puede estar vacía.').max(500, 'Pregunta demasiado larga.'),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(2000),
      }),
    )
    .max(20)
    .default([]),
});

export async function POST(request: Request): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await getValidatedSession(token).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' },
      { status: 400 },
    );
  }

  try {
    const result = await HelpChatService.answer(user.id, parsed.data.question, parsed.data.history);
    return NextResponse.json({ content: result.content });
  } catch (err) {
    logger().error({ err, userId: user.id }, 'help-chat.failed');
    // Surface a short, sanitized hint so the user can self-diagnose without
    // having to dig into Vercel function logs. The full error is in logs.
    const reason = (err as Error)?.message ?? '';
    let hint = 'No se pudo generar la respuesta.';
    if (reason.includes('OPENAI_API_KEY')) hint = 'Falta configurar OPENAI_API_KEY.';
    else if (reason.startsWith('OpenAI request failed')) hint = `OpenAI rechazó la petición: ${reason.replace('OpenAI request failed: ', '').slice(0, 120)}`;
    else if (reason.includes('OpenAI returned empty')) hint = 'OpenAI devolvió respuesta vacía.';
    else if (reason) hint = `Error interno: ${reason.slice(0, 120)}`;
    return NextResponse.json({ error: hint }, { status: 500 });
  }
}
