import { NextResponse } from 'next/server';
import { env } from '@/shared/config/env';
import { queue } from '@/shared/queue/client';
import { logger } from '@/shared/logger';

function unauthorized() {
  return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });
}

export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${env().CRON_SECRET}`;
  if (!auth || auth !== expected) {
    return unauthorized();
  }

  const q = queue();
  await q.start();
  const id = await q.publish('noop', { ping: `heartbeat-${Date.now()}` });
  logger().info({ jobId: id }, 'cron.heartbeat.enqueued');
  return NextResponse.json({ ok: true, jobId: id });
}
