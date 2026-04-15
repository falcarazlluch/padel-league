# Spec 1a — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the PadelLeague repository with a working Next.js + Prisma + pg-boss stack: project compiles, Postgres runs locally via Docker, full schema is migrated, Prisma client connects, a worker process boots and consumes a `noop` job round-tripped from the Next.js app.

**Architecture:** Single-package Next.js App Router (runs on Vercel) + separate Node worker entrypoint (runs on Railway) sharing `src/shared/*` modules. Postgres is the only durable store — pg-boss lives in a `pgboss` schema inside the same DB. All cross-cutting concerns (config, logger, errors, db client, queue client) live under `src/shared/`.

**Tech Stack:** Node 20 LTS · pnpm 9 · TypeScript 5.5+ · Next.js 15 (App Router) · Prisma 5.x · PostgreSQL 16 · pg-boss 10.x · pino 9 · Zod 3 · Vitest 2 · Docker Compose

**Reference spec:** [`docs/superpowers/specs/2026-04-15-fundacional-design.md`](../specs/2026-04-15-fundacional-design.md)

---

## File map

| Path | Purpose |
| ---- | ------- |
| `package.json` | Dependencies + scripts |
| `pnpm-lock.yaml` | Lockfile |
| `.npmrc` | pnpm settings |
| `tsconfig.json` | App TS config |
| `tsconfig.worker.json` | Worker TS config (CJS build) |
| `next.config.mjs` | Next config (basic; CSP in Plan 1c) |
| `eslint.config.mjs` | Flat ESLint config with boundary rules |
| `.prettierrc.json` | Prettier |
| `.editorconfig` | Editor settings |
| `.env.example` | All env vars documented |
| `docker-compose.yml` | Postgres 16 local |
| `scripts/dev-db.sh` | Start/stop local Postgres |
| `prisma/schema.prisma` | Full DB schema (see spec §5) |
| `prisma/seed.ts` | Seed Super Admin |
| `src/shared/config/env.ts` | Zod env parser |
| `src/shared/logger/index.ts` | pino logger + PII redaction |
| `src/shared/logger/context.ts` | AsyncLocalStorage request context |
| `src/shared/errors/index.ts` | AppError hierarchy |
| `src/shared/errors/http.ts` | errorToResponse mapper |
| `src/shared/db/client.ts` | Prisma singleton |
| `src/shared/queue/jobs.ts` | JobMap types |
| `src/shared/queue/client.ts` | pg-boss wrapper (publisher) |
| `src/shared/queue/worker.ts` | Worker factory for handlers |
| `src/worker/index.ts` | Worker entrypoint (Railway) |
| `src/worker/handlers/noop.ts` | noop job handler |
| `src/app/layout.tsx` | Root layout |
| `src/app/page.tsx` | Minimal landing |
| `src/app/api/dev/enqueue-noop/route.ts` | Dev endpoint to publish noop job |
| `src/app/api/cron/heartbeat/route.ts` | Cron sanity endpoint (stub) |
| `tests/unit/shared/config.test.ts` | Env parser tests |
| `tests/unit/shared/errors.test.ts` | Error hierarchy tests |
| `tests/unit/shared/logger.test.ts` | PII redaction test |
| `tests/integration/queue.test.ts` | Publish+consume noop round-trip |
| `vitest.config.ts` | Vitest config |
| `vitest.integration.config.ts` | Integration config (serial, Testcontainers) |

---

## Phase 0 · Project bootstrap

### Task 0.1: Initialize package + lockfile

**Files:**
- Create: `package.json`
- Create: `.npmrc`
- Create: `.editorconfig`
- Create: `README.md`

- [ ] **Step 1:** Create `.npmrc` to pin pnpm behavior:

```
engine-strict=true
auto-install-peers=true
strict-peer-dependencies=false
```

- [ ] **Step 2:** Create `.editorconfig`:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 3:** Create `package.json`:

```json
{
  "name": "padel-league",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": {
    "node": ">=20.0.0 <21.0.0",
    "pnpm": ">=9.0.0"
  },
  "scripts": {
    "dev": "next dev",
    "worker:dev": "tsx watch src/worker/index.ts",
    "build": "next build && tsc -p tsconfig.worker.json",
    "start": "next start",
    "worker:start": "node dist/worker/index.js",
    "lint": "eslint . --max-warnings 0",
    "format": "prettier --write .",
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.worker.json",
    "test:unit": "vitest run --config vitest.config.ts",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "prisma:generate": "prisma generate",
    "prisma:migrate:dev": "prisma migrate dev",
    "prisma:migrate:deploy": "prisma migrate deploy",
    "prisma:studio": "prisma studio",
    "seed": "tsx prisma/seed.ts",
    "dev:db": "bash scripts/dev-db.sh"
  }
}
```

- [ ] **Step 4:** Create minimal `README.md`:

```markdown
# PadelLeague

Aplicación web privada para gestionar ligas de pádel.

## Setup

See [docs/deployment.md](docs/deployment.md) and [docs/runbook.md](docs/runbook.md).

## Status

Plan 1a (Foundations) in progress.
```

- [ ] **Step 5:** Run `pnpm install` to create `pnpm-lock.yaml`. Expect: lockfile created, 0 deps installed yet.

- [ ] **Step 6:** Commit.

```bash
git add package.json .npmrc .editorconfig README.md pnpm-lock.yaml
git commit -m "chore: initialize pnpm workspace with Node 20 + pnpm 9"
```

---

### Task 0.2: Install TypeScript + Next.js 15

**Files:**
- Modify: `package.json` (deps)
- Create: `tsconfig.json`
- Create: `tsconfig.worker.json`
- Create: `next-env.d.ts`
- Create: `next.config.mjs`

- [ ] **Step 1:** Install runtime + dev deps. Run:

```bash
pnpm add next@^15 react@^18 react-dom@^18
pnpm add -D typescript@^5.5 @types/react@^18 @types/react-dom@^18 @types/node@^20 tsx@^4
```

Expected: dependencies installed, `package.json` updated.

