# Penalización -1 por no jugar + Reglamento + Extensión de deadline

## Decisiones (resumen)

| Aspecto | Decisión |
|---|---|
| Penalización por partido no jugado | -1 puntos para cada equipo, `played++` |
| Status incluido en clasificación | `CONFIRMED` + `ADMIN_RESOLVED` + `EXPIRED_UNPLAYED` |
| Página de reglamento | `/reglamento`, acceso logueado |
| Contenido reglamento | Sistema de puntos · Reglas de partidos · Calendario y jornadas (sin IA) |
| Footer | Componente nuevo: logo + columnas (App / Cuenta / Legal) + copyright |
| Link "Reglamento" | En NavLinks (desktop) + MobileMenu (móvil) + footer |
| Extensión deadline | Modelo nuevo `DeadlineExtensionProposal` |
| Quién puede proponer | Cualquier miembro de cualquiera de los dos equipos |
| Cuántas extensiones | Ilimitadas |
| Validaciones extensión | new > current `deadlineAt` · new < `league.endDate` · new > now() · status del partido ≠ `EXPIRED_UNPLAYED` ni `CONFIRMED` |
| Aceptación | Cualquier miembro del equipo rival (no del mismo equipo del proposer) |
| Lifecycle | Una nueva propuesta supersedea cualquier `PROPOSED` previa |

---

## Sección A: Penalización -1 por no jugar

### Cambio en `standings-calculator.ts`

El input actual `ConfirmedMatch` no tiene `status`. Hay que añadirlo para distinguir partidos jugados de los expirados.

```typescript
type MatchForStandings = {
  teamAId: string;
  teamBId: string;
  status: 'CONFIRMED' | 'ADMIN_RESOLVED' | 'EXPIRED_UNPLAYED';
  winnerTeamId: string | null;
  sets: { gamesA: number; gamesB: number }[];
};
```

Lógica nueva:
- Si `status === 'EXPIRED_UNPLAYED'`: `a.played++; a.points--; b.played++; b.points--;` y `continue` (sin sets, sin ganador).
- Resto del flujo igual para `CONFIRMED` / `ADMIN_RESOLVED`.

### Callers a actualizar

3 sitios cargan partidos para clasificación, todos hay que extender el filtro a incluir `EXPIRED_UNPLAYED`:

1. `src/app/(app)/dashboard/page.tsx` — query `prisma.match.findMany` con `status: { in: ['CONFIRMED', 'ADMIN_RESOLVED'] }` → añadir `'EXPIRED_UNPLAYED'`
2. `src/app/(app)/ligas/[slug]/page.tsx` — misma query (líneas ~38)
3. `src/modules/match-commentary/application/context-builder.ts` — misma query

### Tests

Añadir cases en `tests/unit/modules/leagues/standings-calculator.test.ts`:
- "deducts 1 point from each team when match is EXPIRED_UNPLAYED"
- "EXPIRED_UNPLAYED counts as played but adds no sets/games"
- "mixed CONFIRMED and EXPIRED_UNPLAYED matches sum correctly"

---

## Sección B: Reglamento + Footer + Menu link

### Página `/reglamento`

Ruta: `src/app/(app)/reglamento/page.tsx` (Server Component, hereda auth de `(app)/layout.tsx`).

Contenido en español, formato lectura clara con secciones:

```
✨ Eyebrow: Documentación
H1: Reglamento

## Sistema de puntos
- Ganar partido: 3 puntos
- Empatar: 1 punto
- Perder: 0 puntos
- No jugar (deadline expirado): -1 punto
La clasificación ordena por: puntos → diferencia de sets → diferencia de juegos → sets ganados.

## Reglas de los partidos
- Todos los partidos son al mejor de 3 sets.
- Cada equipo está formado por 2 jugadores.
- Una vez jugado el partido, cualquier jugador puede enviar el resultado.
- El equipo rival tiene 7 días para confirmar o disputar.
- Si pasan 7 días sin respuesta, el resultado se aprueba automáticamente.
- En caso de disputa, un administrador resuelve.

## Calendario y jornadas
- El calendario se genera automáticamente al activar la liga (round-robin).
- Cada jornada tiene una fecha límite (deadline).
- Antes del deadline, los dos equipos deben acordar fecha y hora del partido.
- Cualquier jugador puede proponer fecha; el equipo rival acepta o propone otra.
- Si llega el deadline sin partido jugado, el partido cuenta como no jugado y ambos equipos pierden 1 punto.
- Antes de que llegue el deadline, cualquier equipo puede proponer extender el plazo. El rival debe aceptarlo. Una vez aceptado, el nuevo deadline sustituye al anterior.
- Las extensiones son ilimitadas, siempre dentro del rango de la liga.
- Una vez expirado un partido, ya no se puede revivir.

## Disputas
- Si un equipo no está de acuerdo con un resultado enviado, puede disputarlo dentro de los 7 días.
- La disputa la resuelve un administrador con visibilidad sobre el contexto del partido.
- Resoluciones posibles: dar el partido al equipo X, dar el partido al equipo Y, marcar como no jugado, o desestimar la disputa (mantener el resultado original).
```

Estilo: usa el patrón de la app (`text-brand-navy`, eyebrows, cards `rounded-2xl border-slate-200/80 shadow-sm`).

### Footer

Componente nuevo: `src/app/(app)/_components/footer.tsx` (Server Component).

Estructura:
```
[Logo] [Cuenta]    [App]              [Legal]
       Mi perfil   Ligas              Aviso legal
       Salir       Mis partidos       Privacidad
                   Jugar              Cookies
                   Reglamento

© 2026 Padel League · Todos los derechos reservados
```

Estilo: navy claro o blanco con borde superior, padding generoso, responsive (columnas se apilan en móvil).

