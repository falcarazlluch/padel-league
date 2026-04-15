# Spec 1 — Fundacional (PadelLeague)

- **Fecha:** 2026-04-15
- **Estado:** Aprobada (brainstorming completado)
- **Autor:** Arquitecto + usuario
- **Versión:** 1.0
- **Idioma de la aplicación:** Español (es-ES)
- **Ámbito geográfico:** España (GDPR + LOPDGDD aplicables)

## 1. Contexto y propósito

PadelLeague es una aplicación web privada para gestionar ligas de pádel. El brief inicial describe 7 subsistemas (auth, ligas, partidos, notificaciones, partidos independientes, IA, hardening) con calidad de producción. Para mantener rigor de diseño y revisión, el proyecto se descompone en 7 specs secuenciales:

| Spec | Tema | Depende de |
| ---- | ---- | ---------- |
| **1** | **Fundacional** (este doc) | — |
| 2 | Ligas: fixtures, standings, desempates, estadísticas | 1 |
| 3 | Partidos: resultados, validación con enlace firmado, flujo completo | 1, 2 |
| 4 | Notificaciones: jobs reales, recordatorios, auto-aprobación 7 días | 1, 3 |
| 5 | Partidos independientes | 1, 4 |
| 6 | IA: prompts y generación de comentarios | 1, 3 |
| 7 | Hardening: E2E completo, dashboards ops, observabilidad avanzada, deploy HA | todas |

**Objetivo de Spec 1:** establecer las fundaciones técnicas sobre las que las 6 specs restantes construyen features sin tocar arquitectura. Al final de Spec 1 el proyecto compila, arranca local, tiene schema completo migrado en Postgres, login funcional, worker consumiendo jobs, logs estructurados, Sentry conectado, CI verde y despliegue a Vercel + Railway documentado y probado.

## 2. Decisiones arquitectónicas (resumen de brainstorming)

| # | Decisión | Justificación |
| -- | -------- | ------------- |
| D1 | **Monolito modular** en single package Next.js | Simple para MVP; boundaries por módulo de dominio fuerzan acoplamiento bajo; extracción a microservicios posible en el futuro sin refactor violento. |
| D2 | **Next.js App Router** (Vercel) + **worker Node separado** (Railway) | Vercel serverless no sostiene procesos largos para pg-boss. Worker en Railway lo resuelve trivialmente. |
| D3 | **Postgres en Railway** (único almacén durable) | Evita Redis; pg-boss usa Postgres para cola; rate limiting usa tabla Postgres. Un solo sistema de datos que gestionar. |
| D4 | **pg-boss** para cola durable + Vercel Cron para triggers periódicos | Delays nativos (7 días), reintentos, dead-letter. Sin Redis. |
| D5 | **Single-tenant, multi-liga** | No hay concepto de "club" como entidad; una instalación sirve a una comunidad con varias ligas coexistiendo. |
| D6 | **Auth.js v5 + Credentials + Argon2id + DB sessions** | Revocación instantánea; Argon2id resiste GPU attacks; schema 2FA preparado con feature flag OFF. |
| D7 | **IA abstraída con flag de config (`AI_PROVIDER=claude\|openai`)** | Portabilidad entre proveedores sin recompilar; cada provider implementa un port común. |
| D8 | **Notificaciones in-app por polling (~30s)** con Tanstack Query | Suficiente para el dominio; evita SSE/WebSockets; email vía Resend cubre urgencia real. |
| D9 | **Sets como entidad separada de Match**; `MatchResult` separado también | Soporta 2–5 sets sin columnas nullables; auditabilidad completa de propuestas de resultado (rechazadas, reaceptadas). |
| D10 | **`AuditLog` genérico** `(actor, action, targetType, targetId, metadata)` | Único mecanismo de auditoría, indexable, extensible sin migraciones por evento. |
| D11 | **SignedToken genérico** reutilizable para validación de resultado, reset password, invitaciones | Un único patrón one-use + expiración auditable. |
| D12 | **Español única lengua**; función `t()` trivial sin framework i18n | No pagar complejidad de i18n para una audiencia ES. |
| D13 | **GDPR: anonimización en lugar de borrado**; `/api/me/export` para portabilidad | Preserva integridad de históricos; cumple derecho al olvido. |

## 3. Reglas de dominio (congeladas)

### 3.1 Partido

- Duración real: ~1.5h. Se juegan 2–5 sets según dé tiempo.
- Cada set tiene `gamesA`, `gamesB`. Ganador del set = más juegos. Si empate en juegos (p. ej., tiempo agotado a 3-3), el set **no tiene ganador** (set empatado).
- Ganador del partido = más sets ganados. Si empate en sets → **partido empatado**.
- Puntos: victoria = 3, empate = 1, derrota = 0.
- Restricción: no se permite guardar un partido con todos los sets empatados y 0 sets ganados por cada lado (al menos 1 set debe tener ganador, salvo que el partido sea explícitamente marcado como "no jugado" por expiración).
- Número de sets configurable por liga (`matchFormat`: `BEST_OF_3 | BEST_OF_5 | FLEXIBLE`); el dominio valida coherencia al guardar.

### 3.2 Expiración y deadlines

- Cada partido tiene `deadlineAt` (orientativo/blando) — permite a los equipos negociar fecha dentro de ese rango.
- Al llegar `league.endDate`, todos los partidos no `CONFIRMED`/`ADMIN_RESOLVED` → `EXPIRED_UNPLAYED` con derrota para ambos equipos (0 pts cada uno). Procesado por job idempotente `league-finalize`.
- Si un equipo es rechazado sistemáticamente al proponer fechas, puede abrir `Dispute`. El admin de liga media y decide (enum de resolución en §5.7).

### 3.3 Clasificación y desempates

Secuencia de desempate (aplicada hasta decidir; si persiste → partido de desempate programado por admin):

1. Puntos totales.
2. Enfrentamiento directo — **solo si hay exactamente 2 equipos empatados**; si hay 3+, se salta este criterio.
3. Diferencia de sets (sets a favor − sets en contra).
4. Diferencia de juegos (juegos a favor − juegos en contra).
5. Sets ganados (valor absoluto).
6. Si persiste → se crea un `Match` con flag `isTiebreaker = true` entre los equipos empatados; el admin lo programa manualmente.

**Nota:** el algoritmo completo de standings se implementa en Spec 2. Spec 1 deja el schema preparado.

### 3.4 Scheduling entre equipos

- Un miembro del equipo A propone `proposedDate` → se notifica al equipo B (in-app + email).
- Equipo B acepta → `scheduledAt` queda fijado; ambos notificados.
- Equipo B rechaza → se notifica a A. A puede proponer otra fecha.
- Si B rechaza 2+ propuestas de A sin proponer contra-fecha → la UI de A habilita el botón "Escalar a admin de liga" (abre Dispute con `evidenceSnapshot` auto-adjunto del histórico de propuestas).
- Histórico completo de propuestas (`MatchSchedulingProposal`) persistido para evidencia.

### 3.5 Máquina de estados del Match

