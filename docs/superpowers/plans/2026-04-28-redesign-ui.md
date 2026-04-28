# UI Redesign — Vibrant Sport Style — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernise the full app UI to the "Vibrant Sport" style — navy gradient nav, active link pills, gradient stat cards, elevated buttons, improved inputs, and a subtle page background.

**Architecture:** Pure Tailwind class changes across existing JSX files. No logic changes, no new routes, no shared React components except one new `NavLinks` client component needed to read `usePathname()` for the active link pill in the Server Component layout.

**Tech Stack:** Next.js 15 App Router, Tailwind CSS v4, `next/image`.

---

## File Structure

**New files:**
- `src/app/(app)/_components/nav-links.tsx` — Client component for active-link detection in the nav

**Modified files:**
- `src/app/(app)/layout.tsx` — Nav gradient, logo 88 px, NavLinks, page background gradient
- `src/app/(auth)/layout.tsx` — Yellow top border on card, `<img>` → `<Image>`
- `src/app/(auth)/login/page.tsx` — Input + button styles
- `src/app/(auth)/recuperar-password/page.tsx` — Full restyle (currently uses inline styles)
- `src/app/(auth)/recuperar-password/[token]/page.tsx` — Full restyle
- `src/app/(app)/dashboard/page.tsx` — Eyebrow, gradient cards, gradient buttons
- `src/app/(app)/ligas/page.tsx` — Eyebrow, card shadow, badge gradients, button
- `src/app/(app)/ligas/nueva/page.tsx` — Inputs + buttons
- `src/app/(app)/ligas/[slug]/page.tsx` — Eyebrow, team cards, avatar, tab style, buttons
- `src/app/(app)/ligas/[slug]/equipos/nueva/form.tsx` — Input + button
- `src/app/(app)/partidos/page.tsx` — Eyebrow, section headers
- `src/app/(app)/partidos/_components/match-card-mis-partidos.tsx` — Card and button styles
- `src/app/(app)/jugar/page.tsx` — Eyebrow, tab style, card style
- `src/app/(app)/jugar/nuevo/_components/nuevo-partido-form.tsx` — Inputs + buttons
- `src/app/(app)/jugar/[id]/page.tsx` — Eyebrow, card styles, buttons
- `src/app/(app)/jugar/[id]/_components/join-request-button.tsx` — Button style
- `src/app/(app)/jugar/[id]/_components/join-requests-panel.tsx` — Panel + button styles
- `src/app/(app)/jugar/[id]/_components/invite-form.tsx` — Input + button
- `src/app/(app)/jugar/[id]/_components/challenge-panel.tsx` — Panel style

---

## Task 1: Nav + global shell

**Files:**
- Create: `src/app/(app)/_components/nav-links.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Create `nav-links.tsx`**

Create `src/app/(app)/_components/nav-links.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Route } from 'next';

function linkClass(active: boolean) {
  return active
    ? 'text-sm font-semibold bg-brand-yellow/20 text-brand-yellow border border-brand-yellow/30 px-3 py-1 rounded-full transition-colors'
    : 'text-sm font-medium text-white/70 hover:text-white transition-colors';
}

