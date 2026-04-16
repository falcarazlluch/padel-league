import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export type RequestContext = Readonly<{
  requestId: string;
  userId?: string;
  traceId?: string;
}>;

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: Partial<RequestContext>, fn: () => T): T {
  // spread ctx first, then compute requestId — if ctx.requestId is explicitly undefined,
  // the generated UUID would otherwise be overwritten by a later spread.
  const full: RequestContext = Object.freeze({
    ...ctx,
    requestId: ctx.requestId ?? randomUUID(),
  });
  return storage.run(full, fn);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
