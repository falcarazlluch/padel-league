# Spec 4 — Notificaciones + Jobs + Admin Disputas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the event-driven backbone: in-app notification polling, email alerts on key match events, worker handlers for auto-approving results and finalizing leagues, and an admin panel for resolving disputed matches.

**Architecture:** Notifications are created as side effects in server actions after MatchService calls (boundaries-clean: app layer calls both MatchService and NotificationService via their public barrels). Worker handlers (`match-auto-approve-result`, `league-finalize`) live in `src/worker/handlers/` and are registered in `src/worker/index.ts`. The admin disputes panel lives at `/admin/disputas` and uses a new `resolveDispute` method in `MatchService`.

**Tech Stack:** Next.js 15 App Router, Prisma 5, pg-boss v12, React 19 (`useEffect` polling), Tailwind CSS v4, pino logger, Resend (email via existing `send-email` worker job).

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/modules/notifications/application/notification-service.ts` | Create | CRUD service for Notification model |
| `src/modules/notifications/index.ts` | Create | Public barrel for notifications module |
| `src/app/api/notifications/unread/route.ts` | Create | GET unread count + list |
| `src/app/api/notifications/[id]/read/route.ts` | Create | POST mark single notification as read |
| `src/app/(app)/notifications-badge.tsx` | Create | Client component — polls every 30s, shows badge |
| `src/app/(app)/layout.tsx` | Modify | Add NotificationsBadge + currentUser.role for admin link |
| `src/worker/email-templates/result-submitted.tsx` | Create | Email template — result submitted |
| `src/worker/email-templates/result-confirmed.tsx` | Create | Email template — result confirmed |
| `src/worker/handlers/send-email.ts` | Modify | Register 2 new templates |
| `src/app/(app)/ligas/[slug]/partidos/actions.ts` | Modify | Create notifications + enqueue emails after match events |
| `src/modules/leagues/application/match-service.ts` | Modify | Enqueue `match-auto-approve-result` on submitResult; add `resolveDispute` |
| `src/modules/leagues/index.ts` | Modify | Export `resolveDispute` types |
| `src/worker/handlers/match-auto-approve-result.ts` | Create | Auto-approve pending result after 7 days |
| `src/worker/handlers/league-finalize.ts` | Create | Expire unplayed matches when league ends |
| `src/worker/index.ts` | Modify | Register 2 new handlers |
| `src/app/api/cron/heartbeat/route.ts` | Modify | Enqueue `league-finalize` for ended leagues |
| `src/app/(app)/ligas/[slug]/page.tsx` | Modify | Include ADMIN_RESOLVED matches in standings |
| `src/app/(app)/admin/disputas/page.tsx` | Create | List open disputes |
| `src/app/(app)/admin/disputas/actions.ts` | Create | resolveDisputeAction server action |
| `eslint.config.mjs` | Modify | Add `tests/unit/modules/notifications/*.ts` to allowDefaultProject |

---

## Task 1: Notifications service module

**Files:**
- Create: `src/modules/notifications/application/notification-service.ts`
- Create: `src/modules/notifications/index.ts`

- [ ] **Step 1: Write the failing typecheck**

Run: `pnpm typecheck`
Expected: passes (baseline before changes)

- [ ] **Step 2: Create notification service**

Create `src/modules/notifications/application/notification-service.ts`:

```typescript
import { prisma } from '@/shared/db/client';
import type { NotificationType } from '@prisma/client';

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

export const NotificationService = {
  async create(input: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        metadata: input.metadata ?? null,
      },
    });
  },

  async createMany(inputs: Array<{
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  }>): Promise<void> {
    if (inputs.length === 0) return;
    await prisma.notification.createMany({
      data: inputs.map((n) => ({
        userId: n.userId,
        type: n.type,
        title: n.title,
        body: n.body,
        metadata: n.metadata ?? null,
      })),
    });
  },

  async getUnread(userId: string): Promise<{ count: number; items: NotificationItem[] }> {
    const [items, count] = await prisma.$transaction([
      prisma.notification.findMany({
        where: { userId, readAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, type: true, title: true, body: true, metadata: true, createdAt: true },
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      count,
      items: items.map((n) => ({
        ...n,
        metadata: n.metadata as Record<string, unknown> | null,
      })),
    };
  },

  async markRead(notificationId: string, userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
  },

  async markAllRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  },
} as const;
```

- [ ] **Step 3: Create public barrel**

Create `src/modules/notifications/index.ts`:

```typescript
export { NotificationService } from './application/notification-service';
export type { NotificationItem } from './application/notification-service';
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors)

- [ ] **Step 5: Commit**

```bash
git add src/modules/notifications/
git commit -m "feat(notifications): add NotificationService module"
```

---

## Task 2: Notifications API routes

**Files:**
- Create: `src/app/api/notifications/unread/route.ts`
- Create: `src/app/api/notifications/[id]/read/route.ts`

- [ ] **Step 1: Create GET /api/notifications/unread**

Create `src/app/api/notifications/unread/route.ts`:

```typescript
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { NotificationService } from '@/modules/notifications';

export async function GET(): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });

  try {
    const user = await getValidatedSession(token);
    const result = await NotificationService.getUnread(user.id);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });
  }
}
```

- [ ] **Step 2: Create POST /api/notifications/[id]/read**

Create `src/app/api/notifications/[id]/read/route.ts`:

```typescript
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { NotificationService } from '@/modules/notifications';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });

  try {
    const user = await getValidatedSession(token);
    const { id } = await params;
    await NotificationService.markRead(id, user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });
  }
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Manual smoke test**

Start dev server (`pnpm dev`), then in browser DevTools console:
```js
const r = await fetch('/api/notifications/unread'); console.log(await r.json());
```
Expected: `{ count: 0, items: [] }` (no notifications yet)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/notifications/
git commit -m "feat(notifications): add unread and mark-read API routes"
```

---

## Task 3: Notifications badge in app layout

**Files:**
- Create: `src/app/(app)/notifications-badge.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Create NotificationsBadge client component**

Create `src/app/(app)/notifications-badge.tsx`:

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';

type UnreadItem = { id: string; type: string; title: string; body: string; createdAt: string };
type UnreadData = { count: number; items: UnreadItem[] };

export function NotificationsBadge() {
  const [data, setData] = useState<UnreadData | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchUnread = () => {
    fetch('/api/notifications/unread')
      .then((r) => (r.ok ? (r.json() as Promise<UnreadData>) : Promise.reject()))
      .then(setData)
      .catch(() => undefined);
  };

  useEffect(() => {
    fetchUnread();
    const id = setInterval(fetchUnread, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const count = data?.count ?? 0;

  function handleMarkRead(id: string) {
    void fetch(`/api/notifications/${id}/read`, { method: 'POST' }).then(() => {
      setData((prev) =>
        prev
          ? {
              count: Math.max(0, prev.count - 1),
              items: prev.items.filter((n) => n.id !== id),
            }
          : prev,
      );
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative text-sm text-gray-600 hover:text-gray-900 transition-colors px-1"
        aria-label={`Notificaciones${count > 0 ? ` (${count} sin leer)` : ''}`}
      >
        Notificaciones
        {count > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full font-bold px-0.5">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">
              Notificaciones{count > 0 ? ` (${count})` : ''}
            </span>
          </div>
          {data?.items.length === 0 || !data ? (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">Sin notificaciones nuevas</p>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {data.items.map((n) => (
                <li key={n.id} className="px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                    </div>
                    <button
                      onClick={() => handleMarkRead(n.id)}
                      className="text-xs text-blue-500 hover:text-blue-700 shrink-0 mt-0.5"
                    >
                      ✓
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update app layout to add badge and admin link**

The current layout imports `getValidatedSession` but doesn't pass the user to the template. We need the user to conditionally show the admin link. Replace the entire `src/app/(app)/layout.tsx`:

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { NotificationsBadge } from './notifications-badge';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login');

  let currentUser;
  try {
    currentUser = await getValidatedSession(token);
  } catch {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-bold text-gray-900 text-lg">
            PadelLeague
          </Link>
          <Link href={'/ligas' as Route} className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Ligas
          </Link>
          {currentUser.role === 'SUPER_ADMIN' && (
            <Link href={'/admin/disputas' as Route} className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
              Disputas
            </Link>
          )}
        </div>
        <div className="flex items-center gap-4">
          <NotificationsBadge />
          <Link href="/perfil" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Mi perfil
          </Link>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Visual smoke test**

Start `pnpm dev`, navigate to any authenticated page. Verify the "Notificaciones" button appears in the nav. Click it — should show "Sin notificaciones nuevas" dropdown.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/notifications-badge.tsx src/app/\(app\)/layout.tsx
git commit -m "feat(notifications): add polling badge to app nav"
```

---

## Task 4: Email templates for match events + register in send-email handler

**Files:**
- Create: `src/worker/email-templates/result-submitted.tsx`
- Create: `src/worker/email-templates/result-confirmed.tsx`
- Modify: `src/worker/handlers/send-email.ts`

- [ ] **Step 1: Create result-submitted email template**

Create `src/worker/email-templates/result-submitted.tsx`:

```tsx
import * as React from 'react';

export const resultSubmittedSubject = 'Resultado de partido enviado — pendiente de confirmación';

export function ResultSubmittedEmail({
  matchTeamA,
  matchTeamB,
  submitterTeam,
  matchUrl,
}: {
  matchTeamA: string;
  matchTeamB: string;
  submitterTeam: string;
  matchUrl: string;
}) {
  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 480, margin: '0 auto', padding: 24, color: '#111' }}>
      <h2 style={{ marginBottom: 8 }}>Resultado enviado</h2>
      <p style={{ color: '#444', marginBottom: 16 }}>
        El equipo <strong>{submitterTeam}</strong> ha enviado el resultado del partido{' '}
        <strong>
          {matchTeamA} vs {matchTeamB}
        </strong>
        .
      </p>
      <p style={{ color: '#444', marginBottom: 24 }}>
        Tienes <strong>7 días</strong> para confirmar o disputar el resultado. Si no actúas, se confirmará automáticamente.
      </p>
      <a
        href={matchUrl}
        style={{
          display: 'inline-block',
          backgroundColor: '#2563eb',
          color: '#fff',
          padding: '10px 20px',
          borderRadius: 8,
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        Ver resultado
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Create result-confirmed email template**

Create `src/worker/email-templates/result-confirmed.tsx`:

```tsx
import * as React from 'react';

export const resultConfirmedSubject = 'Resultado de partido confirmado';

export function ResultConfirmedEmail({
  matchTeamA,
  matchTeamB,
  winnerTeamName,
  matchUrl,
}: {
  matchTeamA: string;
  matchTeamB: string;
  winnerTeamName: string | null;
  matchUrl: string;
}) {
  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 480, margin: '0 auto', padding: 24, color: '#111' }}>
      <h2 style={{ marginBottom: 8 }}>Resultado confirmado</h2>
      <p style={{ color: '#444', marginBottom: 16 }}>
        El resultado del partido{' '}
        <strong>
          {matchTeamA} vs {matchTeamB}
        </strong>{' '}
        ha sido confirmado.
      </p>
      {winnerTeamName ? (
        <p style={{ color: '#444', marginBottom: 24 }}>
          Ganador: <strong>{winnerTeamName}</strong>
        </p>
      ) : (
        <p style={{ color: '#444', marginBottom: 24 }}>El partido terminó en <strong>empate</strong>.</p>
      )}
      <a
        href={matchUrl}
        style={{
          display: 'inline-block',
          backgroundColor: '#16a34a',
          color: '#fff',
          padding: '10px 20px',
          borderRadius: 8,
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        Ver partido
      </a>
    </div>
  );
}
```

- [ ] **Step 3: Register new templates in send-email handler**

The current `src/worker/handlers/send-email.ts` has a `switch` over `template` in `renderTemplate`. Add the two new cases. Replace the full `renderTemplate` function (lines 17–42) with:

```typescript
function renderTemplate(template: string, data: EmailData): { subject: string; html: string } {
  switch (template) {
    case 'invitation':
      return {
        subject: invitationSubject,
        html: renderToStaticMarkup(
          React.createElement(InvitationEmail, {
            name: str(data['name'], 'Jugador'),
            inviteUrl: str(data['inviteUrl'], ''),
          }),
        ),
      };
    case 'password-reset':
      return {
        subject: passwordResetSubject,
        html: renderToStaticMarkup(
          React.createElement(PasswordResetEmail, {
            name: str(data['name'], 'Jugador'),
            resetUrl: str(data['resetUrl'], ''),
          }),
        ),
      };
    case 'result-submitted':
      return {
        subject: resultSubmittedSubject,
        html: renderToStaticMarkup(
          React.createElement(ResultSubmittedEmail, {
            matchTeamA: str(data['matchTeamA'], '?'),
            matchTeamB: str(data['matchTeamB'], '?'),
            submitterTeam: str(data['submitterTeam'], '?'),
            matchUrl: str(data['matchUrl'], ''),
          }),
        ),
      };
    case 'result-confirmed':
      return {
        subject: resultConfirmedSubject,
        html: renderToStaticMarkup(
          React.createElement(ResultConfirmedEmail, {
            matchTeamA: str(data['matchTeamA'], '?'),
            matchTeamB: str(data['matchTeamB'], '?'),
            winnerTeamName: typeof data['winnerTeamName'] === 'string' ? data['winnerTeamName'] : null,
            matchUrl: str(data['matchUrl'], ''),
          }),
        ),
      };
    default:
      throw new Error(`Unknown email template: ${template}`);
  }
}
```

Also add the two new imports at the top of `src/worker/handlers/send-email.ts`, after the existing imports:

```typescript
import { ResultSubmittedEmail, resultSubmittedSubject } from '../email-templates/result-submitted';
import { ResultConfirmedEmail, resultConfirmedSubject } from '../email-templates/result-confirmed';
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/worker/email-templates/result-submitted.tsx src/worker/email-templates/result-confirmed.tsx src/worker/handlers/send-email.ts
git commit -m "feat(email): add result-submitted and result-confirmed email templates"
```

---

## Task 5: Server actions — create notifications + enqueue emails after match events

**Files:**
- Modify: `src/app/(app)/ligas/[slug]/partidos/actions.ts`

**Context:** The server action file currently imports `MatchService`, `SESSION_COOKIE`, `getValidatedSession`, `z`, `cookies`, `redirect`, `isUserFacingError`. We add imports for `NotificationService`, `queue()`, `env()`, and `prisma`.

After `MatchService.submitResult` succeeds:
1. Query the rival team's members (with emails) via Prisma
2. Create in-app notifications for each rival member (type `RESULT_SUBMITTED`)
3. Enqueue `send-email` jobs for each rival member

After `MatchService.confirmResult` succeeds:
1. Query the submitter's team members (with emails) via Prisma — we need the match + pending result info
2. Create in-app notifications for the submitter's team
3. Enqueue `send-email` jobs for the submitter's team

After `MatchService.disputeResult` succeeds:
1. Create in-app notification for the submitter's team members (type `RESULT_REJECTED`)
2. No email for dispute for now (email can be added in a future iteration)

We need `APP_URL` from env to build the match URL. The `env()` function returns all config.

- [ ] **Step 1: Rewrite actions.ts with notifications and email enqueuing**

Replace the entire content of `src/app/(app)/ligas/[slug]/partidos/actions.ts`:

```typescript
'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { MatchService } from '@/modules/leagues';
import { NotificationService } from '@/modules/notifications';
import { isUserFacingError } from '@/shared/errors';
import { queue } from '@/shared/queue/client';
import { env } from '@/shared/config/env';
import { prisma } from '@/shared/db/client';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

type MatchMember = { userId: string; user: { email: string; name: string } };
type MatchTeamInfo = {
  teamA: { id: string; name: string; members: MatchMember[] };
  teamB: { id: string; name: string; members: MatchMember[] };
  leagueSlug: string;
  winnerTeam: { name: string } | null;
};

async function fetchMatchTeamInfo(matchId: string): Promise<MatchTeamInfo | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      league: { select: { slug: true } },
      teamA: { include: { members: { include: { user: { select: { userId: true, email: true, name: true } } } } } },
      teamB: { include: { members: { include: { user: { select: { userId: true, email: true, name: true } } } } } },
    },
  });
  if (!match) return null;

  const winnerTeamId = match.winnerTeamId;
  const winnerTeam = winnerTeamId
    ? winnerTeamId === match.teamAId
      ? { name: match.teamA.name }
      : { name: match.teamB.name }
    : null;

  return {
    teamA: {
      id: match.teamA.id,
      name: match.teamA.name,
      members: match.teamA.members.map((m) => ({
        userId: m.userId,
        user: { email: m.user.email, name: m.user.name },
      })),
    },
    teamB: {
      id: match.teamB.id,
      name: match.teamB.name,
      members: match.teamB.members.map((m) => ({
        userId: m.userId,
        user: { email: m.user.email, name: m.user.name },
      })),
    },
    leagueSlug: match.league.slug,
    winnerTeam,
  };
}

const submitResultSchema = z.object({
  matchId: z.string().cuid(),
  setsCount: z.coerce.number().int().min(2).max(5),
});

export async function submitResultAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSession();

  const base = submitResultSchema.safeParse(Object.fromEntries(formData));
  if (!base.success) return { error: base.error.issues[0]?.message ?? 'Datos inválidos.' };

  const { matchId, setsCount } = base.data;
  const rawSets: Array<{ gamesA: number; gamesB: number }> = [];
  for (let i = 0; i < setsCount; i++) {
    const rawA = formData.get(`gamesA_${i}`);
    const rawB = formData.get(`gamesB_${i}`);
    if (rawA === null || rawB === null)
      return { error: 'Los marcadores de los sets son inválidos.' };
    rawSets.push({ gamesA: Number(rawA), gamesB: Number(rawB) });
  }
  if (rawSets.some((s) => !Number.isInteger(s.gamesA) || s.gamesA < 0 || !Number.isInteger(s.gamesB) || s.gamesB < 0))
    return { error: 'Los marcadores de los sets son inválidos.' };

  try {
    await MatchService.submitResult(matchId, user.id, { sets: rawSets });
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }

  // Side effects (non-blocking — errors are swallowed to not fail the action)
  try {
    const info = await fetchMatchTeamInfo(matchId);
    if (info) {
      const submitterIsA = info.teamA.members.some((m) => m.userId === user.id);
      const rivalTeam = submitterIsA ? info.teamB : info.teamA;
      const submitterTeamName = submitterIsA ? info.teamA.name : info.teamB.name;
      const matchUrl = `${env().APP_URL}/ligas/${info.leagueSlug}/partidos/${matchId}`;

      await NotificationService.createMany(
        rivalTeam.members.map((m) => ({
          userId: m.userId,
          type: 'RESULT_SUBMITTED' as const,
          title: 'Resultado enviado — pendiente de confirmación',
          body: `${submitterTeamName} ha enviado el resultado del partido. Tienes 7 días para confirmar o disputar.`,
          metadata: { matchId },
        })),
      );

      const q = queue();
      await q.start();
      for (const member of rivalTeam.members) {
        await q.publish('send-email', {
          template: 'result-submitted',
          to: member.user.email,
          data: {
            matchTeamA: info.teamA.name,
            matchTeamB: info.teamB.name,
            submitterTeam: submitterTeamName,
            matchUrl,
          },
          dedupKey: `result-submitted-${matchId}-${member.userId}`,
        });
      }
    }
  } catch {
    // notifications/email failure must not fail the action
  }

  return {};
}

export async function confirmResultAction(matchId: string): Promise<{ error?: string }> {
  const user = await getSession();
  try {
    await MatchService.confirmResult(matchId, user.id);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }

  // Side effects
  try {
    const info = await fetchMatchTeamInfo(matchId);
    if (info) {
      const confirmerIsA = info.teamA.members.some((m) => m.userId === user.id);
      const submitterTeam = confirmerIsA ? info.teamB : info.teamA;
      const matchUrl = `${env().APP_URL}/ligas/${info.leagueSlug}/partidos/${matchId}`;

      await NotificationService.createMany(
        submitterTeam.members.map((m) => ({
          userId: m.userId,
          type: 'RESULT_CONFIRMED' as const,
          title: 'Resultado confirmado',
          body: `El resultado del partido ha sido confirmado. ${info.winnerTeam ? `Ganador: ${info.winnerTeam.name}.` : 'Partido empatado.'}`,
          metadata: { matchId },
        })),
      );

      const q = queue();
      await q.start();
      for (const member of submitterTeam.members) {
        await q.publish('send-email', {
          template: 'result-confirmed',
          to: member.user.email,
          data: {
            matchTeamA: info.teamA.name,
            matchTeamB: info.teamB.name,
            winnerTeamName: info.winnerTeam?.name ?? null,
            matchUrl,
          },
          dedupKey: `result-confirmed-${matchId}-${member.userId}`,
        });
      }
    }
  } catch {
    // notifications/email failure must not fail the action
  }

  return {};
}

const disputeSchema = z.object({
  matchId: z.string().cuid(),
  reason: z.string().min(10, 'El motivo debe tener al menos 10 caracteres.').max(1000),
});

export async function disputeResultAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSession();
  const parsed = disputeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await MatchService.disputeResult(parsed.data.matchId, user.id, parsed.data.reason);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }

  // Side effects
  try {
    const info = await fetchMatchTeamInfo(parsed.data.matchId);
    if (info) {
      const disputerIsA = info.teamA.members.some((m) => m.userId === user.id);
      const submitterTeam = disputerIsA ? info.teamB : info.teamA;
      await NotificationService.createMany(
        submitterTeam.members.map((m) => ({
          userId: m.userId,
          type: 'RESULT_REJECTED' as const,
          title: 'Resultado disputado',
          body: 'El equipo rival ha disputado el resultado que enviaste. Un administrador revisará el caso.',
          metadata: { matchId: parsed.data.matchId },
        })),
      );
    }
  } catch {
    // notifications/email failure must not fail the action
  }

  return {};
}
```

**Note on Prisma include shape:** The `fetchMatchTeamInfo` function uses `include: { user: { select: { userId: true, email: true, name: true } } }` inside the team members include. However, `TeamMember` model has `userId` as a field directly (not via user). Fix: `members` include should be:

```typescript
members: {
  include: {
    user: { select: { email: true, name: true } },
  },
},
```

And the mapping:
```typescript
members: match.teamA.members.map((m) => ({
  userId: m.userId,
  user: { email: m.user.email, name: m.user.name },
})),
```

The corrected `fetchMatchTeamInfo` function is:

```typescript
async function fetchMatchTeamInfo(matchId: string): Promise<MatchTeamInfo | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      league: { select: { slug: true } },
      teamA: {
        include: {
          members: { include: { user: { select: { email: true, name: true } } } },
        },
      },
      teamB: {
        include: {
          members: { include: { user: { select: { email: true, name: true } } } },
        },
      },
    },
  });
  if (!match) return null;

  const winnerTeamId = match.winnerTeamId;
  const winnerTeam = winnerTeamId
    ? winnerTeamId === match.teamAId
      ? { name: match.teamA.name }
      : { name: match.teamB.name }
    : null;

  return {
    teamA: {
      id: match.teamA.id,
      name: match.teamA.name,
      members: match.teamA.members.map((m) => ({
        userId: m.userId,
        user: { email: m.user.email, name: m.user.name },
      })),
    },
    teamB: {
      id: match.teamB.id,
      name: match.teamB.name,
      members: match.teamB.members.map((m) => ({
        userId: m.userId,
        user: { email: m.user.email, name: m.user.name },
      })),
    },
    leagueSlug: match.league.slug,
    winnerTeam,
  };
}
```

Use this corrected version (not the first draft shown above). The `MatchMember` type should also be corrected to remove the `userId` from the nested `user` select.

The **final full content** of `src/app/(app)/ligas/[slug]/partidos/actions.ts` is below — use this exact version:

```typescript
'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { MatchService } from '@/modules/leagues';
import { NotificationService } from '@/modules/notifications';
import { isUserFacingError } from '@/shared/errors';
import { queue } from '@/shared/queue/client';
import { env } from '@/shared/config/env';
import { prisma } from '@/shared/db/client';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  return getValidatedSession(token);
}

type MatchMember = { userId: string; user: { email: string; name: string } };
type MatchTeamInfo = {
  teamA: { id: string; name: string; members: MatchMember[] };
  teamB: { id: string; name: string; members: MatchMember[] };
  leagueSlug: string;
  winnerTeam: { name: string } | null;
};

async function fetchMatchTeamInfo(matchId: string): Promise<MatchTeamInfo | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      league: { select: { slug: true } },
      teamA: { include: { members: { include: { user: { select: { email: true, name: true } } } } } },
      teamB: { include: { members: { include: { user: { select: { email: true, name: true } } } } } },
    },
  });
  if (!match) return null;

  const winnerTeamId = match.winnerTeamId;
  const winnerTeam = winnerTeamId
    ? winnerTeamId === match.teamAId
      ? { name: match.teamA.name }
      : { name: match.teamB.name }
    : null;

  return {
    teamA: {
      id: match.teamA.id,
      name: match.teamA.name,
      members: match.teamA.members.map((m) => ({ userId: m.userId, user: { email: m.user.email, name: m.user.name } })),
    },
    teamB: {
      id: match.teamB.id,
      name: match.teamB.name,
      members: match.teamB.members.map((m) => ({ userId: m.userId, user: { email: m.user.email, name: m.user.name } })),
    },
    leagueSlug: match.league.slug,
    winnerTeam,
  };
}

const submitResultSchema = z.object({
  matchId: z.string().cuid(),
  setsCount: z.coerce.number().int().min(2).max(5),
});

export async function submitResultAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSession();

  const base = submitResultSchema.safeParse(Object.fromEntries(formData));
  if (!base.success) return { error: base.error.issues[0]?.message ?? 'Datos inválidos.' };

  const { matchId, setsCount } = base.data;
  const rawSets: Array<{ gamesA: number; gamesB: number }> = [];
  for (let i = 0; i < setsCount; i++) {
    const rawA = formData.get(`gamesA_${i}`);
    const rawB = formData.get(`gamesB_${i}`);
    if (rawA === null || rawB === null)
      return { error: 'Los marcadores de los sets son inválidos.' };
    rawSets.push({ gamesA: Number(rawA), gamesB: Number(rawB) });
  }
  if (rawSets.some((s) => !Number.isInteger(s.gamesA) || s.gamesA < 0 || !Number.isInteger(s.gamesB) || s.gamesB < 0))
    return { error: 'Los marcadores de los sets son inválidos.' };

  try {
    await MatchService.submitResult(matchId, user.id, { sets: rawSets });
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }

  try {
    const info = await fetchMatchTeamInfo(matchId);
    if (info) {
      const submitterIsA = info.teamA.members.some((m) => m.userId === user.id);
      const rivalTeam = submitterIsA ? info.teamB : info.teamA;
      const submitterTeamName = submitterIsA ? info.teamA.name : info.teamB.name;
      const matchUrl = `${env().APP_URL}/ligas/${info.leagueSlug}/partidos/${matchId}`;

      await NotificationService.createMany(
        rivalTeam.members.map((m) => ({
          userId: m.userId,
          type: 'RESULT_SUBMITTED' as const,
          title: 'Resultado enviado — pendiente de confirmación',
          body: `${submitterTeamName} ha enviado el resultado. Tienes 7 días para confirmar o disputar.`,
          metadata: { matchId },
        })),
      );

      const q = queue();
      await q.start();
      for (const member of rivalTeam.members) {
        await q.publish('send-email', {
          template: 'result-submitted',
          to: member.user.email,
          data: {
            matchTeamA: info.teamA.name,
            matchTeamB: info.teamB.name,
            submitterTeam: submitterTeamName,
            matchUrl,
          },
          dedupKey: `result-submitted-${matchId}-${member.userId}`,
        });
      }
    }
  } catch {
    // notification/email side effects must not fail the main action
  }

  return {};
}

export async function confirmResultAction(matchId: string): Promise<{ error?: string }> {
  const user = await getSession();
  try {
    await MatchService.confirmResult(matchId, user.id);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }

  try {
    const info = await fetchMatchTeamInfo(matchId);
    if (info) {
      const confirmerIsA = info.teamA.members.some((m) => m.userId === user.id);
      const submitterTeam = confirmerIsA ? info.teamB : info.teamA;
      const matchUrl = `${env().APP_URL}/ligas/${info.leagueSlug}/partidos/${matchId}`;

      await NotificationService.createMany(
        submitterTeam.members.map((m) => ({
          userId: m.userId,
          type: 'RESULT_CONFIRMED' as const,
          title: 'Resultado confirmado',
          body: `El resultado del partido ha sido confirmado. ${info.winnerTeam ? `Ganador: ${info.winnerTeam.name}.` : 'Partido empatado.'}`,
          metadata: { matchId },
        })),
      );

      const q = queue();
      await q.start();
      for (const member of submitterTeam.members) {
        await q.publish('send-email', {
          template: 'result-confirmed',
          to: member.user.email,
          data: {
            matchTeamA: info.teamA.name,
            matchTeamB: info.teamB.name,
            winnerTeamName: info.winnerTeam?.name ?? null,
            matchUrl,
          },
          dedupKey: `result-confirmed-${matchId}-${member.userId}`,
        });
      }
    }
  } catch {
    // notification/email side effects must not fail the main action
  }

  return {};
}

const disputeSchema = z.object({
  matchId: z.string().cuid(),
  reason: z.string().min(10, 'El motivo debe tener al menos 10 caracteres.').max(1000),
});

export async function disputeResultAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getSession();
  const parsed = disputeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  try {
    await MatchService.disputeResult(parsed.data.matchId, user.id, parsed.data.reason);
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }

  try {
    const info = await fetchMatchTeamInfo(parsed.data.matchId);
    if (info) {
      const disputerIsA = info.teamA.members.some((m) => m.userId === user.id);
      const submitterTeam = disputerIsA ? info.teamB : info.teamA;
      await NotificationService.createMany(
        submitterTeam.members.map((m) => ({
          userId: m.userId,
          type: 'RESULT_REJECTED' as const,
          title: 'Resultado disputado',
          body: 'El equipo rival ha disputado el resultado que enviaste. Un administrador revisará el caso.',
          metadata: { matchId: parsed.data.matchId },
        })),
      );
    }
  } catch {
    // notification side effects must not fail the main action
  }

  return {};
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Run unit tests**

Run: `pnpm test:unit`
Expected: All 58 existing tests still pass (no regressions)

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/ligas/\[slug\]/partidos/actions.ts
git commit -m "feat(notifications): send notifications and emails on match events"
```

---

## Task 6: match-auto-approve-result worker handler + enqueue from submitResult

**Files:**
- Create: `src/worker/handlers/match-auto-approve-result.ts`
- Modify: `src/modules/leagues/application/match-service.ts`
- Modify: `src/worker/index.ts`

- [ ] **Step 1: Create match-auto-approve-result handler**

Create `src/worker/handlers/match-auto-approve-result.ts`:

```typescript
import { prisma } from '@/shared/db/client';
import { logger } from '@/shared/logger';
import { queue } from '@/shared/queue/client';
import { env } from '@/shared/config/env';
import { NotificationService } from '@/modules/notifications';
import type { JobMap } from '@/shared/queue/jobs';

export async function matchAutoApproveResultHandler(
  data: JobMap['match-auto-approve-result'],
): Promise<void> {
  const { matchResultId } = data;
  const log = logger();

  const matchResult = await prisma.matchResult.findUnique({
    where: { id: matchResultId },
    include: {
      match: {
        include: {
          league: { select: { slug: true } },
          teamA: { include: { members: { include: { user: { select: { email: true, name: true } } } } } },
          teamB: { include: { members: { include: { user: { select: { email: true, name: true } } } } } },
        },
      },
    },
  });

  if (!matchResult || matchResult.status !== 'PENDING') {
    log.info({ matchResultId }, 'auto-approve.skip');
    return;
  }

  let confirmed = false;
  await prisma.$transaction(async (tx) => {
    const updated = await tx.matchResult.updateMany({
      where: { id: matchResultId, status: 'PENDING' },
      data: { status: 'CONFIRMED', autoApprovedAt: new Date() },
    });
    if (updated.count === 0) return;

    await tx.match.update({
      where: { id: matchResult.matchId },
      data: {
        status: 'CONFIRMED',
        confirmedResultId: matchResultId,
        winnerTeamId: matchResult.winnerTeamId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: null,
        action: 'match.result.auto_approved',
        targetType: 'Match',
        targetId: matchResult.matchId,
        metadata: { matchResultId, winnerTeamId: matchResult.winnerTeamId },
      },
    });

    confirmed = true;
  });

  if (!confirmed) {
    log.info({ matchResultId }, 'auto-approve.already-processed');
    return;
  }

  const match = matchResult.match;
  const allMembers = [
    ...match.teamA.members.map((m) => ({ userId: m.userId, email: m.user.email })),
    ...match.teamB.members.map((m) => ({ userId: m.userId, email: m.user.email })),
  ];

  const winnerTeamId = matchResult.winnerTeamId;
  const winnerTeamName = winnerTeamId
    ? winnerTeamId === match.teamAId
      ? match.teamA.name
      : match.teamB.name
    : null;

  await NotificationService.createMany(
    allMembers.map(({ userId }) => ({
      userId,
      type: 'RESULT_CONFIRMED' as const,
      title: 'Resultado confirmado automáticamente',
      body: `El resultado del partido ha sido confirmado automáticamente por el sistema. ${winnerTeamName ? `Ganador: ${winnerTeamName}.` : 'Partido empatado.'}`,
      metadata: { matchId: match.id, autoApproved: true },
    })),
  );

  const matchUrl = `${env().APP_URL}/ligas/${match.league.slug}/partidos/${match.id}`;
  const q = queue();
  for (const member of allMembers) {
    await q.publish('send-email', {
      template: 'result-confirmed',
      to: member.email,
      data: {
        matchTeamA: match.teamA.name,
        matchTeamB: match.teamB.name,
        winnerTeamName,
        matchUrl,
      },
      dedupKey: `auto-approved-${matchResult.matchId}-${member.userId}`,
    });
  }

  log.info({ matchResultId, matchId: match.id }, 'auto-approve.done');
}
```

- [ ] **Step 2: Enqueue auto-approve job from submitResult in match-service.ts**

In `src/modules/leagues/application/match-service.ts`, add queue import at the top:

```typescript
import { queue } from '@/shared/queue/client';
```

Then, after the `prisma.$transaction(...)` block in `submitResult` (around line 145, right before the closing `},` of `submitResult`), the transaction creates a new `MatchResult`. We need to capture its ID to enqueue the job. 

Modify the `submitResult` method. The transaction currently creates the result via `tx.matchResult.create(...)` without capturing the returned object. We need to capture it:

Replace the current `submitResult` method body's transaction block and following code. The **full updated `submitResult` method** is:

```typescript
async submitResult(
  matchId: string,
  submittingUserId: string,
  input: SubmitResultInput,
): Promise<void> {
  if (input.sets.length < 2)
    throw new DomainError('INVALID_SETS', 'Debe registrar al menos 2 sets.');
  if (input.sets.length > 5)
    throw new DomainError('INVALID_SETS', 'No puede registrar más de 5 sets.');

  if (input.sets.some((s) => !Number.isInteger(s.gamesA) || s.gamesA < 0 || !Number.isInteger(s.gamesB) || s.gamesB < 0))
    throw new DomainError('INVALID_SETS', 'Los juegos deben ser enteros no negativos.');

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      teamA: { include: { members: true } },
      teamB: { include: { members: true } },
    },
  });
  if (!match) throw new NotFoundError('MATCH_NOT_FOUND', 'Partido no encontrado.');
  if (!SUBMITTABLE_STATUSES.includes(match.status as SubmittableStatus)) {
    throw new DomainError(
      'MATCH_NOT_SUBMITTABLE',
      'Este partido no admite resultados en su estado actual.',
    );
  }

  const side = getSubmitterSide(
    submittingUserId,
    match.teamA.members.map((m) => m.userId),
    match.teamB.members.map((m) => m.userId),
  );
  if (!side)
    throw new AuthorizationError(
      'NOT_TEAM_MEMBER',
      'Solo los jugadores de este partido pueden enviar resultados.',
    );

  const winnerTeamId = determineWinner(match.teamAId, match.teamBId, input.sets);

  const newResult = await prisma.$transaction(async (tx) => {
    await tx.matchResult.updateMany({
      where: { matchId, status: 'PENDING' },
      data: { status: 'SUPERSEDED' },
    });

    const created = await tx.matchResult.create({
      data: {
        matchId,
        submittedByUserId: submittingUserId,
        winnerTeamId,
        sets: {
          create: input.sets.map((s, i) => ({
            setNumber: i + 1,
            gamesA: s.gamesA,
            gamesB: s.gamesB,
          })),
        },
      },
    });

    await tx.match.update({
      where: { id: matchId },
      data: { status: 'PENDING_VALIDATION' },
    });

    return created;
  });

  // Enqueue auto-approve job: fires in 7 days if rival doesn't confirm
  const startAfter = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const q = queue();
  await q.start();
  await q.publish(
    'match-auto-approve-result',
    { matchResultId: newResult.id },
    { startAfter, singletonKey: `auto-approve-${newResult.id}` },
  );
},
```

- [ ] **Step 3: Register handler in worker/index.ts**

Add import and registration to `src/worker/index.ts`:

Add import after line 7 (after `anonymizeUserHandler` import):
```typescript
import { matchAutoApproveResultHandler } from './handlers/match-auto-approve-result';
```

Add registration after line 23 (`await registerHandler(boss, 'anonymize-user', anonymizeUserHandler);`):
```typescript
await registerHandler(boss, 'match-auto-approve-result', matchAutoApproveResultHandler);
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Run unit tests**

Run: `pnpm test:unit`
Expected: All existing tests pass

- [ ] **Step 6: Commit**

```bash
git add src/worker/handlers/match-auto-approve-result.ts src/modules/leagues/application/match-service.ts src/worker/index.ts
git commit -m "feat(jobs): match-auto-approve-result handler + enqueue on submit"
```

---

## Task 7: league-finalize handler + heartbeat update + standings fix for ADMIN_RESOLVED

**Files:**
- Create: `src/worker/handlers/league-finalize.ts`
- Modify: `src/app/api/cron/heartbeat/route.ts`
- Modify: `src/worker/index.ts`
- Modify: `src/app/(app)/ligas/[slug]/page.tsx`

- [ ] **Step 1: Create league-finalize handler**

Create `src/worker/handlers/league-finalize.ts`:

```typescript
import { prisma } from '@/shared/db/client';
import { logger } from '@/shared/logger';
import type { JobMap } from '@/shared/queue/jobs';

const NON_FINAL_STATUSES = [
  'SCHEDULED',
  'DATE_PROPOSED',
  'DATE_CONFIRMED',
  'PENDING_VALIDATION',
  'DISPUTED',
] as const;

export async function leagueFinalizeHandler(data: JobMap['league-finalize']): Promise<void> {
  const { leagueId } = data;
  const log = logger();

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) {
    log.warn({ leagueId }, 'league-finalize.not-found');
    return;
  }
  if (league.status === 'FINISHED') {
    log.info({ leagueId }, 'league-finalize.already-finished');
    return;
  }

  await prisma.$transaction(async (tx) => {
    const expired = await tx.match.updateMany({
      where: { leagueId, status: { in: [...NON_FINAL_STATUSES] } },
      data: { status: 'EXPIRED_UNPLAYED' },
    });

    await tx.league.update({
      where: { id: leagueId },
      data: { status: 'FINISHED', finalizedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        actorId: null,
        action: 'league.finalized',
        targetType: 'League',
        targetId: leagueId,
        metadata: { expiredMatchCount: expired.count },
      },
    });
  });

  log.info({ leagueId }, 'league-finalize.done');
}
```

- [ ] **Step 2: Update heartbeat route to enqueue league-finalize for ended leagues**

Replace entire `src/app/api/cron/heartbeat/route.ts`:

```typescript
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/shared/config/env';
import { queue } from '@/shared/queue/client';
import { logger } from '@/shared/logger';
import { prisma } from '@/shared/db/client';

function unauthorized() {
  return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });
}

export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${env().CRON_SECRET}`;
  const authBuf = Buffer.from(auth, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const valid =
    authBuf.length === expectedBuf.length && timingSafeEqual(authBuf, expectedBuf);
  if (!valid) {
    return unauthorized();
  }

  const q = queue();
  await q.start();
  const log = logger();

  const noopId = await q.publish('noop', { ping: `heartbeat-${Date.now()}` });
  log.info({ jobId: noopId }, 'cron.heartbeat.enqueued');

  // Finalize leagues whose endDate has passed
  const leaguesToFinalize = await prisma.league.findMany({
    where: { endDate: { lte: new Date() }, status: 'ACTIVE' },
    select: { id: true },
  });

  const finalizeIds: string[] = [];
  for (const league of leaguesToFinalize) {
    const jobId = await q.publish(
      'league-finalize',
      { leagueId: league.id },
      { singletonKey: `league-finalize-${league.id}` },
    );
    if (jobId) finalizeIds.push(league.id);
  }

  if (finalizeIds.length > 0) {
    log.info({ count: finalizeIds.length, leagueIds: finalizeIds }, 'cron.league-finalize.enqueued');
  }

  return NextResponse.json({ ok: true, jobId: noopId, leaguesToFinalize: finalizeIds.length });
}
```

- [ ] **Step 3: Register league-finalize handler in worker/index.ts**

Add import after `matchAutoApproveResultHandler` import:
```typescript
import { leagueFinalizeHandler } from './handlers/league-finalize';
```

Add registration after `match-auto-approve-result` registration:
```typescript
await registerHandler(boss, 'league-finalize', leagueFinalizeHandler);
```

- [ ] **Step 4: Fix standings to include ADMIN_RESOLVED matches**

In `src/app/(app)/ligas/[slug]/page.tsx`, find the `confirmedMatches` query (currently `where: { leagueId: league.id, status: 'CONFIRMED' }`). Replace that section:

Old code (around lines 60-75):
```typescript
  // Load confirmed matches for standings calculation
  const confirmedMatches = await prisma.match.findMany({
    where: { leagueId: league.id, status: 'CONFIRMED' },
    include: { confirmedResult: { include: { sets: true } } },
  });

  const teamNamesMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));
  const standingMatches = confirmedMatches
    .filter((m) => m.confirmedResult)
    .map((m) => ({
      teamAId: m.teamAId,
      teamBId: m.teamBId,
      winnerTeamId: m.winnerTeamId,
      sets: m.confirmedResult!.sets.map((s) => ({ gamesA: s.gamesA, gamesB: s.gamesB })),
    }));
```

New code:
```typescript
  // Load confirmed + admin-resolved matches for standings calculation
  const confirmedMatches = await prisma.match.findMany({
    where: { leagueId: league.id, status: { in: ['CONFIRMED', 'ADMIN_RESOLVED'] } },
    include: { confirmedResult: { include: { sets: true } } },
  });

  const teamNamesMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));
  const standingMatches = confirmedMatches.map((m) => ({
    teamAId: m.teamAId,
    teamBId: m.teamBId,
    winnerTeamId: m.winnerTeamId,
    sets: m.confirmedResult?.sets.map((s) => ({ gamesA: s.gamesA, gamesB: s.gamesB })) ?? [],
  }));
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Run unit tests**

Run: `pnpm test:unit`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/worker/handlers/league-finalize.ts src/app/api/cron/heartbeat/route.ts src/worker/index.ts src/app/\(app\)/ligas/\[slug\]/page.tsx
git commit -m "feat(jobs): league-finalize handler + heartbeat cron + standings ADMIN_RESOLVED"
```

---

## Task 8: Admin disputes panel

**Files:**
- Modify: `src/modules/leagues/application/match-service.ts` (add `resolveDispute`)
- Modify: `src/modules/leagues/index.ts` (export new types)
- Create: `src/app/(app)/admin/disputas/page.tsx`
- Create: `src/app/(app)/admin/disputas/actions.ts`

### resolveDispute logic

Resolution enum values and their effect on `Match`:
- `AWARD_PROPONENT`: match → `ADMIN_RESOLVED`, `winnerTeamId` = team of dispute opener
- `AWARD_OPPONENT`: match → `ADMIN_RESOLVED`, `winnerTeamId` = OTHER team
- `BOTH_LOST`: match → `EXPIRED_UNPLAYED` (0 pts both; reuses expired status for standings consistency)
- `EXTEND_DEADLINE`: match → `SCHEDULED`, update `deadlineAt`, dispute resolved
- `DISMISS`: match → `ADMIN_RESOLVED`, `winnerTeamId` = null (treated as draw in standings, 1 pt each)

**Who is "proponent" vs "opponent"?**
The `Dispute.openedByUserId` is the user who raised the dispute. Their team is the "proponent".

- [ ] **Step 1: Add resolveDispute to MatchService**

Add the following import at the top of `src/modules/leagues/application/match-service.ts` (after existing imports):

```typescript
import type { DisputeResolution } from '@prisma/client';
```

Add the following method to `MatchService` (before the closing `} as const`):

```typescript
async resolveDispute(
  disputeId: string,
  adminUserId: string,
  resolution: DisputeResolution,
  adminNote?: string,
  newDeadlineAt?: Date,
): Promise<void> {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      match: {
        include: {
          teamA: { include: { members: true } },
          teamB: { include: { members: true } },
        },
      },
    },
  });

  if (!dispute) throw new NotFoundError('DISPUTE_NOT_FOUND', 'Disputa no encontrada.');
  if (dispute.status === 'RESOLVED')
    throw new DomainError('DISPUTE_ALREADY_RESOLVED', 'Esta disputa ya fue resuelta.');

  const match = dispute.match;

  // Determine proponent's team (team of the user who opened the dispute)
  const teamAIds = match.teamA.members.map((m) => m.userId);
  const proponentSide = getSubmitterSide(dispute.openedByUserId, teamAIds, match.teamB.members.map((m) => m.userId));
  const proponentTeamId = proponentSide === 'A' ? match.teamAId : match.teamBId;
  const opponentTeamId = proponentSide === 'A' ? match.teamBId : match.teamAId;

  await prisma.$transaction(async (tx) => {
    // Resolve the dispute record
    await tx.dispute.update({
      where: { id: disputeId },
      data: {
        status: 'RESOLVED',
        resolution,
        adminNote: adminNote ?? null,
        newDeadlineAt: resolution === 'EXTEND_DEADLINE' ? newDeadlineAt : null,
        resolvedByUserId: adminUserId,
        resolvedAt: new Date(),
      },
    });

    // Update the match based on resolution
    if (resolution === 'AWARD_PROPONENT') {
      await tx.match.update({
        where: { id: match.id },
        data: { status: 'ADMIN_RESOLVED', winnerTeamId: proponentTeamId },
      });
    } else if (resolution === 'AWARD_OPPONENT') {
      await tx.match.update({
        where: { id: match.id },
        data: { status: 'ADMIN_RESOLVED', winnerTeamId: opponentTeamId },
      });
    } else if (resolution === 'BOTH_LOST') {
      await tx.match.update({
        where: { id: match.id },
        data: { status: 'EXPIRED_UNPLAYED', winnerTeamId: null },
      });
    } else if (resolution === 'EXTEND_DEADLINE') {
      if (!newDeadlineAt) throw new DomainError('MISSING_DEADLINE', 'Se requiere nueva fecha límite para extender.');
      await tx.match.update({
        where: { id: match.id },
        data: { status: 'SCHEDULED', deadlineAt: newDeadlineAt },
      });
    } else {
      // DISMISS: close dispute, treat as draw (winnerTeamId = null)
      await tx.match.update({
        where: { id: match.id },
        data: { status: 'ADMIN_RESOLVED', winnerTeamId: null },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: adminUserId,
        action: 'dispute.resolved',
        targetType: 'Dispute',
        targetId: disputeId,
        metadata: { resolution, matchId: match.id, adminNote: adminNote ?? null },
      },
    });
  });
},
```

- [ ] **Step 2: Update leagues barrel to export new type**

In `src/modules/leagues/index.ts`, the existing exports don't need changes since `DisputeResolution` comes from `@prisma/client` directly. But add `resolveDispute` is already part of `MatchService` — verify the barrel exports `MatchService`. Current barrel already exports `MatchService`, so no change needed.

However, add `ResolveDisputeInput` type to `src/modules/leagues/domain/types.ts` for clarity:

```typescript
export type ResolveDisputeInput = {
  resolution: import('@prisma/client').DisputeResolution;
  adminNote?: string;
  newDeadlineAt?: Date;
};
```

This type is optional (the server action can use the Prisma enum directly), but documents the API.

- [ ] **Step 3: Create admin disputes server action**

Create `src/app/(app)/admin/disputas/actions.ts`:

```typescript
'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { MatchService } from '@/modules/leagues';
import { isUserFacingError } from '@/shared/errors';
import type { DisputeResolution } from '@prisma/client';

async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);
  const user = await getValidatedSession(token);
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard' as Route);
  return user;
}

const VALID_RESOLUTIONS: DisputeResolution[] = [
  'AWARD_PROPONENT',
  'AWARD_OPPONENT',
  'BOTH_LOST',
  'EXTEND_DEADLINE',
  'DISMISS',
];

const resolveSchema = z.object({
  disputeId: z.string().cuid(),
  resolution: z.enum(['AWARD_PROPONENT', 'AWARD_OPPONENT', 'BOTH_LOST', 'EXTEND_DEADLINE', 'DISMISS']),
  adminNote: z.string().max(2000).optional(),
  newDeadlineAt: z.string().datetime({ offset: true }).optional(),
});

export async function resolveDisputeAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const admin = await getAdminSession();
  void VALID_RESOLUTIONS; // used for runtime validation via Zod above

  const parsed = resolveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  const { disputeId, resolution, adminNote, newDeadlineAt } = parsed.data;

  try {
    await MatchService.resolveDispute(
      disputeId,
      admin.id,
      resolution as DisputeResolution,
      adminNote,
      newDeadlineAt ? new Date(newDeadlineAt) : undefined,
    );
    return {};
  } catch (err) {
    if (isUserFacingError(err)) return { error: (err as Error).message };
    throw err;
  }
}
```

- [ ] **Step 4: Create admin disputes page**

Create `src/app/(app)/admin/disputas/page.tsx`:

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { prisma } from '@/shared/db/client';
import { ResolveDisputeForm } from './resolve-form';

export default async function DisputasAdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login' as Route);

  const user = await getValidatedSession(token).catch(() => {
    redirect('/login' as Route);
  });
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard' as Route);

  const disputes = await prisma.dispute.findMany({
    where: { status: 'OPEN' },
    include: {
      match: {
        include: {
          league: { select: { name: true, slug: true } },
          teamA: { select: { name: true } },
          teamB: { select: { name: true } },
        },
      },
      opener: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Disputas abiertas</h1>
        <p className="text-gray-500 mt-1">{disputes.length} disputa{disputes.length !== 1 ? 's' : ''} pendiente{disputes.length !== 1 ? 's' : ''}</p>
      </div>

      {disputes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          No hay disputas abiertas.
        </div>
      ) : (
        <div className="space-y-4">
          {disputes.map((dispute) => (
            <div key={dispute.id} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-semibold text-gray-900">
                    {dispute.match.teamA.name} vs {dispute.match.teamB.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    Liga: {dispute.match.league.name} · Abierta por {dispute.opener.name} ({dispute.opener.email})
                  </p>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {new Date(dispute.createdAt).toLocaleDateString('es-ES')}
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-1">Motivo:</p>
                <p className="text-sm text-gray-600">{dispute.reason}</p>
              </div>

              <ResolveDisputeForm disputeId={dispute.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create ResolveDisputeForm client component**

Create `src/app/(app)/admin/disputas/resolve-form.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { resolveDisputeAction } from './actions';

type FormState = { error?: string };
const initial: FormState = {};

export function ResolveDisputeForm({ disputeId }: { disputeId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (_prev: FormState, formData: FormData): Promise<FormState> => {
      const result = await resolveDisputeAction(_prev, formData);
      if (!result.error) router.refresh();
      return result;
    },
    initial,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="disputeId" value={disputeId} />

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Resolución</label>
          <select
            name="resolution"
            required
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Seleccionar...</option>
            <option value="AWARD_PROPONENT">Dar la razón al denunciante</option>
            <option value="AWARD_OPPONENT">Dar la razón al denunciado</option>
            <option value="BOTH_LOST">Derrota para ambos (0 pts)</option>
            <option value="EXTEND_DEADLINE">Ampliar plazo</option>
            <option value="DISMISS">Desestimar disputa (empate)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Nueva fecha límite (solo si amplías plazo)</label>
          <input
            type="datetime-local"
            name="newDeadlineAt"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Nota del administrador (opcional)</label>
        <textarea
          name="adminNote"
          rows={2}
          maxLength={2000}
          placeholder="Explicación de la resolución para los jugadores..."
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
        />
      </div>

      {state.error && (
        <p className="text-sm text-red-500">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-60 transition-colors"
      >
        {pending ? 'Resolviendo...' : 'Resolver disputa'}
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Update ESLint config allowDefaultProject**

In `eslint.config.mjs`, add the admin disputes page to the allowDefaultProject list. Actually, the disputes page and action are in `src/app/` (type `app` in ESLint) and are covered by the existing tsconfig — no changes needed to `allowDefaultProject`. This step is SKIP.

- [ ] **Step 7: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 8: Run unit tests**

Run: `pnpm test:unit`
Expected: All 58 existing tests pass

- [ ] **Step 9: Smoke test admin panel**

Start `pnpm dev`. Log in as `falcarazlluch@gmail.com` (SUPER_ADMIN). Navigate to `/admin/disputas`. Should show "No hay disputas abiertas." without errors. Verify "Disputas" nav link appears.

- [ ] **Step 10: Commit**

```bash
git add src/modules/leagues/application/match-service.ts src/modules/leagues/domain/types.ts src/app/\(app\)/admin/disputas/
git commit -m "feat(admin): disputes panel + resolveDispute in MatchService"
```

---

## Self-Review Checklist

### Spec coverage

| Spec requirement | Covered by |
|-----------------|-----------|
| Auto-aprobación de resultado a 7 días (§8, §3.5) | Task 6: `match-auto-approve-result` handler + enqueue in `submitResult` |
| Expiración de partidos al llegar `league.endDate` (§3.2, §8.4) | Task 7: `league-finalize` handler + heartbeat |
| Notificaciones in-app por polling ~30s (§2 D8) | Tasks 1–3: service + API + badge |
| Email: resultado enviado (§4 spec desc) | Tasks 4–5: template + enqueue in action |
| Email: resultado confirmado (§4 spec desc) | Tasks 4–5, 6: template + enqueue in action + auto-approve handler |
| Admin disputas: DISPUTED → ADMIN_RESOLVED (§3.5) | Task 8: admin panel + resolveDispute |
| `AuditLog` para auto_approved, league.finalized, dispute.resolved (§9.4) | Tasks 6, 7, 8 |
| Clasificación incluye ADMIN_RESOLVED (§3.3) | Task 7: standings query update |
| Email auto-aprobado confirmación (§8.3 job flow) | Task 6: auto-approve handler enqueues send-email |

### Type consistency

- `NotificationService.create/createMany` accept `NotificationType` — valid Prisma enum. ✅
- `MatchService.resolveDispute` receives `DisputeResolution` — valid Prisma enum. ✅
- `matchAutoApproveResultHandler` uses `JobMap['match-auto-approve-result']` = `{ matchResultId: string }`. ✅
- `leagueFinalizeHandler` uses `JobMap['league-finalize']` = `{ leagueId: string }`. ✅
- `fetchMatchTeamInfo` returns `MatchTeamInfo | null` — all callers check for null before proceeding. ✅
- `NON_FINAL_STATUSES` in `league-finalize` uses spread `[...NON_FINAL_STATUSES]` to convert readonly tuple to mutable array for Prisma `in` filter. ✅