```
                   ┌──────────────┐
                   │   SCHEDULED  │  ← creado al generar fixtures
                   └──────┬───────┘
                          │ proposeDate
                          ▼
                   ┌──────────────┐
            ┌─────►│ DATE_PROPOSED│◄──── counterPropose
            │      └──────┬───────┘
  rejectDate│             │ acceptDate
            │             ▼
            │      ┌──────────────┐
            └──────│DATE_CONFIRMED│
                   └──────┬───────┘
                          │ submitResult
                          ▼
                   ┌─────────────────┐
                   │PENDING_VALIDATION│◄─── rejectResult (vuelve a DATE_CONFIRMED)
                   └──────┬──────────┘
                          │ approveResult │ autoApprove (7 días)
                          ▼
                   ┌──────────────┐
                   │   CONFIRMED  │
                   └──────────────┘

  Cualquier estado ≠ CONFIRMED / ADMIN_RESOLVED / CANCELLED ──(openDispute)──►
                   ┌──────────────┐
                   │   DISPUTED   │
                   └──────┬───────┘
                          │ adminResolve
                          ▼
                   ┌───────────────┐
                   │ ADMIN_RESOLVED│  ← con resolution: AWARD_A|AWARD_B|BOTH_LOST|EXTEND|DISMISS
                   └───────────────┘

  Al llegar league.endDate con estado ∉ {CONFIRMED, ADMIN_RESOLVED, CANCELLED}:
                   ┌───────────────────┐
                   │ EXPIRED_UNPLAYED  │  ← derrota ambos equipos 0 pts
                   └───────────────────┘
```

La transición se centraliza en `modules/matches/application/MatchStateMachine.ts`. Toda mutación pasa por ahí con validación y emite evento de dominio (`MatchScheduled`, `ResultSubmitted`, `MatchConfirmed`, `DisputeOpened`, `DisputeResolved`, `MatchExpired`). Los otros módulos suscriben los eventos para encolar jobs (emails, IA, recordatorios) y recalcular standings.

`ADMIN_RESOLVED` es el único estado terminal "con intervención humana"; si un admin necesita modificar un partido ya `CONFIRMED` (caso raro: error de dedos descubierto tarde), abre una `Dispute` de oficio y la resuelve — se preserva la auditoría.

## 4. Topología de despliegue

```
┌──────────────────────────────────┐
│             Vercel               │
│  ┌────────────────────────────┐  │
│  │ Next.js App Router         │  │  frontend + route handlers + server actions
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │ Vercel Cron (1/min)        │  │  triggers heartbeat + enqueues de jobs periódicos
│  └────────────────────────────┘  │
└─────────────┬────────────────────┘
              │  DATABASE_URL (pgBouncer-pooled)
              ▼
┌──────────────────────────────────┐
│            Railway               │
│  ┌────────────────────────────┐  │
│  │ Postgres 16                │  │  datos + pg-boss schema
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │ Node Worker (persistente)  │  │  pg-boss consumers: emails, IA, auto-approve,
│  │                            │  │  reminders, league-finalize, commentary
│  └────────────────────────────┘  │
└──────────────────────────────────┘
              │
              ▼
        Resend (email) · Anthropic/OpenAI (IA) · Sentry (errors)
```

**Flujo de un job (ejemplo: auto-aprobar resultado a 7 días):**

1. Usuario A envía resultado → `MatchResult` creado con `status=PENDING`.
2. Server Action encola job `match-auto-approve-result` con `startAfter = now + 7 días` en pg-boss.
3. Al transcurrir 7 días, worker en Railway recoge el job.
4. Handler valida que el resultado sigue en `PENDING` (idempotencia) → lo marca `CONFIRMED` con `autoApprovedAt`.
5. Handler emite evento de dominio `MatchConfirmed` → encola jobs `send-email` (notificación a ambos equipos) + `generate-match-commentary`.

## 5. Modelo de datos (Prisma schema)

Schema completo a migrar en Spec 1. Tablas que pertenecen a features posteriores (IndependentMatch, MatchCommentary, Dispute) se crean desde ya para evitar migraciones disruptivas a mitad de desarrollo.

> El bloque siguiente es el schema de referencia. La implementación puede refinar nombres de índices o ajustes menores, pero la estructura es vinculante.