- [ ] **Step 2:** Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "dist", "src/worker/**/*"]
}
```

- [ ] **Step 3:** Create `tsconfig.worker.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "dist",
    "noEmit": false,
    "jsx": "react",
    "plugins": []
  },
  "include": ["src/worker/**/*.ts", "src/shared/**/*.ts"],
  "exclude": ["node_modules", "**/*.tsx"]
}
```

- [ ] **Step 4:** Create `next-env.d.ts`:

```typescript
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 5:** Create minimal `next.config.mjs`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
```

- [ ] **Step 6:** Run `pnpm typecheck`. Expected: no errors.

- [ ] **Step 7:** Commit.

```bash
git add package.json pnpm-lock.yaml tsconfig.json tsconfig.worker.json next-env.d.ts next.config.mjs
git commit -m "chore: add TypeScript strict + Next.js 15 App Router"
```

---

### Task 0.3: ESLint flat config + Prettier + boundary rules

**Files:**
- Create: `eslint.config.mjs`
- Create: `.prettierrc.json`
- Create: `.prettierignore`

- [ ] **Step 1:** Install:

```bash
pnpm add -D eslint@^9 @eslint/js typescript-eslint eslint-config-next eslint-plugin-boundaries prettier@^3
```

- [ ] **Step 2:** Create `eslint.config.mjs`:

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import next from 'eslint-config-next';
import boundaries from 'eslint-plugin-boundaries';

export default tseslint.config(
  { ignores: ['.next/**', 'dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...next,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'app',              pattern: 'src/app/**' },
        { type: 'shared',           pattern: 'src/shared/**' },
        { type: 'module-domain',    pattern: 'src/modules/*/domain/**' },
        { type: 'module-app',       pattern: 'src/modules/*/application/**' },
        { type: 'module-infra',     pattern: 'src/modules/*/infrastructure/**' },
        { type: 'module-present',   pattern: 'src/modules/*/presentation/**' },
        { type: 'module-public',    pattern: 'src/modules/*/index.ts' },
        { type: 'worker',           pattern: 'src/worker/**' },
        { type: 'tests',            pattern: 'tests/**' },
      ],
      'boundaries/ignore': ['**/*.test.ts', '**/*.spec.ts'],
    },
    rules: {
      // App imports from modules only via each module's public facade (module-public =
      // src/modules/<mod>/index.ts). Tighter than spec §6.2's table reading but aligned
      // with its footnote: "La comunicación entre módulos pasa por el index.ts".
      //
      // eslint-plugin-boundaries v6 uses object-based selectors. Rule name: `dependencies`.
      // `from` takes `{ type }` directly; `allow` entries are wrapped with `to: { type }`.
      'boundaries/dependencies': ['error', {
        default: 'disallow',
        rules: [
          { from: { type: 'app' },           allow: [{ to: { type: 'shared' } }, { to: { type: 'module-public' } }, { to: { type: 'module-present' } }] },
          { from: { type: 'worker' },        allow: [{ to: { type: 'shared' } }, { to: { type: 'module-public' } }] },
          { from: { type: 'shared' },        allow: [{ to: { type: 'shared' } }] },
          { from: { type: 'module-domain' }, allow: [{ to: { type: 'module-domain' } }] },
          { from: { type: 'module-app' },    allow: [{ to: { type: 'module-app' } }, { to: { type: 'module-domain' } }, { to: { type: 'shared' } }] },
          { from: { type: 'module-infra' },  allow: [{ to: { type: 'module-infra' } }, { to: { type: 'module-app' } }, { to: { type: 'module-domain' } }, { to: { type: 'shared' } }] },
          { from: { type: 'module-present' },allow: [{ to: { type: 'module-present' } }, { to: { type: 'module-app' } }, { to: { type: 'module-domain' } }, { to: { type: 'shared' } }] },
          { from: { type: 'module-public' }, allow: [{ to: { type: 'module-app' } }, { to: { type: 'module-domain' } }, { to: { type: 'module-present' } }, { to: { type: 'shared' } }] },
          { from: { type: 'tests' },         allow: [{ to: { type: 'app' } }, { to: { type: 'shared' } }, { to: { type: 'module-public' } }, { to: { type: 'module-domain' } }, { to: { type: 'module-app' } }, { to: { type: 'module-infra' } }, { to: { type: 'module-present' } }, { to: { type: 'worker' } }, { to: { type: 'tests' } }] },
        ],
      }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
);
```

- [ ] **Step 3:** Create `.prettierrc.json`:

```json
{
  "semi": true,
  "trailingComma": "all",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

- [ ] **Step 4:** Create `.prettierignore`:

```
.next
dist
node_modules
coverage
pnpm-lock.yaml
prisma/migrations
```

- [ ] **Step 5:** Run `pnpm lint`. Expected: passes with 0 warnings (there's no code yet).

- [ ] **Step 6:** Commit.

```bash
git add eslint.config.mjs .prettierrc.json .prettierignore package.json pnpm-lock.yaml
git commit -m "chore: add ESLint flat config + Prettier + module boundary rules"
```

---

### Task 0.4: Directory scaffold + placeholder pages

**Files:**
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/shared/.gitkeep`
- Create: `src/modules/.gitkeep`
- Create: `src/worker/.gitkeep`
- Create: `tests/unit/.gitkeep`
- Create: `tests/integration/.gitkeep`
- Create: `tests/e2e/.gitkeep`

- [ ] **Step 1:** Create `src/app/globals.css`:

```css
html, body {
  padding: 0;
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

- [ ] **Step 2:** Create `src/app/layout.tsx`:

```tsx
import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'PadelLeague',
  description: 'Gestión privada de ligas de pádel',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3:** Create `src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main style={{ padding: '2rem' }}>
      <h1>PadelLeague</h1>
      <p>Plan 1a · Foundations.</p>
    </main>
  );
}
```

- [ ] **Step 4:** Create `.gitkeep` files for empty directories:

```bash
mkdir -p src/shared src/modules src/worker tests/unit tests/integration tests/e2e
touch src/shared/.gitkeep src/modules/.gitkeep src/worker/.gitkeep tests/unit/.gitkeep tests/integration/.gitkeep tests/e2e/.gitkeep
```

- [ ] **Step 5:** Run `pnpm dev` → open `http://localhost:3000`. Expected: page renders "PadelLeague · Plan 1a · Foundations."

- [ ] **Step 6:** Stop dev server (`Ctrl+C`) and commit.

```bash
git add src tests
git commit -m "feat(app): scaffold directory tree + landing page"
```

---

## Phase 1 · Configuration + error infrastructure

### Task 1.1: Env parser with Zod (fail-fast)

**Files:**
- Create: `src/shared/config/env.ts`
- Create: `.env.example`
- Create: `tests/unit/shared/config.test.ts`

- [ ] **Step 1:** Install Zod and testing libs:

```bash
pnpm add zod
pnpm add -D vitest@^2 @vitest/coverage-v8
```

- [ ] **Step 2:** Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: { reporter: ['text', 'lcov'] },
  },
});
```

- [ ] **Step 3:** Write failing test `tests/unit/shared/config.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseEnv } from '@/shared/config/env';