Se incluye en `(app)/layout.tsx` después de `<main>`.

### Menu link

- En `nav-links.tsx`: añadir entrada "Reglamento" → `/reglamento`. Activo cuando `pathname === '/reglamento'` (no startsWith porque es exacto).
- En `mobile-menu.tsx`: añadir entrada similar. Posición: después de "Jugar", antes del separador y "Mi perfil".

---

## Sección C: Extensión de deadline

### Schema

```prisma
enum ExtensionProposalStatus {
  PROPOSED
  ACCEPTED
  REJECTED
  SUPERSEDED
}

model DeadlineExtensionProposal {
  id                 String                    @id @default(cuid())
  matchId            String                    @map("match_id")
  proposedByUserId   String                    @map("proposed_by_user_id")
  proposedDeadlineAt DateTime                  @map("proposed_deadline_at")
  status             ExtensionProposalStatus   @default(PROPOSED)
  respondedByUserId  String?                   @map("responded_by_user_id")
  respondedAt        DateTime?                 @map("responded_at")
  createdAt          DateTime                  @default(now()) @map("created_at")

  match     Match @relation(fields: [matchId], references: [id], onDelete: Cascade)
  proposer  User  @relation("ExtensionProposer", fields: [proposedByUserId], references: [id], onDelete: Restrict)
  responder User? @relation("ExtensionResponder", fields: [respondedByUserId], references: [id], onDelete: Restrict)

  @@index([matchId, status])
  @@map("deadline_extension_proposals")
}
```

Back-relations en `Match` (`extensionProposals`) y `User` (`extensionsProposed`, `extensionsResponded`).

Migración manual (Docker no disponible local): `prisma/migrations/20260429120000_deadline_extension_proposals/migration.sql`.

### Service

Ampliar `SchedulingService` con 3 métodos:

```typescript
async proposeDeadlineExtension(
  matchId: string,
  userId: string,
  newDeadlineAt: Date,
): Promise<void>
```
Validaciones:
1. Match existe; user es miembro de teamA o teamB.
2. `match.status` no es `EXPIRED_UNPLAYED`, `CONFIRMED`, `ADMIN_RESOLVED`, `CANCELLED`, `PENDING_VALIDATION`.
3. `newDeadlineAt > match.deadlineAt`.
4. `newDeadlineAt > now()`.
5. `newDeadlineAt < league.endDate`.

Acción:
- Transacción: marcar todas las `PROPOSED` previas del partido como `SUPERSEDED`. Crear nueva con status `PROPOSED`.
- Notificar (fire-and-forget) al equipo rival.

```typescript
async acceptDeadlineExtension(proposalId: string, userId: string): Promise<void>
```
Validaciones:
1. Proposal existe y status `PROPOSED`.
2. User es miembro de un equipo del partido.
3. User NO es del mismo equipo que `proposer` (debe ser rival).
4. Match status sigue siendo extensible (no expirado mientras tanto).

Acción:
- Transacción: marcar proposal `ACCEPTED` con `respondedByUserId` y `respondedAt`. Actualizar `match.deadlineAt = proposedDeadlineAt`.
- Notificar al equipo proposer.

```typescript
async rejectDeadlineExtension(proposalId: string, userId: string): Promise<void>
```
Misma validación que accept. Marca proposal `REJECTED`. Notifica al proposer.

### Server actions

En `src/app/(app)/ligas/[slug]/partidos/actions.ts` (mismo archivo de las acciones existentes):

```typescript
export async function proposeDeadlineExtensionAction(prev, formData): Promise<ActionResult>
export async function acceptDeadlineExtensionAction(prev, formData): Promise<ActionResult>
export async function rejectDeadlineExtensionAction(prev, formData): Promise<ActionResult>
```

Patrón estándar (sesión, parsing, llamada a service, revalidatePath, manejo de UserFacingError).

### UI

Modificar `schedule-section.tsx` (existente) para incluir el flujo de extensión cuando el match es elegible (no expirado, no jugado).

Nuevo sub-panel:
- **Sin propuesta pendiente**: botón "Proponer ampliación de plazo" → expande form con `<input type="date">` + submit.
- **Con propuesta PROPOSED del usuario**: mensaje "Has propuesto extender hasta [fecha]. Esperando al rival.".
- **Con propuesta PROPOSED del rival**: panel "El equipo X propone extender hasta [fecha]" con botones Aceptar/Rechazar.

`schedule-section.tsx` recibe la propuesta activa via props desde el server component padre (`page.tsx`).

`page.tsx` carga la propuesta de extensión activa:
```typescript
const activeExtension = await prisma.deadlineExtensionProposal.findFirst({
  where: { matchId, status: 'PROPOSED' },
  orderBy: { createdAt: 'desc' },
});
```

### Tests

- Unit: validaciones de `proposeDeadlineExtension` (5 casos: éxito + 4 errores)
- Unit: `acceptDeadlineExtension` rechaza si user es del mismo equipo que proposer
- Unit: `rejectDeadlineExtension` cambia status correctamente
- Integration: flujo completo propose → accept → match.deadlineAt actualizado

---

## Fuera de alcance

- Cancelación de propuestas por el propio proposer (puede simplemente esperar a que el rival rechace o sobrescribir con una nueva propuesta).
- Notificaciones email (solo in-app via `NotificationService`).
- Auditoría histórica de extensiones — el modelo guarda todas las propuestas (PROPOSED → ACCEPTED/REJECTED/SUPERSEDED) que sirve como audit log natural.
- Revivir partidos `EXPIRED_UNPLAYED` (decisión explícita del usuario).
- Recálculo retroactivo de clasificaciones de ligas ya finalizadas.