```prisma
// prisma/schema.prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  directUrl  = env("DIRECT_URL")
  extensions = [citext, pgcrypto]
}

// ─── ENUMS ─────────────────────────────────────────────────────────────────

enum UserRole {
  SUPER_ADMIN
  PLAYER
}

enum LeagueMemberRole {
  LEAGUE_ADMIN
  PLAYER
}

enum LeagueStatus {
  DRAFT
  ACTIVE
  FINISHED
  ARCHIVED
}

enum MatchFormat {
  BEST_OF_3
  BEST_OF_5
  FLEXIBLE
}

enum MatchStatus {
  SCHEDULED
  DATE_PROPOSED
  DATE_CONFIRMED
  PENDING_VALIDATION
  CONFIRMED
  ADMIN_RESOLVED
  DISPUTED
  EXPIRED_UNPLAYED
  CANCELLED
}

enum MatchResultStatus {
  PENDING
  CONFIRMED
  REJECTED
  SUPERSEDED
}

enum SchedulingProposalStatus {
  PROPOSED
  ACCEPTED
  REJECTED
  COUNTERED
  SUPERSEDED
}

enum DisputeStatus {
  OPEN
  RESOLVED
}

enum DisputeResolution {
  AWARD_PROPONENT
  AWARD_OPPONENT
  BOTH_LOST
  EXTEND_DEADLINE
  DISMISS
}

enum IndependentMatchStatus {
  OPEN
  PENDING_APPROVAL
  CONFIRMED
  REJECTED
  CANCELLED
}

enum JoinRequestStatus {
  PENDING
  APPROVED
  REJECTED
}

enum ParticipantStatus {
  INVITED
  ACCEPTED
  DECLINED
}

enum NotificationType {
  MATCH_ASSIGNED
  DATE_PROPOSED
  DATE_ACCEPTED
  DATE_REJECTED
  RESULT_SUBMITTED
  RESULT_CONFIRMED
  RESULT_REJECTED
  DISPUTE_OPENED
  DISPUTE_RESOLVED
  INDEPENDENT_MATCH_INVITE
  INDEPENDENT_MATCH_JOIN_REQUEST
  INDEPENDENT_MATCH_CONFIRMED
  INDEPENDENT_MATCH_CANCELLED
  LEAGUE_STARTING
  LEAGUE_FINISHED
  DEADLINE_REMINDER
  COMMENTARY_GENERATED
}

enum SignedTokenPurpose {
  USER_INVITATION
  EMAIL_VERIFICATION
  PASSWORD_RESET
  RESULT_VALIDATION
  INDEPENDENT_MATCH_INVITE
}

enum EmailStatus {
  QUEUED
  SENT
  DELIVERED
  BOUNCED
  FAILED
}

enum AICommentaryProvider {
  CLAUDE
  OPENAI
}

// ─── IDENTIDAD Y AUTH ──────────────────────────────────────────────────────

model User {
  id                    String       @id @default(cuid())
  email                 String       @unique @db.Citext
  emailVerifiedAt       DateTime?    @map("email_verified_at")
  passwordHash          String       @map("password_hash")
  name                  String
  avatarUrl             String?      @map("avatar_url")
  phone                 String?
  role                  UserRole     @default(PLAYER)

  // 2FA — schema listo, feature OFF hasta Spec 7+
  twoFactorEnabled      Boolean      @default(false) @map("two_factor_enabled")
  twoFactorSecret       String?      @map("two_factor_secret") // cifrado con ENCRYPTION_KEY
  twoFactorBackupCodes  String[]     @default([]) @map("two_factor_backup_codes")

  // GDPR
  anonymizedAt          DateTime?    @map("anonymized_at")
  deletedAt             DateTime?    @map("deleted_at")

  createdAt             DateTime     @default(now()) @map("created_at")
  updatedAt             DateTime     @updatedAt @map("updated_at")

  sessions              Session[]
  leagueMemberships     LeagueMember[]
  teamMemberships       TeamMember[]
  auditLogs             AuditLog[]   @relation("AuditActor")
  notifications         Notification[]
  submittedResults      MatchResult[]        @relation("ResultSubmitter")
  validatedResults      MatchResult[]        @relation("ResultValidator")
  proposedSchedules     MatchSchedulingProposal[] @relation("ScheduleProposer")
  respondedSchedules    MatchSchedulingProposal[] @relation("ScheduleResponder")
  openedDisputes        Dispute[]            @relation("DisputeOpener")
  resolvedDisputes      Dispute[]            @relation("DisputeResolver")
  independentMatches    IndependentMatch[]   @relation("IndependentOrganizer")
  indParticipations     IndependentMatchParticipant[]
  indJoinRequests       IndependentMatchJoinRequest[]

  @@index([deletedAt, anonymizedAt])
  @@map("users")
}

model Session {
  id           String   @id @default(cuid())
  userId       String   @map("user_id")
  sessionToken String   @unique @map("session_token")
  expires      DateTime
  ipAddress    String?  @map("ip_address")
  userAgent    String?  @map("user_agent")
  createdAt    DateTime @default(now()) @map("created_at")

  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expires])
  @@map("sessions")
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
  @@map("verification_tokens")
}

model SignedToken {
  jti        String             @id
  purpose    SignedTokenPurpose
  subjectId  String             @map("subject_id")  // userId o matchResultId según purpose
  metadata   Json?
  expiresAt  DateTime           @map("expires_at")
  usedAt     DateTime?          @map("used_at")
  createdAt  DateTime           @default(now()) @map("created_at")

  @@index([purpose, subjectId])
  @@index([expiresAt])
  @@map("signed_tokens")
}

model RateLimitBucket {
  id          String   @id @default(cuid())
  key         String                     // formato: "action:scope:identifier"
  count       Int      @default(0)
  windowStart DateTime @map("window_start")

  @@unique([key])
  @@index([windowStart])
  @@map("rate_limit_buckets")
}

// ─── LIGAS ────────────────────────────────────────────────────────────────

model League {
  id                   String        @id @default(cuid())
  name                 String
  slug                 String        @unique
  description          String?
  startDate            DateTime      @map("start_date")
  endDate              DateTime      @map("end_date")
  status               LeagueStatus  @default(DRAFT)

  // Settings
  matchFormat          MatchFormat   @default(FLEXIBLE) @map("match_format")
  defaultDeadlineDays  Int           @default(21) @map("default_deadline_days") // 3 semanas
  allowDraws           Boolean       @default(true) @map("allow_draws")
  pointsWin            Int           @default(3) @map("points_win")
  pointsDraw           Int           @default(1) @map("points_draw")
  pointsLoss           Int           @default(0) @map("points_loss")
  tiebreakerConfig     Json          @default("{}") @map("tiebreaker_config")

  createdByUserId      String        @map("created_by_user_id")
  createdAt            DateTime      @default(now()) @map("created_at")
  updatedAt            DateTime      @updatedAt @map("updated_at")
  finalizedAt          DateTime?     @map("finalized_at")

  members              LeagueMember[]
  teams                Team[]
  matches              Match[]

  @@index([status])
  @@index([startDate, endDate])
  @@map("leagues")
}

model LeagueMember {
  id        String            @id @default(cuid())
  leagueId  String            @map("league_id")
  userId    String            @map("user_id")
  role      LeagueMemberRole  @default(PLAYER)
  joinedAt  DateTime          @default(now()) @map("joined_at")

  league    League @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  user      User   @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@unique([leagueId, userId])
  @@index([userId])
  @@map("league_members")
}

model Team {
  id        String   @id @default(cuid())
  leagueId  String   @map("league_id")
  name      String
  createdAt DateTime @default(now()) @map("created_at")

  league       League       @relation(fields: [leagueId], references: [id], onDelete: Restrict)
  members      TeamMember[]
  homeMatches  Match[]      @relation("TeamA")
  awayMatches  Match[]      @relation("TeamB")
  wonMatches   MatchResult[] @relation("MatchWinner")

  @@unique([leagueId, name])
  @@map("teams")
}

model TeamMember {
  id       String @id @default(cuid())
  teamId   String @map("team_id")
  userId   String @map("user_id")
  joinedAt DateTime @default(now()) @map("joined_at")

  team     Team   @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user     User   @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@unique([teamId, userId])
  @@index([userId])
  @@map("team_members")
}

// Regla invariante (aplicada en dominio + test): un Team tiene exactamente 2 TeamMembers
// cuando el Match se crea. Durante construcción se permiten 0/1, validado al activar la liga.

// ─── PARTIDOS ────────────────────────────────────────────────────────────

model Match {
  id                 String       @id @default(cuid())
  leagueId           String       @map("league_id")
  teamAId            String       @map("team_a_id")
  teamBId            String       @map("team_b_id")
  status             MatchStatus  @default(SCHEDULED)

  scheduledAt        DateTime?    @map("scheduled_at")   // fecha acordada
  deadlineAt         DateTime     @map("deadline_at")     // blando; se endurece al endDate de liga

  confirmedResultId  String?      @unique @map("confirmed_result_id")
  winnerTeamId       String?      @map("winner_team_id")   // null si empate
  isTiebreaker       Boolean      @default(false) @map("is_tiebreaker")

  createdAt          DateTime     @default(now()) @map("created_at")
  updatedAt          DateTime     @updatedAt @map("updated_at")

  league             League                     @relation(fields: [leagueId], references: [id], onDelete: Restrict)
  teamA              Team                       @relation("TeamA", fields: [teamAId], references: [id], onDelete: Restrict)
  teamB              Team                       @relation("TeamB", fields: [teamBId], references: [id], onDelete: Restrict)
  confirmedResult    MatchResult?               @relation("ConfirmedResult", fields: [confirmedResultId], references: [id])
  results            MatchResult[]              @relation("MatchResults")
  schedulingProposals MatchSchedulingProposal[]
  dispute            Dispute?
  commentary         MatchCommentary?

  @@index([leagueId, status])
  @@index([deadlineAt])
  @@index([teamAId])
  @@index([teamBId])
  @@map("matches")
}

model MatchResult {
  id                String              @id @default(cuid())
  matchId           String              @map("match_id")
  submittedByUserId String              @map("submitted_by_user_id")
  submittedAt       DateTime            @default(now()) @map("submitted_at")
  status            MatchResultStatus   @default(PENDING)
  winnerTeamId      String?             @map("winner_team_id")  // null = empate; calculado al submit
  validatedByUserId String?             @map("validated_by_user_id")
  validatedAt       DateTime?           @map("validated_at")
  autoApprovedAt    DateTime?           @map("auto_approved_at")
  rejectionReason   String?             @map("rejection_reason")
  rejectedAt        DateTime?           @map("rejected_at")

  match            Match   @relation("MatchResults", fields: [matchId], references: [id], onDelete: Cascade)
  submitter        User    @relation("ResultSubmitter", fields: [submittedByUserId], references: [id], onDelete: Restrict)
  validator        User?   @relation("ResultValidator", fields: [validatedByUserId], references: [id], onDelete: Restrict)
  winnerTeam       Team?   @relation("MatchWinner", fields: [winnerTeamId], references: [id], onDelete: Restrict)
  sets             Set[]
  matchAsConfirmed Match?  @relation("ConfirmedResult")

  @@index([matchId, status])
  @@index([submittedByUserId])
  @@map("match_results")
}

model Set {
  id            String @id @default(cuid())
  matchResultId String @map("match_result_id")
  setNumber     Int    @map("set_number")   // 1..5
  gamesA        Int    @map("games_a")
  gamesB        Int    @map("games_b")

  matchResult   MatchResult @relation(fields: [matchResultId], references: [id], onDelete: Cascade)

  @@unique([matchResultId, setNumber])
  @@map("sets")
}

model MatchSchedulingProposal {
  id                 String                    @id @default(cuid())
  matchId            String                    @map("match_id")
  proposedByUserId   String                    @map("proposed_by_user_id")
  proposedDate       DateTime                  @map("proposed_date")
  status             SchedulingProposalStatus  @default(PROPOSED)
  respondedByUserId  String?                   @map("responded_by_user_id")
  respondedAt        DateTime?                 @map("responded_at")
  rejectionReason    String?                   @map("rejection_reason")
  createdAt          DateTime                  @default(now()) @map("created_at")

  match       Match  @relation(fields: [matchId], references: [id], onDelete: Cascade)
  proposer    User   @relation("ScheduleProposer", fields: [proposedByUserId], references: [id], onDelete: Restrict)
  responder   User?  @relation("ScheduleResponder", fields: [respondedByUserId], references: [id], onDelete: Restrict)

  @@index([matchId, status])
  @@map("match_scheduling_proposals")
}

model Dispute {
  id                 String              @id @default(cuid())
  matchId            String              @unique @map("match_id")
  openedByUserId     String              @map("opened_by_user_id")
  reason             String
  evidenceSnapshot   Json                @map("evidence_snapshot")   // histórico serializado al abrir
  status             DisputeStatus       @default(OPEN)
  resolution         DisputeResolution?
  adminNote          String?             @map("admin_note")
  newDeadlineAt      DateTime?           @map("new_deadline_at")
  resolvedByUserId   String?             @map("resolved_by_user_id")
  resolvedAt         DateTime?           @map("resolved_at")
  createdAt          DateTime            @default(now()) @map("created_at")

  match        Match @relation(fields: [matchId], references: [id], onDelete: Cascade)
  opener       User  @relation("DisputeOpener", fields: [openedByUserId], references: [id], onDelete: Restrict)
  resolver     User? @relation("DisputeResolver", fields: [resolvedByUserId], references: [id], onDelete: Restrict)

  @@index([status])
  @@map("disputes")
}

model MatchCommentary {
  id                 String                @id @default(cuid())
  matchId            String                @unique @map("match_id")
  provider           AICommentaryProvider
  content            String
  generatedAt        DateTime              @default(now()) @map("generated_at")
  regeneratedCount   Int                   @default(0) @map("regenerated_count")
  rejectedForSafety  Boolean               @default(false) @map("rejected_for_safety")
  promptVersion      String                @default("v1") @map("prompt_version")

  match  Match @relation(fields: [matchId], references: [id], onDelete: Cascade)

  @@map("match_commentaries")
}

// ─── PARTIDOS INDEPENDIENTES ─────────────────────────────────────────────

model IndependentMatch {
  id                String                   @id @default(cuid())
  organizerId       String                   @map("organizer_id")
  scheduledAt       DateTime                 @map("scheduled_at")
  location          String?
  description       String?
  maxPlayers        Int                      @default(4) @map("max_players")
  status            IndependentMatchStatus   @default(OPEN)
  createdAt         DateTime                 @default(now()) @map("created_at")
  updatedAt         DateTime                 @updatedAt @map("updated_at")

  organizer         User                              @relation("IndependentOrganizer", fields: [organizerId], references: [id], onDelete: Restrict)
  participants      IndependentMatchParticipant[]
  joinRequests      IndependentMatchJoinRequest[]

  @@index([status, scheduledAt])
  @@map("independent_matches")
}

model IndependentMatchParticipant {
  id                   String             @id @default(cuid())
  independentMatchId   String             @map("independent_match_id")
  userId               String             @map("user_id")
  status               ParticipantStatus  @default(INVITED)
  respondedAt          DateTime?          @map("responded_at")

  match                IndependentMatch @relation(fields: [independentMatchId], references: [id], onDelete: Cascade)
  user                 User             @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@unique([independentMatchId, userId])
  @@map("independent_match_participants")
}

model IndependentMatchJoinRequest {
  id                    String             @id @default(cuid())
  independentMatchId    String             @map("independent_match_id")
  userId                String             @map("user_id")
  message               String?
  status                JoinRequestStatus  @default(PENDING)
  respondedByUserId     String?            @map("responded_by_user_id")
  respondedAt           DateTime?          @map("responded_at")
  createdAt             DateTime           @default(now()) @map("created_at")

  match    IndependentMatch @relation(fields: [independentMatchId], references: [id], onDelete: Cascade)
  user     User             @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@index([independentMatchId, status])
  @@map("independent_match_join_requests")
}

// ─── INFRA COMÚN ─────────────────────────────────────────────────────────

model Notification {
  id        String              @id @default(cuid())
  userId    String              @map("user_id")
  type      NotificationType
  title     String
  body      String
  metadata  Json?
  readAt    DateTime?           @map("read_at")
  createdAt DateTime            @default(now()) @map("created_at")

  user      User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, readAt, createdAt])
  @@map("notifications")
}

model EmailLog {
  id                 String       @id @default(cuid())
  toEmail            String       @map("to_email")
  template           String
  subject            String
  providerMessageId  String?      @map("provider_message_id")
  status             EmailStatus  @default(QUEUED)
  attempt            Int          @default(1)
  errorMessage       String?      @map("error_message")
  dedupKey           String?      @unique @map("dedup_key")
  createdAt          DateTime     @default(now()) @map("created_at")
  sentAt             DateTime?    @map("sent_at")

  @@index([status])
  @@index([toEmail])
  @@map("email_logs")
}

model AuditLog {
  id          String   @id @default(cuid())
  actorId     String?  @map("actor_id")  // null si sistema
  action      String                      // p. ej., "match.result.confirmed"
  targetType  String   @map("target_type") // p. ej., "Match"
  targetId    String   @map("target_id")
  metadata    Json?
  ipAddress   String?  @map("ip_address")
  userAgent   String?  @map("user_agent")
  createdAt   DateTime @default(now()) @map("created_at")

  actor       User? @relation("AuditActor", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([targetType, targetId, createdAt])
  @@index([actorId, createdAt])
  @@index([action, createdAt])
  @@map("audit_logs")
}

model JobDeadLetter {
  id          String   @id @default(cuid())
  jobName     String   @map("job_name")
  jobId       String   @map("job_id")     // id de pg-boss
  payload     Json
  error       String
  failedAt    DateTime @default(now()) @map("failed_at")

  @@index([jobName, failedAt])
  @@map("job_dead_letters")
}
```