describe('parseEnv', () => {
  const valid = {
    NODE_ENV: 'test',
    APP_URL: 'http://localhost:3000',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgresql://u:p@h:5432/db',
    DIRECT_URL: 'postgresql://u:p@h:5432/db',
    NEXTAUTH_URL: 'http://localhost:3000',
    NEXTAUTH_SECRET: 'a'.repeat(44),
    ENCRYPTION_KEY: 'b'.repeat(44),
    RESEND_API_KEY: 're_test',
    RESEND_FROM_EMAIL: 'noreply@example.com',
    AI_PROVIDER: 'claude',
    ANTHROPIC_API_KEY: 'sk-ant-test',
    OPENAI_API_KEY: 'sk-test',
    AI_MODEL_CLAUDE: 'claude-haiku-4-5-20251001',
    AI_MODEL_OPENAI: 'gpt-4o-mini',
    CRON_SECRET: 'c'.repeat(44),
    FEATURE_2FA: 'false',
    FEATURE_AI_COMMENTARY: 'true',
    FEATURE_INDEPENDENT_MATCHES: 'true',
    WORKER_CONCURRENCY: '4',
  };

  it('parses a valid environment', () => {
    const env = parseEnv(valid);
    expect(env.NODE_ENV).toBe('test');
    expect(env.WORKER_CONCURRENCY).toBe(4);
    expect(env.FEATURE_2FA).toBe(false);
    expect(env.AI_PROVIDER).toBe('claude');
  });

  it('throws when a required var is missing', () => {
    const { DATABASE_URL: _, ...incomplete } = valid;
    expect(() => parseEnv(incomplete)).toThrow(/DATABASE_URL/);
  });

  it('rejects invalid AI_PROVIDER', () => {
    expect(() => parseEnv({ ...valid, AI_PROVIDER: 'bard' })).toThrow();
  });

  it('coerces WORKER_CONCURRENCY to number', () => {
    const env = parseEnv({ ...valid, WORKER_CONCURRENCY: '8' });
    expect(env.WORKER_CONCURRENCY).toBe(8);
    expect(typeof env.WORKER_CONCURRENCY).toBe('number');
  });
});
```

- [ ] **Step 4:** Run test — expect fail (module missing).

```bash
pnpm test:unit tests/unit/shared/config.test.ts
```

- [ ] **Step 5:** Create `src/shared/config/env.ts`:

```typescript
import { z } from 'zod';

const booleanString = z
  .union([z.literal('true'), z.literal('false')])
  .transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  APP_URL: z.string().url(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),

  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
  ENCRYPTION_KEY_PREVIOUS: z.string().min(32).optional(),

  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email(),
  EMAIL_REPLY_TO: z.string().email().optional(),

  AI_PROVIDER: z.enum(['claude', 'openai']),
  ANTHROPIC_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  AI_MODEL_CLAUDE: z.string().min(1),
  AI_MODEL_OPENAI: z.string().min(1),

  SENTRY_DSN: z.string().url().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),

  CRON_SECRET: z.string().min(32),

  FEATURE_2FA: booleanString.default('false'),
  FEATURE_AI_COMMENTARY: booleanString.default('true'),
  FEATURE_INDEPENDENT_MATCHES: booleanString.default('true'),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),

  SEED_SUPERADMIN_EMAIL: z.string().email().optional(),
  SEED_SUPERADMIN_PASSWORD: z.string().min(10).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return result.data;
}

let cached: Env | undefined;
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
```

- [ ] **Step 6:** Run tests — expect pass.

```bash
pnpm test:unit tests/unit/shared/config.test.ts
```

- [ ] **Step 7:** Create `.env.example` (full list, see spec §10 for reference):

```
NODE_ENV=development
APP_URL=http://localhost:3000
LOG_LEVEL=debug

DATABASE_URL=postgresql://padel:padel@localhost:5432/padel_league?schema=public
DIRECT_URL=postgresql://padel:padel@localhost:5432/padel_league?schema=public

NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=
ENCRYPTION_KEY=
ENCRYPTION_KEY_PREVIOUS=

RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@example.com
EMAIL_REPLY_TO=soporte@example.com

AI_PROVIDER=claude
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
AI_MODEL_CLAUDE=claude-haiku-4-5-20251001
AI_MODEL_OPENAI=gpt-4o-mini

SENTRY_DSN=
SENTRY_AUTH_TOKEN=

CRON_SECRET=

FEATURE_2FA=false
FEATURE_AI_COMMENTARY=true
FEATURE_INDEPENDENT_MATCHES=true

WORKER_CONCURRENCY=4

SEED_SUPERADMIN_EMAIL=admin@example.com
SEED_SUPERADMIN_PASSWORD=
```

- [ ] **Step 8:** Commit.

```bash
git add .env.example src/shared/config tests/unit/shared/config.test.ts vitest.config.ts package.json pnpm-lock.yaml
git commit -m "feat(config): Zod env parser with fail-fast validation"
```

---

### Task 1.2: AppError hierarchy

**Files:**
- Create: `src/shared/errors/index.ts`
- Create: `tests/unit/shared/errors.test.ts`

- [ ] **Step 1:** Write failing test `tests/unit/shared/errors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  AppError,
  DomainError,
  ValidationError,
  NotFoundError,
  AuthorizationError,
  AuthenticationError,
  ConflictError,
  RateLimitError,
  InvalidTokenError,
  InfrastructureError,
} from '@/shared/errors';

