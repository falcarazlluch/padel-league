'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { queue } from '@/shared/queue/client';
import { drainPendingJobs } from '@/worker/drainer';

async function requireSuperAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token);
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard' as Route);
  return user;
}

export async function drainNowAction(): Promise<void> {
  await requireSuperAdmin();
  const q = queue();
  await q.start();
  await drainPendingJobs(q.raw(), { deadlineMs: 50_000 });
  revalidatePath('/admin/cola');
}