### 5.1 Invariantes del dominio (no expresables en schema)

Validadas en application layer + tests:

1. Un `Team` activo en una `League` tiene exactamente 2 `TeamMember`.
2. Un `Match` no puede tener `teamAId == teamBId`.
3. Un `Match` en estado `CONFIRMED` debe tener `confirmedResultId` no nulo.
4. El `winnerTeamId` de un `MatchResult` es consistente con los `Set`: si null → equal sets won; si no null → más sets ganados que el otro.
5. No se permiten sets donde `gamesA == gamesB` **excepto** como último set de un partido donde al menos un set previo tiene ganador.
6. En un `MatchResult`, el campo `setNumber` es secuencial sin huecos (1, 2, 3…).
7. Un `SignedToken` solo se consume una vez (update con CAS sobre `usedAt IS NULL`).
8. `deletedAt` y `anonymizedAt` son mutuamente excluyentes; `anonymizedAt` implica borrado parcial de PII pero registros referenciados preservados.

## 6. Módulos y reglas de dependencia

### 6.1 Estructura física del repo

```
padel-league/
├── src/
│   ├── app/                              # Next.js App Router
│   │   ├── (public)/
│   │   │   ├── login/
│   │   │   ├── recuperar-password/
│   │   │   ├── aviso-legal/
│   │   │   └── privacidad/
│   │   ├── (authed)/
│   │   │   ├── ligas/[slug]/
│   │   │   ├── partidos/[id]/
│   │   │   ├── partidos-independientes/
│   │   │   ├── notificaciones/
│   │   │   ├── perfil/
│   │   │   └── admin/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/
│   │   │   ├── cron/heartbeat/
│   │   │   ├── me/export/
│   │   │   └── notifications/unread/
│   │   └── actions/                     # Server Actions
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── domain/
│   │   │   ├── application/
│   │   │   ├── infrastructure/
│   │   │   ├── presentation/
│   │   │   └── index.ts                 # API pública del módulo
│   │   ├── leagues/
│   │   ├── matches/
│   │   ├── independent-matches/
│   │   ├── disputes/
│   │   ├── notifications/
│   │   ├── ai-commentary/
│   │   └── statistics/
│   ├── shared/
│   │   ├── config/                      # Zod env parser, feature flags
│   │   ├── db/                          # Prisma client singleton
│   │   ├── queue/                       # pg-boss client + JobMap types
│   │   ├── logger/                      # pino setup
│   │   ├── errors/                      # AppError hierarchy
│   │   ├── auth-helpers/                # session + RBAC helpers
│   │   ├── i18n/                        # t() trivial
│   │   └── ui/                          # shadcn primitives + theme
│   └── worker/
│       ├── index.ts                     # entrypoint Railway
│       └── handlers.ts                  # registra handlers de todos los job types
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── scripts/
│   ├── dev-db.sh
│   ├── create-superadmin.ts
│   └── anonymize-user.ts
├── docs/
│   ├── superpowers/specs/
│   ├── architecture.md
│   ├── runbook.md
│   └── deployment.md
├── .env.example
├── eslint.config.mjs
├── next.config.mjs
├── playwright.config.ts
├── vitest.config.ts
├── tsconfig.json
├── package.json
└── railway.toml
```