describe('AppError hierarchy', () => {
  it('DomainError has code and 422', () => {
    const e = new DomainError('MATCH_NOT_VALID', 'Bad sets');
    expect(e).toBeInstanceOf(AppError);
    expect(e.code).toBe('MATCH_NOT_VALID');
    expect(e.httpStatus).toBe(422);
  });

  it.each([
    [ValidationError, 400],
    [NotFoundError, 404],
    [AuthorizationError, 403],
    [AuthenticationError, 401],
    [ConflictError, 409],
    [RateLimitError, 429],
    [InvalidTokenError, 400],
    [InfrastructureError, 500],
  ])('%s maps to %d', (Cls, status) => {
    const e = new Cls('CODE', 'msg');
    expect(e.httpStatus).toBe(status);
    expect(e).toBeInstanceOf(AppError);
  });

  it('captures context', () => {
    const e = new NotFoundError('USER_NOT_FOUND', 'No user', { userId: '123' });
    expect(e.context).toEqual({ userId: '123' });
  });

  it('is distinguishable via instanceof', () => {
    const e = new ValidationError('X', 'x');
    expect(e instanceof AppError).toBe(true);
    expect(e instanceof DomainError).toBe(false);
  });
});
```

- [ ] **Step 2:** Run — expect fail.

- [ ] **Step 3:** Create `src/shared/errors/index.ts`:

```typescript
export abstract class AppError extends Error {
  abstract readonly httpStatus: number;
  constructor(
    public readonly code: string,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DomainError extends AppError { readonly httpStatus = 422; }
export class ValidationError extends AppError { readonly httpStatus = 400; }
export class NotFoundError extends AppError { readonly httpStatus = 404; }
export class AuthorizationError extends AppError { readonly httpStatus = 403; }
export class AuthenticationError extends AppError { readonly httpStatus = 401; }
export class ConflictError extends AppError { readonly httpStatus = 409; }
export class RateLimitError extends AppError { readonly httpStatus = 429; }
export class InvalidTokenError extends AppError { readonly httpStatus = 400; }
export class InfrastructureError extends AppError { readonly httpStatus = 500; }

export function isExpectedError(err: unknown): err is AppError {
  return (
    err instanceof DomainError ||
    err instanceof ValidationError ||
    err instanceof NotFoundError ||
    err instanceof AuthorizationError ||
    err instanceof AuthenticationError ||
    err instanceof ConflictError ||
    err instanceof RateLimitError ||
    err instanceof InvalidTokenError
  );
}
```

- [ ] **Step 4:** Run — expect pass.

- [ ] **Step 5:** Commit.

```bash
git add src/shared/errors tests/unit/shared/errors.test.ts
git commit -m "feat(errors): AppError hierarchy with HTTP status mapping"
```

---

### Task 1.3: HTTP error response mapper

**Files:**
- Create: `src/shared/errors/http.ts`
- Create: `tests/unit/shared/http-errors.test.ts`

- [ ] **Step 1:** Write failing test `tests/unit/shared/http-errors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { errorToResponse } from '@/shared/errors/http';
import { DomainError, InfrastructureError } from '@/shared/errors';

describe('errorToResponse', () => {
  it('maps DomainError to 422 JSON body', async () => {
    const res = errorToResponse(new DomainError('MATCH_NOT_VALID', 'bad'));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ code: 'MATCH_NOT_VALID', message: 'bad' });
  });

  it('maps unknown to InfrastructureError 500 with generic message', async () => {
    const res = errorToResponse(new Error('db exploded'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.message).not.toContain('db exploded');
  });

  it('maps InfrastructureError to 500 with generic message', async () => {
    const res = errorToResponse(new InfrastructureError('DB_DOWN', 'connect timeout'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).not.toContain('connect timeout');
  });
});
```

- [ ] **Step 2:** Run — expect fail.

- [ ] **Step 3:** Create `src/shared/errors/http.ts`:

```typescript
import { AppError, isExpectedError } from '.';

export function errorToResponse(err: unknown): Response {
  if (isExpectedError(err)) {
    return jsonResponse(err.httpStatus, { code: err.code, message: err.message });
  }
  if (err instanceof AppError) {
    return jsonResponse(err.httpStatus, {
      code: 'INTERNAL_ERROR',
      message: 'Ha ocurrido un error interno. Inténtalo de nuevo.',
    });
  }
  return jsonResponse(500, {
    code: 'INTERNAL_ERROR',
    message: 'Ha ocurrido un error interno. Inténtalo de nuevo.',
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
```

- [ ] **Step 4:** Run — expect pass.

- [ ] **Step 5:** Commit.

```bash
git add src/shared/errors/http.ts tests/unit/shared/http-errors.test.ts
git commit -m "feat(errors): errorToResponse maps AppError to HTTP responses"
```

---

### Task 1.4: pino logger + PII redaction + request context

**Files:**
- Create: `src/shared/logger/index.ts`
- Create: `src/shared/logger/context.ts`
- Create: `tests/unit/shared/logger.test.ts`

- [ ] **Step 1:** Install pino:

```bash
pnpm add pino
pnpm add -D pino-pretty
```

- [ ] **Step 2:** Write failing test `tests/unit/shared/logger.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { createLogger } from '@/shared/logger';

describe('logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts sensitive fields', async () => {
    const stream = new PassThrough();
    const log = createLogger({ level: 'info', pretty: false, stream });
    const chunks: Buffer[] = [];
    stream.on('data', (c) => chunks.push(c as Buffer));

    log.info({ password: 'secret', passwordHash: 'hash', sessionToken: 'tok', safe: 'ok' }, 'hi');

    await new Promise((r) => setImmediate(r));
    const output = Buffer.concat(chunks).toString('utf8');
    expect(output).not.toContain('secret');
    expect(output).not.toContain('hash');
    expect(output).not.toContain('tok');
    expect(output).toContain('[REDACTED]');
    expect(output).toContain('ok');
  });
});
```

- [ ] **Step 3:** Run — expect fail.

- [ ] **Step 4:** Create `src/shared/logger/index.ts`:

```typescript
import pino, { type Logger, type LoggerOptions } from 'pino';

const REDACT_PATHS = [
  'password',
  'passwordHash',
  'password_hash',
  'twoFactorSecret',
  'two_factor_secret',
  'sessionToken',
  'session_token',
  'authorization',
  'cookie',
  '*.password',
  '*.passwordHash',
  '*.sessionToken',
];

export type CreateLoggerOptions = {
  level?: LoggerOptions['level'];
  pretty?: boolean;
  stream?: NodeJS.WritableStream;
};

export function createLogger(opts: CreateLoggerOptions = {}): Logger {
  const level = opts.level ?? 'info';
  const options: LoggerOptions = {
    level,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    base: { service: 'padel-league', env: process.env.NODE_ENV },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  };

  if (opts.pretty) {
    return pino({
      ...options,
      transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
    });
  }
  if (opts.stream) {
    return pino(options, opts.stream);
  }
  return pino(options);
}

let defaultLogger: Logger | undefined;
export function logger(): Logger {
  if (!defaultLogger) {
    defaultLogger = createLogger({
      level: (process.env.LOG_LEVEL as LoggerOptions['level']) ?? 'info',
      pretty: process.env.NODE_ENV === 'development',
    });
  }
  return defaultLogger;
}
```

- [ ] **Step 5:** Create `src/shared/logger/context.ts`:

```typescript
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
```

- [ ] **Step 6:** Run — expect pass.

- [ ] **Step 7:** Commit.

```bash
git add src/shared/logger tests/unit/shared/logger.test.ts package.json pnpm-lock.yaml
git commit -m "feat(logger): pino with PII redaction + AsyncLocalStorage context"
```

---

## Phase 2 · Database + Prisma

### Task 2.1: Local Postgres via Docker Compose

**Files:**
- Create: `docker-compose.yml`
- Create: `scripts/dev-db.sh`

- [ ] **Step 1:** Create `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: padel-league-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: padel
      POSTGRES_PASSWORD: padel
      POSTGRES_DB: padel_league
    ports:
      - '5432:5432'
    volumes:
      - padel_pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U padel -d padel_league']
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  padel_pg_data:
```

- [ ] **Step 2:** Create `scripts/dev-db.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-up}"

case "$ACTION" in
  up)
    docker compose up -d postgres
    echo "Waiting for Postgres to be ready..."
    until docker compose exec postgres pg_isready -U padel -d padel_league >/dev/null 2>&1; do
      sleep 1
    done
    echo "Postgres ready at localhost:5432 (db: padel_league, user: padel)"
    ;;
  down)
    docker compose down
    ;;
  reset)
    docker compose down -v
    docker compose up -d postgres
    ;;
  *)
    echo "usage: dev-db.sh [up|down|reset]"
    exit 1
    ;;