export function NavLinks({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-6">
      <Link href={'/ligas' as Route} className={linkClass(pathname.startsWith('/ligas'))}>
        Ligas
      </Link>
      <Link href={'/partidos' as Route} className={linkClass(pathname.startsWith('/partidos'))}>
        Mis partidos
      </Link>
      <Link href={'/jugar' as Route} className={linkClass(pathname.startsWith('/jugar'))}>
        Jugar
      </Link>
      {isSuperAdmin && (
        <Link
          href={'/admin/disputas' as Route}
          className="text-sm font-medium text-brand-yellow/90 hover:text-brand-yellow transition-colors"
        >
          Disputas
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `layout.tsx`**

Replace `src/app/(app)/layout.tsx` entirely with:

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { SESSION_COOKIE } from '@/shared/auth/session';
import { getValidatedSession } from '@/shared/auth/session-cache';
import { NotificationsBadge } from './notifications-badge';
import { NavLinks } from './_components/nav-links';

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
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg,#e8eef8 0%,#f0f4fb 40%,#f5f7fa 100%)' }}>
      <nav className="bg-gradient-to-r from-brand-navy to-brand-navy-light px-6 py-1 flex items-center justify-between sticky top-0 z-10 shadow-md overflow-visible">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center shrink-0 -mb-6">
            <Image
              src="/logo.png"
              alt="Padel League"
              width={220}
              height={88}
              className="h-22 w-auto object-contain drop-shadow-lg"
              priority
              unoptimized
            />
          </Link>
          <NavLinks isSuperAdmin={currentUser.role === 'SUPER_ADMIN'} />
        </div>
        <div className="flex items-center gap-4">
          <NotificationsBadge />
          <Link
            href="/perfil"
            className="text-sm font-medium text-white/70 hover:text-white transition-colors"
          >
            Mi perfil
          </Link>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="text-sm font-medium text-white/50 hover:text-white/90 transition-colors"
            >
              Salir
            </button>
          </form>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/layout.tsx src/app/\(app\)/_components/nav-links.tsx
git commit -m "feat(ui): gradient nav, 88px logo overflow, active link pills"
```

---

## Task 2: Auth pages

**Files:**
- Modify: `src/app/(auth)/layout.tsx`
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/recuperar-password/page.tsx`
- Modify: `src/app/(auth)/recuperar-password/[token]/page.tsx`

- [ ] **Step 1: Update `(auth)/layout.tsx`**

Replace with:

```tsx
import Image from 'next/image';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: 'linear-gradient(135deg, #0D1E45 0%, #1A3268 60%, #0D1E45 100%)' }}
    >
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-xl border-t-4 border-brand-yellow p-8">
          <div className="flex justify-center mb-6">
            <Image
              src="/logo.png"
              alt="Padel League"
              width={240}
              height={96}
              className="w-4/5 h-auto object-contain"
              priority
              unoptimized
            />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `login/page.tsx`**

Replace the form content (keep auth logic imports unchanged, only update JSX classNames):

```tsx
import Link from 'next/link';
import type { Route } from 'next';
import { loginAction } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next = '/dashboard' } = await searchParams;
  const formAction = loginAction as unknown as (formData: FormData) => Promise<void>;

  return (
    <>
      <h1 className="text-xl font-bold text-brand-navy mb-1">Iniciar sesión</h1>
      <p className="text-sm text-slate-400 mb-6">Accede a tu cuenta para gestionar tus ligas</p>
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
        <button
          type="submit"
          className="w-full py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl hover:opacity-90 transition-opacity shadow-lg mt-1"
        >
          Entrar
        </button>
        <Link
          href={'/recuperar-password' as Route}
          className="text-sm text-center text-brand-navy/60 hover:text-brand-navy transition-colors"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </form>
    </>
  );
}
```

- [ ] **Step 3: Update `recuperar-password/page.tsx`**

Replace entirely (currently uses inline styles):

```tsx
import Link from 'next/link';
import type { Route } from 'next';
import { requestPasswordResetAction } from './actions';

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-xl font-bold text-brand-navy mb-1">Recuperar contraseña</h1>
      <p className="text-sm text-slate-400 mb-6">
        Introduce tu email y te enviaremos un enlace para restablecer tu contraseña.
      </p>
      <form
        action={requestPasswordResetAction as unknown as (formData: FormData) => Promise<void>}
        className="flex flex-col gap-4"
      >
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="tu@email.com"
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
        <button
          type="submit"
          className="w-full py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl hover:opacity-90 transition-opacity shadow-lg"
        >
          Enviar enlace
        </button>
        <Link
          href={'/login' as Route}
          className="text-sm text-center text-slate-400 hover:text-brand-navy transition-colors"
        >
          Volver al login
        </Link>
      </form>
    </>
  );
}
```

- [ ] **Step 4: Update `recuperar-password/[token]/page.tsx`**

Replace entirely:

```tsx
import { resetPasswordAction } from './actions';

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <>
      <h1 className="text-xl font-bold text-brand-navy mb-6">Nueva contraseña</h1>
      <form
        action={(async (formData: FormData) => {
          'use server';
          return resetPasswordAction(token, formData);
        }) as unknown as (formData: FormData) => Promise<void>}
        className="flex flex-col gap-4"
      >
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
            Nueva contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">
            Confirmar contraseña
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
        <button
          type="submit"
          className="w-full py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl hover:opacity-90 transition-opacity shadow-lg"
        >
          Cambiar contraseña
        </button>
      </form>
    </>
  );
}
```

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(auth\)/
git commit -m "feat(ui): auth pages — yellow card accent, modern inputs and buttons"
```