### 6.2 Reglas de dependencia (enforced vía `eslint-plugin-boundaries` + tests)

| Desde ↓ / Hacia → | `domain` | `application` | `infrastructure` | `presentation` | otro módulo |
| ----------------- | -------- | ------------- | ---------------- | -------------- | ----------- |
| `domain`          | ✅       | ❌            | ❌               | ❌             | ❌          |
| `application`     | ✅       | ✅            | ❌ (solo ports)   | ❌             | ❌          |
| `infrastructure`  | ✅       | ✅ (implementa ports) | ✅        | ❌             | ❌          |
| `presentation`    | ✅       | ✅            | ❌               | ✅             | ❌          |
| `app/`            | —        | ✅            | ❌                | ✅             | vía `index.ts` |
| entre módulos     | —        | —             | —                 | —              | **solo vía `modules/<mod>/index.ts`** |

- `domain/` contiene value objects, entities y servicios de dominio puros — sin I/O.
- `application/` orquesta use cases, define ports (interfaces) que `infrastructure/` implementa.
- `infrastructure/` contiene adapters Prisma, Resend, SDKs de IA, pg-boss helpers.
- `presentation/` contiene componentes React específicos del módulo.
- La comunicación entre módulos pasa por el `index.ts` que expone una API mínima documentada.

## 7. Autenticación y seguridad

### 7.0 Creación de usuarios (invitación)

La aplicación es **privada**: no hay registro abierto. Los usuarios se crean solo por invitación de un `SUPER_ADMIN` o `LEAGUE_ADMIN`.

1. Admin introduce email (+ opcional: nombre, rol, liga a asignar) en `/admin/usuarios/invitar`.
2. Sistema crea `User` en estado "invitado" (`passwordHash` aleatorio inválido, `emailVerifiedAt = null`) + emite `SignedToken` con `purpose = USER_INVITATION`, TTL 7 días.
3. Job `send-email` con template `invitation` envía email al usuario con URL `${APP_URL}/aceptar-invitacion/<token>`.
4. Usuario clica, formulario pide nombre (si no estaba) + password (validación fuerte: mín 10 chars, al menos un número + una letra).
5. Al submit: consume token (CAS) → setea `passwordHash` (Argon2id) + `emailVerifiedAt = now()` + nombre → auto-login (crea `Session`) → redirect a `/dashboard`.
6. Si el token caducó, el usuario pide nueva invitación; el admin reenvía.
7. `AuditLog`: `user.invited` (admin) + `user.invitation.accepted` (nuevo usuario).

### 7.1 Flujo de login

1. Usuario envía email + password.
2. Rate limiting check (`login:ip:{ip}` y `login:email:{email}`, ventana 15 min, límites 10/15/100).
3. Fetch `User` por email (case-insensitive gracias a `citext`).
4. Argon2id verify del password contra `passwordHash`. Si falla → incrementar rate limit counter + `AuditLog` (`auth.login.failed`).
5. Si `twoFactorEnabled` y feature flag ON → redirect a TOTP challenge.
6. Crear `Session` con `sessionToken` aleatorio (32 bytes base64url) + `expires = now + 30 días`.
7. Set cookie httpOnly, Secure, SameSite=Lax, path `/`.
8. `AuditLog` (`auth.login.success`) con IP y user agent.

### 7.2 Hashing de passwords

- **Argon2id** con parámetros: `memoryCost: 65536` (64 MiB), `timeCost: 3`, `parallelism: 4`, `hashLength: 32`.
- Implementado con lib `@node-rs/argon2` (nativo, performance estable en Node 20).
- Re-hash automático en login si los parámetros quedan obsoletos (se detecta leyendo el string hash).

### 7.3 Gestión de sesiones