esac
```

- [ ] **Step 3:** Make executable and test:

```bash
chmod +x scripts/dev-db.sh
./scripts/dev-db.sh up
```

Expected: container starts, "Postgres ready" prints in ~5s.

- [ ] **Step 4:** Verify connection:

```bash
docker compose exec postgres psql -U padel -d padel_league -c 'SELECT 1;'
```

Expected: output `1`.

- [ ] **Step 5:** Commit.

```bash
git add docker-compose.yml scripts/dev-db.sh
git commit -m "chore(db): add Docker Compose for local Postgres 16"
```

---

### Task 2.2: Prisma setup + initial schema fragment (identity + auth)

**Files:**
- Create: `prisma/schema.prisma`
- Modify: `package.json` (add prisma dev dep)

- [ ] **Step 1:** Install Prisma:

```bash
pnpm add @prisma/client
pnpm add -D prisma
```

- [ ] **Step 2:** Create `prisma/schema.prisma` with complete schema. Copy the **full schema** from [spec §5](../specs/2026-04-15-fundacional-design.md#5-modelo-de-datos-prisma-schema). This is the single source of truth; do not paraphrase. Include:

  - All 14 enums (UserRole, LeagueMemberRole, LeagueStatus, MatchFormat, MatchStatus, MatchResultStatus, SchedulingProposalStatus, DisputeStatus, DisputeResolution, IndependentMatchStatus, JoinRequestStatus, ParticipantStatus, NotificationType, SignedTokenPurpose with `USER_INVITATION`, EmailStatus, AICommentaryProvider).
  - All models (User, Session, VerificationToken, SignedToken, RateLimitBucket, League, LeagueMember, Team, TeamMember, Match, MatchResult, Set, MatchSchedulingProposal, Dispute, MatchCommentary, IndependentMatch, IndependentMatchParticipant, IndependentMatchJoinRequest, Notification, EmailLog, AuditLog, JobDeadLetter).
  - All `@@map`, `@@index`, `@@unique`, relations as defined.
  - `generator client { provider = "prisma-client-js" previewFeatures = ["postgresqlExtensions"] }`
  - `datasource db { provider = "postgresql" url = env("DATABASE_URL") directUrl = env("DIRECT_URL") extensions = [citext, pgcrypto] }`

- [ ] **Step 3:** Set up `.env` for Prisma:

```bash
cp .env.example .env
# edit .env and set:
#   DATABASE_URL=postgresql://padel:padel@localhost:5432/padel_league?schema=public
#   DIRECT_URL=postgresql://padel:padel@localhost:5432/padel_league?schema=public
#   NEXTAUTH_SECRET=<openssl rand -base64 32>
#   ENCRYPTION_KEY=<openssl rand -base64 32>
#   CRON_SECRET=<openssl rand -base64 32>
```

Generate secrets:

```bash
openssl rand -base64 32
```

- [ ] **Step 4:** Run `pnpm prisma generate`. Expected: client generated successfully in `node_modules/.prisma/client`.

- [ ] **Step 5:** Commit.

```bash
git add prisma/schema.prisma package.json pnpm-lock.yaml
git commit -m "feat(db): add complete Prisma schema per spec §5"
```

---

### Task 2.3: Initial migration

**Files:**
- Create: `prisma/migrations/*` (generated)

- [ ] **Step 1:** Ensure Postgres is running: `./scripts/dev-db.sh up`.

- [ ] **Step 2:** Run migration:

```bash
pnpm prisma migrate dev --name init
```

Expected: migration created under `prisma/migrations/<timestamp>_init/migration.sql`, schema applied, Prisma client regenerated.

- [ ] **Step 3:** Verify schema:

```bash
docker compose exec postgres psql -U padel -d padel_league -c '\dt'
```

Expected: lists all tables (users, sessions, leagues, matches, etc.).

- [ ] **Step 4:** Verify extensions are enabled:

```bash
docker compose exec postgres psql -U padel -d padel_league -c '\dx'
```

Expected: lists `citext` and `pgcrypto`.

- [ ] **Step 5:** Commit.

```bash
git add prisma/migrations
git commit -m "feat(db): initial migration — full schema for all specs"
```

---

### Task 2.4: Prisma client singleton

**Files:**
- Create: `src/shared/db/client.ts`

- [ ] **Step 1:** Create `src/shared/db/client.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

// Reads DATABASE_URL directly from process.env — deliberately avoids the full
// `env()` parser so integration tests can use the DB client without providing
// the app's complete env (auth secrets, AI keys, etc.).

type GlobalWithPrisma = typeof globalThis & { __prisma?: PrismaClient };
const g = globalThis as GlobalWithPrisma;

function makeClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma = g.__prisma ?? makeClient();

if (process.env.NODE_ENV !== 'production') {
  g.__prisma = prisma;
}
```

- [ ] **Step 2:** Run `pnpm typecheck`. Expected: passes.

- [ ] **Step 3:** Commit.

```bash
git add src/shared/db/client.ts
git commit -m "feat(db): Prisma client singleton with dev hot-reload safe"
```

---

### Task 2.5: Seed script (creates Super Admin)

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (add `prisma.seed` field)

- [ ] **Step 1:** Install Argon2id (used to hash seed password):

```bash
pnpm add @node-rs/argon2
```

- [ ] **Step 2:** Create `prisma/seed.ts`:

```typescript
import { PrismaClient, UserRole } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

const ARGON2_OPTS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
} as const;

async function main() {
  const email = process.env.SEED_SUPERADMIN_EMAIL;
  const password = process.env.SEED_SUPERADMIN_PASSWORD;

  if (!email || !password) {
    console.log('[seed] SEED_SUPERADMIN_EMAIL/PASSWORD not set — skipping');
    return;
  }
  if (password.length < 10) {
    throw new Error('SEED_SUPERADMIN_PASSWORD must be ≥ 10 chars');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] Super admin ${email} already exists`);
    return;
  }

  const passwordHash = await hash(password, ARGON2_OPTS);

  await prisma.user.create({
    data: {
      email,
      name: 'Super Admin',
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      emailVerifiedAt: new Date(),
    },
  });

  console.log(`[seed] Created super admin ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 3:** Add seed config to `package.json`:

```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

- [ ] **Step 4:** Run seed (set env temporarily):

```bash
SEED_SUPERADMIN_EMAIL=admin@example.com SEED_SUPERADMIN_PASSWORD=TempPass1234 pnpm seed
```

Expected: `[seed] Created super admin admin@example.com`.

- [ ] **Step 5:** Verify:

```bash
docker compose exec postgres psql -U padel -d padel_league -c "SELECT email, role FROM users;"
```

Expected: one row with `admin@example.com | SUPER_ADMIN`.

- [ ] **Step 6:** Commit.

```bash
git add prisma/seed.ts package.json pnpm-lock.yaml
git commit -m "feat(db): seed script creates Super Admin"
```

---

## Phase 3 · Integration test harness (Testcontainers)

### Task 3.1: Testcontainers setup for integration tests

**Files:**
- Create: `vitest.integration.config.ts`
- Create: `tests/integration/helpers/db.ts`

- [ ] **Step 1:** Install Testcontainers:

```bash
pnpm add -D testcontainers @testcontainers/postgresql
```

- [ ] **Step 2:** Create `vitest.integration.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    globalSetup: ['./tests/integration/helpers/global-setup.ts'],
  },
});
```

- [ ] **Step 3:** Create `tests/integration/helpers/global-setup.ts`:

```typescript
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';

let container: StartedPostgreSqlContainer;

export async function setup() {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('padel_test')
    .withUsername('padel')
    .withPassword('padel')
    .start();

  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;

  execSync('pnpm prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: 'inherit',
  });
}

export async function teardown() {
  await container?.stop();
}
```

- [ ] **Step 4:** Create `tests/integration/helpers/db.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

let cached: PrismaClient | undefined;

export function testPrisma(): PrismaClient {
  cached ??= new PrismaClient();
  return cached;
}

export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;
  const names = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  if (names) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE;`);
  }
}
```

- [ ] **Step 5:** Add a sanity integration test `tests/integration/db.sanity.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testPrisma, truncateAll } from './helpers/db';

const prisma = testPrisma();

beforeAll(async () => {
  await truncateAll(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('db sanity', () => {
  it('can create and read a User', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Tester',
        passwordHash: 'hash',
        role: 'PLAYER',
      },
    });
    const found = await prisma.user.findUnique({ where: { id: user.id } });
    expect(found?.email).toBe('test@example.com');
  });
});
```

- [ ] **Step 6:** Run integration tests:

```bash
pnpm test:integration
```

Expected: Testcontainer boots, migrations apply, test passes in ~30s.

- [ ] **Step 7:** Commit.

```bash
git add vitest.integration.config.ts tests/integration package.json pnpm-lock.yaml
git commit -m "test(integration): Testcontainers + Prisma harness with sanity test"
```

---

## Phase 4 · Queue infrastructure

### Task 4.1: JobMap types + queue client

**Files:**
- Create: `src/shared/queue/jobs.ts`
- Create: `src/shared/queue/client.ts`

- [ ] **Step 1:** Install pg-boss:

```bash
pnpm add pg-boss
pnpm add -D @types/pg
```

- [ ] **Step 2:** Create `src/shared/queue/jobs.ts`:

```typescript
export type JobMap = {
  noop: { ping: string };
  'send-email': {
    template: string;
    to: string;
    data: Record<string, unknown>;
    dedupKey?: string;
  };
  'match-auto-approve-result': { matchResultId: string };
  'match-reminder': { matchId: string; kind: 'initial' | 'mid' | 'final' };
  'generate-match-commentary': { matchId: string };
  'league-finalize': { leagueId: string };
  'session-cleanup': Record<string, never>;
  'anonymize-user': { userId: string };
};

export type JobName = keyof JobMap;

export const ALL_JOB_NAMES: JobName[] = [
  'noop',
  'send-email',
  'match-auto-approve-result',
  'match-reminder',
  'generate-match-commentary',
  'league-finalize',
  'session-cleanup',
  'anonymize-user',
];
```

- [ ] **Step 3:** Create `src/shared/queue/client.ts`:

```typescript
import PgBoss from 'pg-boss';
import { logger } from '@/shared/logger';
import { currentRequestId } from '@/shared/logger/context';
import type { JobMap, JobName } from './jobs';

export type PublishOptions = {
  startAfter?: Date | string | number;
  singletonKey?: string;
  retryLimit?: number;
  expireInSeconds?: number;
};

export interface Queue {
  start(): Promise<void>;
  stop(): Promise<void>;
  publish<N extends JobName>(name: N, data: JobMap[N], opts?: PublishOptions): Promise<string | null>;
  raw(): PgBoss;
}

let instance: Queue | undefined;

export function queue(): Queue {
  if (!instance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for pg-boss');
    }
    const boss = new PgBoss({
      connectionString,
      schema: 'pgboss',
      retentionDays: 7,
    });
    boss.on('error', (err) => logger().error({ err }, 'pg-boss error'));

    instance = {
      async start() {
        await boss.start();
        logger().info('pg-boss started');
      },
      async stop() {
        await boss.stop({ graceful: true });
      },
      async publish(name, data, opts) {
        const payload = {
          ...(data as Record<string, unknown>),
          __requestId: currentRequestId(),
        };
        return boss.send(name, payload, {
          startAfter: opts?.startAfter,
          singletonKey: opts?.singletonKey,
          retryLimit: opts?.retryLimit ?? 3,
          retryBackoff: true,
          expireInSeconds: opts?.expireInSeconds,
        });
      },
      raw() {
        return boss;
      },
    };
  }
  return instance;
}
```

- [ ] **Step 4:** Run `pnpm typecheck`. Expected: passes.

- [ ] **Step 5:** Commit.

```bash
git add src/shared/queue package.json pnpm-lock.yaml
git commit -m "feat(queue): pg-boss client + typed JobMap publisher"
```

---

### Task 4.2: Worker factory for handlers

**Files:**
- Create: `src/shared/queue/worker.ts`

- [ ] **Step 1:** Create `src/shared/queue/worker.ts`:

```typescript
import type PgBoss from 'pg-boss';
import { logger } from '@/shared/logger';
import { runWithContext } from '@/shared/logger/context';
import { prisma } from '@/shared/db/client';
import type { JobMap, JobName } from './jobs';

export type Handler<N extends JobName> = (data: JobMap[N]) => Promise<void>;

type EnvelopedData<N extends JobName> = JobMap[N] & { __requestId?: string };

export async function registerHandler<N extends JobName>(
  boss: PgBoss,
  name: N,
  handler: Handler<N>,
  opts: { teamSize?: number; teamConcurrency?: number } = {},
): Promise<void> {
  await boss.work<EnvelopedData<N>>(
    name,
    { teamSize: opts.teamSize ?? 4, teamConcurrency: opts.teamConcurrency ?? 2 },
    async (jobs) => {
      for (const job of jobs) {
        const { __requestId, ...data } = job.data;
        await runWithContext({ requestId: __requestId }, async () => {
          const log = logger().child({ jobId: job.id, jobName: name });
          const started = Date.now();
          try {
            log.info({ data }, 'job.start');
            await handler(data as unknown as JobMap[N]);
            log.info({ ms: Date.now() - started }, 'job.ok');
          } catch (err) {
            log.error({ err, ms: Date.now() - started }, 'job.fail');
            throw err;
          }
        });
      }
    },
  );
}

/**
 * pg-boss v10 archives jobs that exhaust retries. To get a structured dead-letter
 * record, we hook into the `failed` event and persist a row in `JobDeadLetter`.
 * (A proper per-queue DLQ with alerting is Plan 1c work.)
 */