---

## Task 3: Dashboard

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Update `dashboard/page.tsx`**

Replace the return JSX (keep all imports and data-fetching logic unchanged):

```tsx
  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Panel de control</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Bienvenido, {user.name}</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-brand-navy to-brand-navy-light rounded-2xl p-5 shadow-lg">
          <p className="text-2xl font-extrabold text-brand-yellow">{leagueCount}</p>
          <p className="text-xs text-white/70 mt-1">Liga{leagueCount !== 1 ? 's' : ''} activa{leagueCount !== 1 ? 's' : ''}</p>
        </div>

        <div className="bg-gradient-to-br from-brand-blue to-brand-blue-light rounded-2xl p-5 shadow-lg">
          <p className="text-2xl font-extrabold text-white">{matchCount}</p>
          <p className="text-xs text-white/80 mt-1">Resultado{matchCount !== 1 ? 's' : ''} pendiente{matchCount !== 1 ? 's' : ''}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-md border border-slate-200/80">
          <p className="text-sm font-bold text-brand-navy">Mis partidos</p>
          <p className="text-xs text-slate-400 mt-1">Ver mis próximos partidos</p>
        </div>
      </div>

      <div className="flex gap-3">
        <Link
          href={'/ligas' as Route}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 transition-opacity"
        >
          Ver ligas
        </Link>
        {user.role === 'SUPER_ADMIN' && (
          <Link
            href={'/admin/usuarios/invitar' as Route}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-slate-700 text-sm font-semibold rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
          >
            Invitar jugador
          </Link>
        )}
      </div>
    </div>
  );
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/dashboard/page.tsx
git commit -m "feat(ui): dashboard — eyebrow, gradient stat cards, elevated buttons"
```

---

## Task 4: Ligas pages

**Files:**
- Modify: `src/app/(app)/ligas/page.tsx`
- Modify: `src/app/(app)/ligas/nueva/page.tsx`
- Modify: `src/app/(app)/ligas/[slug]/page.tsx`
- Modify: `src/app/(app)/ligas/[slug]/equipos/nueva/form.tsx`

- [ ] **Step 1: Update `ligas/page.tsx`**

Replace the STATUS_CLASS map and the return JSX:

```tsx
import Link from 'next/link';
import type { Route } from 'next';
import { LeagueService } from '@/modules/leagues';
import type { LeagueStatus } from '@prisma/client';

const STATUS_LABEL: Record<LeagueStatus, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Activa',
  FINISHED: 'Finalizada',
  ARCHIVED: 'Archivada',
};

const STATUS_CLASS: Record<LeagueStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-500',
  ACTIVE: 'bg-gradient-to-r from-emerald-50 to-green-100 text-emerald-700',
  FINISHED: 'bg-gradient-to-r from-blue-50 to-sky-100 text-blue-700',
  ARCHIVED: 'bg-gray-100 text-gray-400',
};

export default async function LigasPage() {
  const leagues = await LeagueService.list();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Temporada 2026</p>
          <h1 className="text-2xl font-extrabold text-brand-navy">Ligas</h1>
        </div>
        <Link
          href={'/ligas/nueva' as Route}
          className="px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 transition-opacity"
        >
          Nueva liga
        </Link>
      </div>

      {leagues.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg mb-2">No hay ligas todavía</p>
          <p className="text-sm">Crea la primera liga para empezar</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {leagues.map((league) => (
            <Link
              key={league.id}
              href={`/ligas/${league.slug}` as Route}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 hover:shadow-md transition-shadow shadow-sm"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h2 className="font-semibold text-brand-navy leading-tight">{league.name}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_CLASS[league.status]}`}>
                  {STATUS_LABEL[league.status]}
                </span>
              </div>
              {league.description && (
                <p className="text-sm text-slate-500 mb-3 line-clamp-2">{league.description}</p>
              )}
              <p className="text-xs text-slate-400">
                {league.startDate.toLocaleDateString('es-ES')} –{' '}
                {league.endDate.toLocaleDateString('es-ES')}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `ligas/nueva/page.tsx`**