- DB sessions. Revocación instantánea borrando la fila.
- Un usuario puede tener varias sesiones simultáneas (móvil + PC). Desde `/perfil` puede "cerrar sesión en todos los dispositivos" (DELETE de todas las filas `Session` del usuario).
- Cleanup job pg-boss `session-cleanup` corre diario, borra sesiones con `expires < now()`.
- Middleware Next.js verifica `sessionToken` cookie → busca `Session` por token → valida `expires > now()` → anexa `userId` a `AsyncLocalStorage` para downstream.

### 7.4 Enlaces firmados — `SignedTokenService`

```typescript
// src/shared/auth-helpers/signed-tokens.ts

interface IssueOptions {
  purpose: SignedTokenPurpose;
  subjectId: string;
  ttlSeconds: number;
  metadata?: Record<string, unknown>;
}

interface SignedTokenService {
  issue(opts: IssueOptions): Promise<string>;       // devuelve JWT
  consume(token: string, purpose: SignedTokenPurpose): Promise<{ subjectId: string; metadata: Record<string, unknown> | null }>;
}
```

- JWT firmado HS256 con `NEXTAUTH_SECRET` (rotable). Payload: `{ jti, purpose, sub, exp, iat }`.
- Al `issue`: insertar fila en `SignedToken` con `jti`, `expiresAt`, `metadata`.
- Al `consume`:
  1. Verificar firma JWT → decode.
  2. Verificar `purpose` coincide con lo esperado.
  3. `UPDATE signed_tokens SET used_at = now() WHERE jti = $1 AND used_at IS NULL AND expires_at > now() RETURNING ...` (CAS).
  4. Si no devuelve fila → lanzar `InvalidTokenError` (usado, caducado o inexistente).
- URL generada: `${APP_URL}/validate-result/${token}` (ejemplo).

### 7.5 RBAC

- **Rol global** en `User.role`: `SUPER_ADMIN | PLAYER`.
- **Rol scoped** por liga en `LeagueMember.role`: `LEAGUE_ADMIN | PLAYER`.
- Helpers:
  ```typescript
  requireSession()                                  // cualquier usuario autenticado
  requireSuperAdmin()                               // solo SUPER_ADMIN
  requireLeagueAdmin(leagueId)                      // SUPER_ADMIN o LEAGUE_ADMIN en esa liga
  requireTeamMember(teamId)                         // miembro del equipo
  requireMatchParticipant(matchId)                  // miembro de teamA o teamB del match
  ```
- Cada helper lanza `AuthorizationError` si no procede. Nunca devuelve boolean — fail-closed.
- Server Actions y route handlers sensibles llaman al helper antes de cualquier lógica.

### 7.6 Rate limiting

- Implementado sobre `RateLimitBucket` con sliding window en aplicación:
  ```
  key = `${action}:${scope}:${identifier}`
  window = 15 min
  ```
- Aplicado en: `/login`, `/recuperar-password`, `/validate-result/:token`, intentos de 2FA.
- Límites base (ajustables por config): 10 intentos por ventana por IP, 5 por usuario/email, 100 globales por acción.
- En cada hit: `INSERT ... ON CONFLICT (key) DO UPDATE SET count = count + 1, window_start = CASE WHEN window_start < now() - interval '15 min' THEN now() ELSE window_start END`.
- Respuesta 429 con `Retry-After` header.

### 7.7 Seguridad HTTP

- CSP estricta configurada en `next.config.mjs` (nonce-based inline scripts).
- Helmet-like headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- CSRF: Auth.js ya protege Server Actions con tokens; para form externos se fuerza validación.
- Cookies de sesión: httpOnly + Secure + SameSite=Lax.

### 7.8 Secretos y cifrado en reposo

- `twoFactorSecret` cifrado con `ENCRYPTION_KEY` (32 bytes base64, random, en env) usando AES-256-GCM.
- `ENCRYPTION_KEY` generable con `openssl rand -base64 32`.
- Rotación: `ENCRYPTION_KEY_PREVIOUS` soportado para re-cifrado online durante migración.

## 8. Cola y jobs

### 8.1 pg-boss setup

- Schema dedicado `pgboss` en la misma DB.
- Instancia única del cliente en el worker (Railway). La web (Vercel) **solo publica** jobs; no consume.
- Creación del schema automática en arranque (`new PgBoss(...).start()`).

### 8.2 Registro de tipos de job (type-safe)

```typescript
// src/shared/queue/jobs.ts

export type JobMap = {
  'noop': { ping: string };                    // sanity check; handler cableado en Spec 1
  'send-email': { template: string; to: string; data: Record<string, unknown>; dedupKey?: string };
  'match-auto-approve-result': { matchResultId: string };
  'match-reminder': { matchId: string; kind: 'initial' | 'mid' | 'final' };
  'generate-match-commentary': { matchId: string };
  'league-finalize': { leagueId: string };
  'session-cleanup': Record<string, never>;
  'anonymize-user': { userId: string };
};

export type JobName = keyof JobMap;

export interface Queue {
  publish<N extends JobName>(name: N, data: JobMap[N], opts?: { startAfter?: Date | string; singletonKey?: string }): Promise<string>;
}
```

### 8.3 Handlers y reintentos

- Cada handler es una función `async (job: Job<JobMap[N]>) => Promise<void>`.
- Reintentos: 3 con backoff exponencial (30s, 5min, 30min).
- Tras agotar reintentos → insertar en `JobDeadLetter` + alertar vía Sentry.
- Idempotencia: cada handler valida estado actual antes de mutar (p. ej., `auto-approve` solo actúa si el `MatchResult` sigue `PENDING`).

### 8.4 Trigger periódico

- Vercel Cron cada 5 minutos llama `POST /api/cron/heartbeat` con header `Authorization: Bearer ${CRON_SECRET}`.
- El endpoint publica jobs periódicos necesarios (p. ej., `league-finalize` para ligas cuyo `endDate` acaba de pasar).
- Worker en Railway escucha independientemente; no depende del cron.

## 9. Errores, logging y observabilidad

### 9.1 Jerarquía de errores

```typescript
// src/shared/errors/index.ts

export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  readonly context?: Record<string, unknown>;
}

export class DomainError extends AppError {}          // 422
export class ValidationError extends AppError {}      // 400
export class NotFoundError extends AppError {}        // 404
export class AuthorizationError extends AppError {}   // 403
export class AuthenticationError extends AppError {}  // 401
export class ConflictError extends AppError {}        // 409
export class RateLimitError extends AppError {}       // 429
export class InfrastructureError extends AppError {}  // 500
export class InvalidTokenError extends AppError {}    // 400
```

- `DomainError`, `ValidationError`, `NotFoundError`, `AuthorizationError`, `AuthenticationError`, `ConflictError`, `RateLimitError`, `InvalidTokenError` son **expected** — no van a Sentry, se loguean a nivel `warn`.
- `InfrastructureError` y cualquier error no AppError van a Sentry como `error`.
- `errorToResponse(err)` en boundaries: mapea a JSON `{ code, message }` con status apropiado. Nunca expone `stack` ni mensaje de infra.

### 9.2 Logging

- **pino** con transport a stdout en formato JSON.
- Vercel captura logs de Vercel Runtime; Railway captura logs del worker.
- Campos estándar: `time`, `level`, `requestId`, `userId`, `traceId`, `msg`, más específicos por contexto (`matchId`, `jobName`, etc.).
- Nivel por env: `LOG_LEVEL` (prod: `info`; dev: `debug`; test: `silent`).
- `requestId` generado en `middleware.ts` de Next.js (UUID v4) y propagado a Server Actions via AsyncLocalStorage.
- Jobs pg-boss reciben `requestId` en metadata del job publicado — logs correlacionados entre web y worker.

