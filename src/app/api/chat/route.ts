import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { HelpChatService, PromptInjectionDetectedError } from '@/modules/help-chat';
import { checkRateLimit, buildRateLimitKey } from '@/shared/auth/rate-limit';
import { RateLimitError } from '@/shared/errors';
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
    // 20 messages / 15-minute window per user. Generous for genuine help-chat
    // use, restrictive enough to cap any abuse of the OpenAI bill.
    await checkRateLimit(buildRateLimitKey('ai-chat', 'user', user.id), { limit: 20 });

    const result = await HelpChatService.answer(user.id, parsed.data.question, parsed.data.history);
    return NextResponse.json({ content: result.content });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: (err as Error).message }, { status: 429 });
    }
    if (err instanceof PromptInjectionDetectedError) {
      // 403 because the request was understood but refused on policy grounds.
      // The body distinguishes warned vs blocked so the UI can adapt copy.
      return NextResponse.json(
        {
          error: (err as Error).message,
          blocked: err.blocked,
          strikes: err.strikes,
          threshold: err.threshold,
        },
        { status: 403 },
      );
    }
    logger().error({ err, userId: user.id }, 'help-chat.failed');
    const reason = (err as Error)?.message ?? '';
    let hint = 'No se pudo generar la respuesta.';
    if (reason.includes('OPENAI_API_KEY')) hint = 'Falta configurar OPENAI_API_KEY.';
    else if (reason.startsWith('OpenAI request failed')) hint = `OpenAI rechazó la petición: ${reason.replace('OpenAI request failed: ', '').slice(0, 120)}`;
    else if (reason.includes('OpenAI returned empty')) hint = 'OpenAI devolvió respuesta vacía.';
    else if (reason) hint = `Error interno: ${reason.slice(0, 120)}`;
    return NextResponse.json({ error: hint }, { status: 500 });
  }
}
