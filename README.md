# PadelLeague

Aplicación web privada para gestionar ligas de pádel. Single-tenant, multi-liga.

## Requisitos

- Node 20+ LTS (testado en Node 24)
- pnpm 9.x
- Docker Desktop (Postgres local)

## Setup local

```bash
pnpm install
cp .env.example .env
# Rellenar en .env:
#   NEXTAUTH_SECRET, ENCRYPTION_KEY, CRON_SECRET  →  openssl rand -base64 32
#   SEED_SUPERADMIN_EMAIL + SEED_SUPERADMIN_PASSWORD  (≥ 10 chars)

./scripts/dev-db.sh up          # inicia Postgres 16 en Docker
pnpm prisma migrate deploy      # aplica el schema completo
pnpm seed                       # crea el Super Admin
```

## Ejecutar

En dos terminales:

```bash
pnpm dev           # web en http://localhost:3000
pnpm worker:dev    # worker pg-boss
```

Smoke test: `curl -X POST http://localhost:3000/api/dev/enqueue-noop`
Los logs del worker deben mostrar `noop.received` en ~1s.

## Testing

```bash
pnpm test:unit          # unit tests (Vitest)
pnpm test:integration   # integration tests (Testcontainers + Postgres)
pnpm typecheck
pnpm lint
```

## Build

```bash
pnpm build   # Next.js + worker CJS bundle
```

## Documentación

- [Spec fundacional](docs/superpowers/specs/2026-04-15-fundacional-design.md)
- [Plan 1a — Foundations](docs/superpowers/plans/2026-04-15-spec1a-foundations-plan.md)

## Estado

Plan 1a (Foundations) — completado.
Siguiente: Plan 1b (Auth + GDPR).