### 9.3 Sentry

- Vercel Next.js integration oficial (`@sentry/nextjs`).
- Node worker usa `@sentry/node` manual.
- Source maps subidos en CI con `SENTRY_AUTH_TOKEN`.
- Sample rate: errors 100%, performance 10%.
- Tags: `requestId`, `userId`, `module`.
- Filtro en `beforeSend`: descarta `AppError` expected.

### 9.4 Audit log

Toda acción crítica escribe `AuditLog` **dentro de la misma transacción** de negocio (nunca "best effort"). Lista de acciones auditadas:

- `auth.login.success`, `auth.login.failed`, `auth.logout`, `auth.password.reset`
- `user.role.changed`, `user.anonymized`, `user.deleted`
- `league.created`, `league.updated`, `league.finalized`, `league.member.added`, `league.member.removed`
- `team.created`, `team.updated`, `team.member.changed`
- `match.created`, `match.scheduled`, `match.result.submitted`, `match.result.validated`, `match.result.rejected`, `match.result.auto_approved`, `match.result.admin_resolved`
- `match.expired_unplayed`
- `dispute.opened`, `dispute.resolved`
- `independent_match.created`, `independent_match.approved`, `independent_match.confirmed`, `independent_match.cancelled`

## 10. Configuración y variables de entorno

`src/shared/config/env.ts` parsea con Zod y falla el arranque si falta o es inválida:

```env
# Core
NODE_ENV=development
APP_URL=http://localhost:3000
LOG_LEVEL=debug

# DB
DATABASE_URL=postgresql://user:pass@host:5432/padel?sslmode=require&pgbouncer=true
DIRECT_URL=postgresql://user:pass@host:5432/padel?sslmode=require

# Auth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<openssl rand -base64 32>
ENCRYPTION_KEY=<openssl rand -base64 32>
ENCRYPTION_KEY_PREVIOUS=       # opcional, para rotación

# Email
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=noreply@tudominio.com
EMAIL_REPLY_TO=soporte@tudominio.com

# AI
AI_PROVIDER=claude                          # claude | openai
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
AI_MODEL_CLAUDE=claude-haiku-4-5-20251001
AI_MODEL_OPENAI=gpt-4o-mini

# Observability
SENTRY_DSN=https://xxx.ingest.sentry.io/xxx
SENTRY_AUTH_TOKEN=                          # solo en CI

# Cron
CRON_SECRET=<openssl rand -base64 32>

# Feature flags
FEATURE_2FA=false
FEATURE_AI_COMMENTARY=true
FEATURE_INDEPENDENT_MATCHES=true

# Worker
WORKER_CONCURRENCY=4

# Bootstrap (opcional, solo seed inicial)
SEED_SUPERADMIN_EMAIL=admin@tudominio.com
SEED_SUPERADMIN_PASSWORD=                   # solo para primer arranque; luego rotar
```

`.env.example` en el repo con todas las keys vacías o placeholders seguros.

## 11. Testing

### 11.1 Unit (Vitest)

- Dominio puro: `modules/*/domain/**`.
- Objetivo cobertura: **≥ 90%** líneas en domain + ≥ 85% branches.
- Todos los servicios de dominio son testeables sin mocks: `calculateMatchWinner(sets)`, `rankStandings(teams, matches)`, `validateSetsForFormat(sets, format)`, `MatchStateMachine.transition(match, event)`, `SignedTokenService.consume(...)`.

### 11.2 Integration (Vitest + Testcontainers)

- Levanta Postgres 16 en contenedor por suite (reusable entre tests de la suite).
- Prisma migrate deploy al iniciar el contenedor.
- Cada test corre en transacción que se hace rollback al final (o bien, usar `TRUNCATE` entre tests si la transacción no aplica).
- Cubre: use cases de `application/`, repos Prisma, consumo de `SignedToken` con concurrencia (dos workers intentan consumir el mismo token → uno gana).

### 11.3 E2E (Playwright)

Flujos obligatorios en Spec 1 (los demás en Spec 7):

1. **Invitación + aceptación + login + logout** — admin invita, se lee el `SignedToken` directamente de la BD (no se intercepta email; más determinista en CI), usuario acepta y establece password, entra, cierra sesión.
2. **Recuperación de password** — usuario solicita reset, el test lee el `SignedToken` de BD, completa el formulario, hace login con nueva password.
3. **Cerrar sesión en todos los dispositivos** — simula 2 sesiones desde el mismo `User`, "revocar todas" desde `/perfil`, ambas sesiones fallan al siguiente request.
4. **Rate limiting de login** — 11 intentos fallidos en ventana → 429 `Retry-After`.

Los E2E de resultados y clasificación se definen y pasan en Spec 3.

### 11.4 Fixtures y factories

- `tests/fixtures/` con factories tipo `makeUser`, `makeLeague`, `makeMatch`.
- Semilla determinística (`FAKER_SEED=2026`).

## 12. CI/CD

### 12.1 GitHub Actions

Pipeline `ci.yml`:

```yaml
name: CI
on: [push, pull_request]
jobs:
  lint-typecheck:
    - pnpm install
    - pnpm lint
    - pnpm typecheck

  unit:
    - pnpm test:unit --coverage
    - upload coverage

  integration:
    services:
      postgres:
        image: postgres:16
        ports: [5432]
    - pnpm prisma migrate deploy
    - pnpm test:integration

  build:
    - pnpm build                # next build + worker tsc

  e2e:
    services: postgres
    - pnpm prisma migrate deploy && pnpm seed:test
    - pnpm playwright install --with-deps
    - pnpm test:e2e
    - upload playwright-report

  deploy-preview (on PR):
    - vercel deploy --prebuilt
```

### 12.2 Despliegue

- **Vercel** conectado al repo: deploys automáticos en `main` (producción) y preview en PRs.
- **Railway** con dos services:
  - `worker` (Dockerfile o Nixpacks): comando `node dist/worker/index.js`.
  - `postgres` (Railway Postgres plugin).
  - Deploys conectados al mismo repo; build trigger en push a `main`.
- **Migraciones**: job de Railway pre-deploy ejecuta `pnpm prisma migrate deploy` contra `DIRECT_URL`.

### 12.3 Entornos

| Entorno | URL | Branch | DB | Worker |
| ------- | --- | ------ | -- | ------ |
| Local | `localhost:3000` | cualquiera | Postgres Docker local | `pnpm worker:dev` |
| Preview | `<pr>.vercel.app` | PR | Railway preview DB | opcional (jobs no se ejecutan en previews para evitar efectos secundarios reales, como emails) |
| Production | `padelleague.tudominio.com` | `main` | Railway prod | Railway prod |

En **preview** los jobs se encolan pero no se consumen (worker solo arranca en producción); los emails usan `RESEND_API_KEY` sandbox.

## 13. Desarrollo local

### 13.1 Prerrequisitos

- Node 20.x LTS
- pnpm 9.x
- Docker Desktop (para Postgres local + Testcontainers)

### 13.2 Setup inicial

