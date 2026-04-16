import { NextResponse } from 'next/server';
import { env } from '@/shared/config/env';
import { queue } from '@/shared/queue/client';
import { logger } from '@/shared/logger';

export async function POST(): Promise<Response> {
  if (env().NODE_ENV === 'production') {
    return NextResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
  }
  const q = queue();
  await q.start();
  const id = await q.publish('noop', { ping: `hello-${Date.now()}` });
  logger().info({ id }, 'dev.enqueue-noop');
  return NextResponse.json({ id });
}