export function attachDeadLetterRecorder(boss: PgBoss): void {
  boss.on('failed', (event) => {
    const payload = event.job?.data ?? {};
    prisma.jobDeadLetter
      .create({
        data: {
          jobName: event.job?.name ?? 'unknown',
          jobId: event.job?.id ?? 'unknown',
          payload: payload as object,
          error: event.error instanceof Error ? event.error.message : String(event.error ?? ''),
        },
      })
      .catch((err) => logger().error({ err }, 'dead-letter.persist.fail'));
    logger().error({ jobId: event.job?.id, jobName: event.job?.name }, 'job.dead-letter');
  });
}
```

- [ ] **Step 2:** Run `pnpm typecheck`. Expected: passes. If the `failed` event payload shape differs from what's assumed above (pg-boss v10 event types), adjust by reading the installed `pg-boss` types (`node_modules/pg-boss/types/*.d.ts`) — do **not** cast blindly. Keep the resulting shape inside `attachDeadLetterRecorder` only.

- [ ] **Step 3:** Commit.

```bash
git add src/shared/queue/worker.ts
git commit -m "feat(queue): handler registration + dead-letter recorder on failed event"
```

---

### Task 4.3: noop handler

**Files:**
- Create: `src/worker/handlers/noop.ts`

- [ ] **Step 1:** Create `src/worker/handlers/noop.ts`:

```typescript
import { logger } from '@/shared/logger';
import type { JobMap } from '@/shared/queue/jobs';

export async function noopHandler(data: JobMap['noop']): Promise<void> {
  logger().info({ ping: data.ping }, 'noop.received');
}
```

- [ ] **Step 2:** Commit.

```bash
git add src/worker/handlers/noop.ts
git commit -m "feat(worker): add noop handler"
```

---

### Task 4.4: Worker entrypoint

**Files:**
- Create: `src/worker/index.ts`

- [ ] **Step 1:** Create `src/worker/index.ts`:

```typescript
import { env } from '@/shared/config/env';
import { logger } from '@/shared/logger';
import { queue } from '@/shared/queue/client';
import { registerHandler, attachDeadLetterRecorder } from '@/shared/queue/worker';
import { noopHandler } from './handlers/noop';

async function main() {
  env();
  const log = logger();
  log.info('worker.booting');

  const q = queue();
  await q.start();
  const boss = q.raw();
  attachDeadLetterRecorder(boss);

  await registerHandler(boss, 'noop', noopHandler);

  log.info('worker.ready');

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'worker.shutdown.start');
    try {
      await q.stop();
      log.info('worker.shutdown.ok');
      process.exit(0);
    } catch (err) {
      log.error({ err }, 'worker.shutdown.err');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger().fatal({ err }, 'worker.fatal');
  process.exit(1);
});
```

- [ ] **Step 2:** Compile worker:

```bash
pnpm build
```

Expected: `dist/worker/index.js` exists, no TS errors.

- [ ] **Step 3:** Commit.

```bash
git add src/worker/index.ts
git commit -m "feat(worker): entrypoint with pg-boss startup + graceful shutdown"
```

---

### Task 4.5: Dev endpoint to enqueue a noop job

**Files:**
- Create: `src/app/api/dev/enqueue-noop/route.ts`

- [ ] **Step 1:** Create `src/app/api/dev/enqueue-noop/route.ts`:

```typescript
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
```

- [ ] **Step 2:** Add note to `.env.example`:

```
# Dev-only: POST http://localhost:3000/api/dev/enqueue-noop to push a noop job
```

- [ ] **Step 3:** Commit.

```bash
git add src/app/api/dev .env.example
git commit -m "feat(dev): endpoint to enqueue noop jobs for manual smoke testing"
```

---

### Task 4.6: Integration test — publish + consume noop round-trip

**Files:**
- Create: `tests/integration/queue.test.ts`

- [ ] **Step 1:** Write failing test `tests/integration/queue.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import PgBoss from 'pg-boss';
import { registerHandler } from '@/shared/queue/worker';

describe('pg-boss queue', () => {
  let boss: PgBoss;

  beforeAll(async () => {
    boss = new PgBoss({ connectionString: process.env.DATABASE_URL, schema: 'pgboss_test' });
    await boss.start();
  });

  afterAll(async () => {
    await boss.stop({ graceful: true });
  });

  it('round-trips a noop job through publish + consume', async () => {
    const received: Array<{ ping: string }> = [];
    await registerHandler(boss, 'noop', async (data) => {
      received.push(data);
    });

    await boss.send('noop', { ping: 'abc', __requestId: 'req-xyz' });

    const deadline = Date.now() + 10_000;
    while (received.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ ping: 'abc' });
  });
});
```

- [ ] **Step 2:** Run `pnpm test:integration`. Expected: passes in ~15s.

- [ ] **Step 3:** Commit.

```bash
git add tests/integration/queue.test.ts
git commit -m "test(integration): noop job round-trip via pg-boss"
```

---

## Phase 5 · Heartbeat endpoint + manual smoke test

### Task 5.1: Heartbeat endpoint stub

**Files:**
- Create: `src/app/api/cron/heartbeat/route.ts`

- [ ] **Step 1:** Create `src/app/api/cron/heartbeat/route.ts`:

```typescript
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
```

- [ ] **Step 2:** Commit.

```bash
git add src/app/api/cron/heartbeat
git commit -m "feat(cron): heartbeat endpoint (publishes noop with bearer auth)"
```

---

### Task 5.2: Manual smoke test — web + worker + DB round-trip

This task is **manual validation**, no code. Produces evidence that the plan's acceptance criteria are met.

- [ ] **Step 1:** Start Postgres: `./scripts/dev-db.sh up`.

- [ ] **Step 2:** Terminal A — start web:

```bash
pnpm dev
```

Expected: Next.js boots on `localhost:3000`.

- [ ] **Step 3:** Terminal B — start worker:

```bash
pnpm worker:dev
```

Expected: logs `worker.booting`, `pg-boss started`, `worker.ready`.

- [ ] **Step 4:** Terminal C — enqueue a job:

```bash
curl -X POST http://localhost:3000/api/dev/enqueue-noop
```

Expected: JSON response `{"id":"<uuid>"}`. Worker log shows `noop.received` within ~1s with the same ping value.

- [ ] **Step 5:** Test heartbeat endpoint:

```bash
CRON_SECRET=$(grep '^CRON_SECRET=' .env | cut -d= -f2)
curl -X POST http://localhost:3000/api/cron/heartbeat \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected: `{"ok":true,"jobId":"..."}`. Worker log shows `noop.received` with `heartbeat-` prefix.

- [ ] **Step 6:** Test unauthorized:

```bash
curl -X POST http://localhost:3000/api/cron/heartbeat -H "Authorization: Bearer wrong" -i
```

Expected: HTTP 401 with `{"code":"UNAUTHORIZED"}`.

- [ ] **Step 7:** Record evidence in commit message.

```bash
git commit --allow-empty -m "chore: smoke test passed — web → queue → worker round-trip verified

Evidence:
- pnpm dev + pnpm worker:dev both boot without errors
- POST /api/dev/enqueue-noop returns job id; worker logs noop.received
- POST /api/cron/heartbeat with bearer publishes + consumes noop
- Unauthorized heartbeat returns 401"
```

---

## Phase 6 · Self-review + closeout

### Task 6.1: Run all verification gates

- [ ] **Step 1:** Lint:

```bash
pnpm lint
```

Expected: 0 warnings, 0 errors.

- [ ] **Step 2:** Typecheck:

```bash
pnpm typecheck
```

Expected: no errors (both `tsconfig.json` and `tsconfig.worker.json`).

- [ ] **Step 3:** Unit tests:

```bash
pnpm test:unit
```

Expected: all pass. Coverage report inspected.

- [ ] **Step 4:** Integration tests:

```bash
pnpm test:integration
```

Expected: all pass in ≤60s.

- [ ] **Step 5:** Build:

```bash
pnpm build
```

Expected: `next build` succeeds, `dist/worker/index.js` exists.

- [ ] **Step 6:** If any gate fails, fix root cause (not symptom). Commit any fixes.

---

### Task 6.2: Update README with setup instructions

**Files:**
- Modify: `README.md`

- [ ] **Step 1:** Replace `README.md` with full local-dev instructions:

```markdown
# PadelLeague

Aplicación web privada para gestionar ligas de pádel. Single-tenant, multi-liga.

## Requisitos

- Node 20.x LTS
- pnpm 9.x
- Docker Desktop (Postgres local)

## Setup local

```bash
pnpm install
cp .env.example .env
# rellenar NEXTAUTH_SECRET, ENCRYPTION_KEY, CRON_SECRET con `openssl rand -base64 32`
# rellenar SEED_SUPERADMIN_EMAIL + SEED_SUPERADMIN_PASSWORD para bootstrap

./scripts/dev-db.sh up
pnpm prisma migrate dev
pnpm seed
```

## Ejecutar

En dos terminales:

```bash
pnpm dev           # web en http://localhost:3000
pnpm worker:dev    # worker pg-boss
```

Smoke test: `curl -X POST http://localhost:3000/api/dev/enqueue-noop` — logs del worker deben mostrar `noop.received`.

## Testing

```bash
pnpm test:unit
pnpm test:integration
pnpm typecheck
pnpm lint
```

## Documentación

- [Spec fundacional](docs/superpowers/specs/2026-04-15-fundacional-design.md)
- [Plan 1a](docs/superpowers/plans/2026-04-15-spec1a-foundations-plan.md)

## Estado

Plan 1a (Foundations) — completado. Siguiente: Plan 1b (Auth + GDPR).
```

- [ ] **Step 2:** Commit.

```bash
git add README.md
git commit -m "docs: complete README with local setup instructions"
```

---

### Task 6.3: Tag plan 1a complete

- [ ] **Step 1:** Tag:

```bash
git tag -a plan-1a-foundations-complete -m "Plan 1a (Foundations) complete: bootstrap + DB + queue + worker round-trip verified"
```

- [ ] **Step 2:** Print tag summary:

```bash
git log --oneline plan-1a-foundations-complete~20..plan-1a-foundations-complete
```

---

## Acceptance criteria for Plan 1a

All must be checked before moving to Plan 1b:

- [ ] `pnpm install` completes without errors.
- [ ] `./scripts/dev-db.sh up` starts Postgres and reports ready.
- [ ] `pnpm prisma migrate dev` applies the full schema; all 22 tables visible via `\dt`.
- [ ] `citext` and `pgcrypto` extensions installed.
- [ ] `pnpm seed` creates a Super Admin row in `users`.
- [ ] `pnpm dev` boots Next.js on `:3000` with landing page rendering.
- [ ] `pnpm worker:dev` boots worker, logs `worker.ready`.
- [ ] `POST /api/dev/enqueue-noop` returns a job id; worker logs `noop.received` within 1s.
- [ ] `POST /api/cron/heartbeat` with correct bearer returns `{ok:true}`; with wrong bearer returns 401.
- [ ] `pnpm lint` + `pnpm typecheck` + `pnpm test:unit` + `pnpm test:integration` + `pnpm build` all green.
- [ ] Integration test `queue.test.ts` round-trips a noop job.
- [ ] PII redaction test passes (no `password`, `sessionToken`, `passwordHash` leak to logs).
- [ ] README documents setup end-to-end.

## Out of scope (deferred to Plan 1b / 1c)

- Argon2 password service + hashing tests — Plan 1b
- SignedTokenService — Plan 1b
- Auth.js setup + session management — Plan 1b
- User invitation + login + password reset flows — Plan 1b
- Profile + admin invite UI — Plan 1b
- GDPR export + anonymize endpoints — Plan 1b
- Sentry, CSP, security headers — Plan 1c
- Playwright E2E — Plan 1c
- GitHub Actions CI — Plan 1c
- Vercel + Railway deployment — Plan 1c