```bash
# 1. clone + deps
git clone <repo>
cd padel-league
pnpm install

# 2. DB local
./scripts/dev-db.sh                          # levanta Postgres 16 en Docker

# 3. env
cp .env.example .env.local
# editar: rellenar RESEND_API_KEY sandbox, ANTHROPIC_API_KEY, NEXTAUTH_SECRET, ENCRYPTION_KEY

# 4. migraciones + seed
pnpm prisma migrate dev
pnpm seed

# 5. arrancar
pnpm dev                                     # next dev
pnpm worker:dev                              # worker en otra terminal
```

### 13.3 Scripts npm

```json
{
  "dev": "next dev",
  "worker:dev": "tsx watch src/worker/index.ts",
  "build": "next build && tsc -p tsconfig.worker.json",
  "start": "next start",
  "worker:start": "node dist/worker/index.js",
  "lint": "eslint . --max-warnings 0",
  "typecheck": "tsc --noEmit",
  "test:unit": "vitest run tests/unit",
  "test:integration": "vitest run tests/integration",
  "test:e2e": "playwright test",
  "prisma:studio": "prisma studio",
  "seed": "tsx prisma/seed.ts",
  "seed:test": "FAKER_SEED=2026 tsx prisma/seed.ts"
}
```

## 14. GDPR / LOPDGDD

### 14.1 Datos personales tratados

- Email, nombre, teléfono (opcional), avatar (opcional), histórico de partidos.
- Base legal: consentimiento al alta + interés legítimo del organizador de la liga.

### 14.2 Derechos del usuario implementados en Spec 1

- **Acceso / portabilidad:** `GET /api/me/export` devuelve JSON con todos los datos del usuario (partidos, equipos, notificaciones, audit de sus propias acciones).
- **Rectificación:** edición desde `/perfil`.
- **Supresión (derecho al olvido):** endpoint admin `POST /api/admin/users/:id/anonymize`. Ejecuta:
  1. `email` → `anonymized-${id}@deleted.local`
  2. `name` → `Jugador anónimo`
  3. `passwordHash` → random (invalida login)
  4. `avatarUrl`, `phone` → null
  5. `anonymizedAt = now()`
  6. `Session` del usuario → delete all
  7. `AuditLog` acción `user.anonymized` con actor = super admin
- Los registros de partidos históricos se preservan con el `userId` apuntando al usuario anonimizado (mostrado como "Jugador anónimo" en UI).

### 14.3 Cookies

- Solo técnicas (sesión Auth.js). No requiere banner de consentimiento.
- Si en Spec 7 se añade analytics de terceros, se añadirá banner.

### 14.4 Páginas estáticas

- `/aviso-legal`, `/privacidad`, `/cookies` — contenido provisto por el usuario/abogado antes de producción. Placeholders en Spec 1.

## 15. Entregables de Spec 1 (criterios de aceptación)

Al final de Spec 1, el proyecto debe cumplir:

- [ ] `pnpm install && pnpm dev` arranca sin errores; `/` redirige a `/login` (no autenticado) o `/dashboard` (autenticado).
- [ ] `pnpm prisma migrate dev` aplica schema completo sin errores.
- [ ] Script `pnpm seed` crea un Super Admin usando `SEED_SUPERADMIN_EMAIL/PASSWORD`.
- [ ] Admin invita usuario desde `/admin/usuarios/invitar`; invitado recibe email, acepta con enlace firmado one-use, establece password, queda autenticado.
- [ ] Login funcional con rate limiting activo; logout funcional.
- [ ] Recuperación de password end-to-end (envía email Resend, enlace firmado one-use, cambio de password).
- [ ] Página `/dashboard` autenticada muestra nombre del usuario logueado y botón logout.
- [ ] Página `/perfil` permite editar nombre + avatar + cambiar password + revocar todas las sesiones.
- [ ] Worker arranca en `pnpm worker:dev`, registra handler dummy (`noop`) y lo consume en < 2s.
- [ ] `POST /api/cron/heartbeat` con header correcto publica y consume un job `noop` observable en logs.
- [ ] `GET /api/me/export` devuelve JSON con datos del usuario autenticado.
- [ ] Endpoint admin `POST /api/admin/users/:id/anonymize` funciona y audita.
- [ ] Logs estructurados JSON con `requestId` correlacionado entre web y worker.
- [ ] Sentry recibe un error de prueba deliberado (`/api/dev/sentry-test` en entorno dev).
- [ ] CI verde: lint + typecheck + unit + integration + build + E2E de auth.
- [ ] Despliegue a Vercel (web) + Railway (worker + Postgres) completado y documentado en `docs/deployment.md`.
- [ ] Páginas `/aviso-legal` y `/privacidad` presentes (con placeholder "Pendiente de revisión legal").
- [ ] Header CSP + cookies seguras verificadas con `curl -I` en producción.

## 16. Fuera de alcance de Spec 1 (explícito)

Ninguna de las siguientes cosas se implementa en Spec 1. Están referenciadas en schema/interfaces para no bloquear specs posteriores:

- Algoritmo round-robin de generación de fixtures (→ Spec 2).
- Algoritmo de standings y desempates (→ Spec 2).
- UI de páginas de liga, partido, clasificación (→ Spec 2 y 3).
- Flujo completo de submit resultado + validación por enlace firmado (infra lista; UI/flow → Spec 3).
- Handlers reales de jobs `match-reminder`, `match-auto-approve-result`, `generate-match-commentary`, `league-finalize` (→ Spec 4 y 6). Infra de cola y registro de tipos listo. Spec 1 implementa handlers de `noop`, `send-email`, `session-cleanup` y `anonymize-user` (los necesarios para que auth/GDPR funcionen end-to-end).
- Feature partidos independientes (schema listo, flow → Spec 5).
- Integración real con Claude/OpenAI (provider abstraction + flag listos; prompts + handler → Spec 6).
- Dashboards operacionales avanzados, E2E de todos los flujos, perf tuning (→ Spec 7).
- 2FA UI + flow completo (schema + librería TOTP cableados, feature flag OFF → Spec 7+).

## 17. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
| ------ | ------------ | ------- | ---------- |
| Vercel+Railway latencia DB (dos clouds distintos) | Media | Medio | pgBouncer en Railway, pooled connection en Vercel; medir con Sentry performance en Spec 7. Si > 50ms p95 → evaluar mover web a Railway también. |
| Worker down → jobs encolan sin procesarse | Baja | Alto | Alertas Sentry + Railway health checks + heartbeat cron escribe `AuditLog` si el worker no responde en 5 min. |
| Signed token reutilizado por race condition | Baja | Alto | CAS atómico en `UPDATE ... WHERE used_at IS NULL`. Test de integración con concurrencia explícita. |
| Coste API IA descontrolado | Media | Medio | Presupuesto mensual con Anthropic/OpenAI; feature flag para pausar; rate limit job de IA (máx 100/día por liga) en Spec 6. |
| Fuga de PII en logs | Media | Alto | Lista de campos prohibidos en pino serializer (`password`, `passwordHash`, `twoFactorSecret`, `sessionToken`). Test unit del logger. |
| Migraciones rompen producción | Baja | Alto | Todas las migraciones reviewable; deploy con `migrate deploy` (nunca `migrate dev`); rollback plan documentado en `runbook.md`. |

## 18. Decisiones abiertas

Ninguna. Todas las ambigüedades resueltas durante el brainstorming (ver commit log).