Replace only the classNames (keep all logic intact):

```tsx
'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { createLeagueAction } from '../actions';

const initialState = { error: undefined as string | undefined };

export default function NuevaLigaPage() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createLeagueAction, initialState);

  return (
    <div className="max-w-lg">
      <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Nueva liga</p>
      <h1 className="text-2xl font-extrabold text-brand-navy mb-6">Crear liga</h1>
      <form action={formAction} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 flex flex-col gap-4">
        {state.error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {state.error}
          </div>
        )}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
            Nombre de la liga <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="Ej: Liga Verano 2025"
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
          />
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">
            Descripción
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            placeholder="Descripción opcional..."
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium text-slate-700 mb-1">
              Fecha inicio <span className="text-red-500">*</span>
            </label>
            <input
              id="startDate"
              name="startDate"
              type="date"
              required
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
            />
          </div>
          <div>
            <label htmlFor="endDate" className="block text-sm font-medium text-slate-700 mb-1">
              Fecha fin <span className="text-red-500">*</span>
            </label>
            <input
              id="endDate"
              name="endDate"
              type="date"
              required
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
            />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 px-4 py-2.5 bg-white border border-gray-200 text-slate-700 text-sm font-semibold rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {pending ? 'Creando...' : 'Crear liga'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Update `ligas/[slug]/page.tsx` — header, team cards, tab styles, button**

Read the file first (`cat src/app/\(app\)/ligas/\[slug\]/page.tsx`) to locate line numbers. Then apply these targeted replacements:

**Header** (around line 87):
```tsx
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Liga</p>
          <h1 className="text-2xl font-extrabold text-brand-navy">{league.name}</h1>
          {league.description && <p className="text-slate-500 mt-1">{league.description}</p>}
          <p className="text-sm text-slate-400 mt-1">
            {league.startDate.toLocaleDateString('es-ES')} – {league.endDate.toLocaleDateString('es-ES')}
          </p>
        </div>
        {isLeagueAdmin && league.status === 'DRAFT' && (
          <ActivateLeagueButton leagueId={league.id} />
        )}
      </div>
```

**Equipos section header button** (line ~104):
```tsx
            <Link
              href={`/ligas/${slug}/equipos/nueva` as Route}
              className="text-sm px-3 py-1.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white font-semibold rounded-xl shadow-sm hover:opacity-90 transition-opacity"
            >
              Añadir equipo
            </Link>
