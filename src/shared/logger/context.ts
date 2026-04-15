import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export type RequestContext = {
  requestId: string;
  userId?: string;
  traceId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: Partial<RequestContext>, fn: () => T): T {
  const full: RequestContext = { requestId: ctx.requestId ?? randomUUID(), ...ctx };
  return storage.run(full, fn);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
