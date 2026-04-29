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
    return NextResponse.json(
      { error: 'No se pudo generar la respuesta. Inténtalo de nuevo en un minuto.' },
      { status: 500 },
    );
  }
}