```

**Team cards** (line ~116):
```tsx
              <div key={team.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
                <h3 className="font-semibold text-brand-navy mb-3">{team.name}</h3>
                <ul className="space-y-1.5">
                  {team.members.map((m) => (
                    <li key={m.userId} className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-xs flex items-center justify-center font-semibold shrink-0">
                        {m.user.name[0]?.toUpperCase()}
                      </span>
                      {m.user.name}
                    </li>
                  ))}
```

**Tabs** (line ~143):
```tsx
          <div className="flex border-b border-gray-200 mb-4">
            <Link
              href={`/ligas/${slug}` as Route}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab !== 'partidos'
                  ? 'border-brand-yellow text-brand-navy font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Clasificación
            </Link>
            <Link
              href={`/ligas/${slug}?tab=partidos` as Route}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === 'partidos'
                  ? 'border-brand-yellow text-brand-navy font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Partidos
            </Link>
          </div>
```

- [ ] **Step 4: Update `ligas/[slug]/equipos/nueva/form.tsx`**

Replace classNames only (keep all logic):

```tsx
'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { createTeamAction } from '../../../actions';

type FormState = { error?: string };
const initial: FormState = {};

export function NuevoEquipoForm({ leagueId, slug }: { leagueId: string; slug: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (_prev: FormState, formData: FormData): Promise<FormState> => {
      const result = await createTeamAction(_prev, formData);
      if (!result.error) router.push(`/ligas/${slug}` as Route);
      return result;
    },
    initial,
  );

  return (
    <form action={formAction} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 flex flex-col gap-4">
      <input type="hidden" name="leagueId" value={leagueId} />
      {state.error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {state.error}
        </div>
      )}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
          Nombre del equipo <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="Ej: Los Cañones"
          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
      </div>
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 px-4 py-2.5 bg-white border border-gray-200 text-slate-700 text-sm font-semibold rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {pending ? 'Creando...' : 'Crear equipo'}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/ligas/
git commit -m "feat(ui): ligas pages — eyebrow, gradient cards, yellow tabs, modern inputs"
```

---

## Task 5: Mis partidos

**Files:**
- Modify: `src/app/(app)/partidos/page.tsx`
- Modify: `src/app/(app)/partidos/_components/match-card-mis-partidos.tsx`

- [ ] **Step 1: Update `partidos/page.tsx`**

In the return JSX, replace the heading and section headers:

```tsx
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Calendario</p>
        <h1 className="text-2xl font-extrabold text-brand-navy">Mis partidos</h1>
      </div>

      {matches.length === 0 && (
        <p className="text-slate-400 text-sm">No tienes partidos asignados todavía.</p>
      )}

      {confirmedMatches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Confirmados</h2>
          {confirmedMatches.map((m) => (
            <MatchCardMisPartidos key={m.id} {...buildCardProps(m)} />
          ))}
        </section>
      )}

      {proposedMatches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pendiente de confirmar</h2>
          {proposedMatches.map((m) => (
            <MatchCardMisPartidos key={m.id} {...buildCardProps(m)} />
          ))}
        </section>
      )}

      {scheduledMatches.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sin programar</h2>
          {scheduledMatches.map((m) => (
            <MatchCardMisPartidos key={m.id} {...buildCardProps(m)} />
          ))}
        </section>
      )}

      {expiredMatches.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs font-bold text-slate-400 uppercase tracking-widest select-none">
            No jugados ({expiredMatches.length})
          </summary>
          <div className="space-y-3 mt-3">
            {expiredMatches.map((m) => (
              <MatchCardMisPartidos key={m.id} {...buildCardProps(m)} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
```

- [ ] **Step 2: Update `match-card-mis-partidos.tsx`**

Replace the `cardStyle` function and update the team names, league badge, and action buttons:

```tsx
function cardStyle(status: MatchStatus, proposalState: 'none' | 'mine' | 'rival'): string {
  if (status === 'CONFIRMED' || status === 'ADMIN_RESOLVED')
    return 'bg-white border-l-4 border-l-emerald-400 border border-slate-200/80 shadow-sm';
  if (status === 'DATE_PROPOSED' || status === 'DATE_CONFIRMED')
    return proposalState === 'rival'
      ? 'bg-white border-l-4 border-l-brand-blue border border-slate-200/80 shadow-sm'
      : 'bg-white border-l-4 border-l-brand-blue/50 border border-slate-200/80 shadow-sm';
  if (status === 'SCHEDULED')
    return 'bg-white border-l-4 border-l-brand-yellow border border-slate-200/80 shadow-sm';
  return 'bg-white border border-slate-200/80 shadow-sm';
}
```

In the return JSX of `MatchCardMisPartidos`, replace the team link and league badge:

```tsx
    <div className={`rounded-2xl p-4 space-y-2 ${cardStyle(status, proposalState)}`}>
      <div className="flex items-center justify-between gap-2">
        <Link href={matchHref} className="font-bold text-brand-navy text-sm hover:underline">
          {teamAName} <span className="text-slate-400 font-normal">vs</span> {teamBName}
        </Link>
        <span className="text-xs text-brand-blue bg-brand-blue/10 px-2 py-0.5 rounded-full font-medium shrink-0">
          {leagueName}
        </span>
      </div>
```

Replace the "Proponer fecha" link button:

```tsx
      {status === 'SCHEDULED' && (
        <Link
          href={matchHref}
          className="inline-block bg-brand-yellow text-brand-navy text-xs font-bold rounded-full px-3 py-1 hover:opacity-90 transition-opacity"
        >
          + Proponer fecha
        </Link>
      )}
```

Replace the accept/reject buttons in the `DATE_PROPOSED` block:

```tsx
      {status === 'DATE_PROPOSED' && proposalState === 'rival' && (
        <div className="flex gap-2 items-center">
          <form action={acceptAction}>
            <input type="hidden" name="matchId" value={matchId} />
            <button
              type="submit"
              disabled={acceptPending}
              className="bg-gradient-to-br from-emerald-500 to-green-600 text-white text-xs font-bold rounded-full px-3 py-1 hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {acceptPending ? '...' : '✓ Aceptar'}
            </button>
          </form>
          <Link
            href={matchHref}
            className="border border-slate-200 text-slate-500 text-xs rounded-full px-3 py-1 hover:bg-gray-50 transition-colors"
          >
            Proponer otra
          </Link>
          {acceptResult && 'error' in acceptResult && (
            <span className="text-xs text-red-600">{acceptResult.error}</span>
          )}
        </div>
      )}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/partidos/
git commit -m "feat(ui): mis partidos — eyebrow, left-border cards, brand-blue league badge"
```

---

## Task 6: Jugar pages

**Files:**
- Modify: `src/app/(app)/jugar/page.tsx`
- Modify: `src/app/(app)/jugar/nuevo/_components/nuevo-partido-form.tsx`
- Modify: `src/app/(app)/jugar/[id]/page.tsx`
- Modify: `src/app/(app)/jugar/[id]/_components/join-request-button.tsx`
- Modify: `src/app/(app)/jugar/[id]/_components/join-requests-panel.tsx`
- Modify: `src/app/(app)/jugar/[id]/_components/invite-form.tsx`
- Modify: `src/app/(app)/jugar/[id]/_components/challenge-panel.tsx`

- [ ] **Step 1: Update `jugar/page.tsx`**

Replace the return JSX (keep all imports and data-fetching):

```tsx
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Partidos</p>
          <h1 className="text-2xl font-extrabold text-brand-navy">Jugar</h1>
        </div>
        <Link
          href={'/jugar/nuevo' as Route}
          className="text-sm px-4 py-2 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white font-bold rounded-xl shadow-md hover:opacity-90 transition-opacity"
        >
          Crear partido
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <Link
          href={'/jugar' as Route}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            isTablon
              ? 'border-brand-yellow text-brand-navy font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Tablón ({openMatches.filter((m) => calculateAvailableSlots(m.maxPlayers, m.confirmedCount) > 0).length})
        </Link>
        <Link
          href={'/jugar?tab=mis' as Route}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            !isTablon
              ? 'border-brand-yellow text-brand-navy font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Mis partidos ({myMatches.length})
        </Link>
      </div>

      {isTablon ? (
        <section>
          {openMatches.length === 0 ? (
            <p className="text-slate-400 text-sm">No hay partidos abiertos en este momento.</p>
          ) : (
            <ul className="space-y-3">
              {openMatches.map((m) => {
                const available = calculateAvailableSlots(m.maxPlayers, m.confirmedCount);
                return (
                  <li key={m.id}>
                    <Link
                      href={`/jugar/${m.id}` as Route}
                      className="block p-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-bold text-brand-navy truncate">{m.name}</p>
                          {m.scheduledAt && (
                            <p className="text-sm text-slate-400 mt-0.5">
                              {new Date(m.scheduledAt).toLocaleDateString('es-ES', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          )}
                          {m.location && (
                            <p className="text-sm text-slate-400 truncate">{m.location}</p>
                          )}
                        </div>
                        <span
                          className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${
                            available === 0
                              ? 'bg-gray-100 text-gray-500'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {available === 0 ? 'Completo' : `${available} libre${available !== 1 ? 's' : ''}`}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : (
        <section>
          {myMatches.length === 0 ? (
            <p className="text-slate-400 text-sm">No tienes partidos activos.</p>
          ) : (
            <ul className="space-y-3">
              {myMatches.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/jugar/${m.id}` as Route}
                    className="block p-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-bold text-brand-navy truncate">{m.name}</p>
                        <p className="text-xs text-slate-400 uppercase tracking-wide mt-0.5">
                          {m.type === 'OPEN' ? 'Abierto' : 'Reto de equipos'}
                        </p>
                      </div>
                      <StatusBadge status={m.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    OPEN: { label: 'Abierto', className: 'bg-gradient-to-r from-blue-50 to-sky-100 text-blue-700' },
    PENDING_APPROVAL: { label: 'Pendiente', className: 'bg-gradient-to-r from-yellow-50 to-amber-100 text-amber-700' },
    CONFIRMED: { label: 'Confirmado', className: 'bg-gradient-to-r from-emerald-50 to-green-100 text-emerald-700' },
    REJECTED: { label: 'Rechazado', className: 'bg-gradient-to-r from-red-50 to-rose-100 text-red-600' },
    CANCELLED: { label: 'Cancelado', className: 'bg-gray-100 text-gray-500' },
  };
  const { label, className } = map[status] ?? { label: status, className: 'bg-gray-100 text-gray-500' };
  return <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${className}`}>{label}</span>;
}
```

- [ ] **Step 2: Update `jugar/nuevo/_components/nuevo-partido-form.tsx`**

Replace all `className` strings for inputs and buttons (keep all logic, useState, useActionState, useEffect, router, conditionals):

Input class (apply to all `<input>` and `<select>` elements):
```
className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
```

Primary submit button class:
```
className="px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity"
```

Type selector buttons (active state):
```
className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
  type === 'open'
    ? 'bg-gradient-to-br from-brand-navy to-brand-navy-light text-white border-brand-navy shadow-md'
    : 'bg-white text-slate-700 border-gray-200 hover:border-gray-300'
}`}
```

- [ ] **Step 3: Update `jugar/[id]/page.tsx`**

Replace the eyebrow + title section and `statusStyle`/`statusLabel` helper functions:

Eyebrow + title (around "Header" comment):
```tsx
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">
              {match.type === 'TEAM_CHALLENGE' ? 'Reto de equipos' : 'Partido abierto'}
            </p>
            <h1 className="text-2xl font-extrabold text-brand-navy">{match.name}</h1>
          </div>
          <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${statusStyle(match.status)}`}>
            {statusLabel(match.status)}
          </span>
        </div>
        <p className="text-sm text-slate-400 mt-1">
          Organiza <strong className="text-brand-navy">{match.organizer.name}</strong>
        </p>
```

Updated `statusStyle` and `statusLabel`:
```tsx
function statusLabel(status: string): string {
  const map: Record<string, string> = {
    OPEN: 'Abierto', PENDING_APPROVAL: 'Pendiente', CONFIRMED: 'Confirmado',
    REJECTED: 'Rechazado', CANCELLED: 'Cancelado',
  };
  return map[status] ?? status;
}

function statusStyle(status: string): string {
  const map: Record<string, string> = {
    OPEN: 'bg-gradient-to-r from-blue-50 to-sky-100 text-blue-700',
    PENDING_APPROVAL: 'bg-gradient-to-r from-yellow-50 to-amber-100 text-amber-700',
    CONFIRMED: 'bg-gradient-to-r from-emerald-50 to-green-100 text-emerald-700',
    REJECTED: 'bg-gradient-to-r from-red-50 to-rose-100 text-red-600',
    CANCELLED: 'bg-gray-100 text-gray-500',
  };
  return map[status] ?? 'bg-gray-100 text-gray-500';
}
```

Participants section — update avatar gradient:
```tsx
                <span className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-xs flex items-center justify-center font-semibold shrink-0">
```

Pending request message — update style:
```tsx
      {hasPendingRequest && (
        <p className="text-sm text-amber-700 bg-gradient-to-r from-yellow-50 to-amber-100 border border-amber-200 rounded-xl px-4 py-2">
          Tu solicitud está pendiente de aprobación.
        </p>
      )}
```

Cancel button — update style:
```tsx
              <form action={cancelMatch}>
                <input type="hidden" name="matchId" value={id} />
                <button
                  type="submit"
                  className="text-sm bg-red-50 border border-red-200 text-red-600 font-semibold rounded-xl px-4 py-2 hover:bg-red-100 transition-colors"
                  onClick={(e) => {
                    if (!confirm('¿Seguro que quieres cancelar este partido?')) e.preventDefault();
                  }}
                >
                  Cancelar partido
                </button>
              </form>
```

- [ ] **Step 4: Update `jugar/[id]/_components/join-request-button.tsx`**

Update the button className:

```tsx
      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {pending ? 'Enviando...' : 'Unirme a este partido'}
      </button>
```

- [ ] **Step 5: Update `jugar/[id]/_components/join-requests-panel.tsx`**

Update the panel wrapper and buttons:

Panel wrapper:
```tsx
    <div className="bg-gradient-to-r from-yellow-50 to-amber-100 border border-amber-200 rounded-2xl p-4">
      <h3 className="text-sm font-bold text-amber-800 mb-3">
```

Approve button:
```tsx
          <button type="submit" disabled={approvePending || rejectPending}
            className="text-xs px-3 py-1.5 bg-gradient-to-br from-emerald-500 to-green-600 text-white font-bold rounded-full hover:opacity-90 disabled:opacity-50 transition-opacity">
```

Reject button:
```tsx
          <button type="submit" disabled={approvePending || rejectPending}
            className="text-xs px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-full hover:bg-gray-50 disabled:opacity-50 transition-colors">
```

- [ ] **Step 6: Update `jugar/[id]/_components/invite-form.tsx`**

Input and button:
```tsx
        <input
          name="email"
          type="email"
          placeholder="email@ejemplo.com"
          required
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"
        />
```

```tsx
      <button type="submit" disabled={pending}
        className="px-4 py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl shadow-md hover:opacity-90 disabled:opacity-50 shrink-0 transition-opacity">
        {pending ? '...' : 'Invitar'}
      </button>
```

- [ ] **Step 7: Update `jugar/[id]/_components/challenge-panel.tsx`**

Panel wrapper and buttons:
```tsx
    <div className="bg-gradient-to-r from-blue-50 to-sky-100 border border-sky-200 rounded-2xl p-4">
      <p className="text-sm text-brand-navy font-medium mb-3">
        <strong>{challengerTeamName}</strong> os reta a un partido amistoso.
      </p>
      {state && 'error' in state && <p className="text-sm text-red-600 mb-2">{state.error}</p>}
      <div className="flex gap-2">
        <form action={action}>
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="response" value="accept" />
          <button type="submit" disabled={pending}
            className="px-4 py-2 bg-gradient-to-br from-emerald-500 to-green-600 text-white text-sm font-bold rounded-xl shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
            Aceptar reto
          </button>
        </form>
        <form action={action}>
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="response" value="reject" />
          <button type="submit" disabled={pending}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors">
            Rechazar
          </button>
        </form>
      </div>
    </div>
```

- [ ] **Step 8: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/app/\(app\)/jugar/
git commit -m "feat(ui): jugar pages — yellow tabs, gradient cards, modern buttons and panels"
```
