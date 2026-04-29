# Equipos Independientes y Inscripción a Ligas — Design Doc

**Fecha:** 2026-04-29
**Estado:** Aprobado para implementar
**Migración de datos:** No (los datos existentes se eliminan y se regeneran)

---

## 1. Objetivo

Cambiar el modelo de equipos para que sean propiedad del usuario y vivan fuera
de la liga. Un usuario puede tener 0, 1 o varios equipos. Las ligas se abren
con un periodo de inscripción durante el cual los equipos se apuntan, y pueden
darse de baja antes de que la liga arranque.

Esto cubre los puntos:
- **#2**: Apartado "Mis equipos" — crear, invitar, ver.
- **#3**: Apartado "Ligas disponibles" — apuntarse con un equipo elegido.
- **#4**: Borrarse de una liga durante el periodo de inscripción.

---

## 2. Decisiones tomadas

| Pregunta | Respuesta |
|---|---|
| Invitar a un usuario al equipo | Por **email o nombre de usuario**, **requiere aceptación** del invitado vía notificación |
| Equipo recién creado | Se crea con **1 jugador** (el creador); puede mandar 1 invitación pendiente |
| Tamaño máximo del equipo | **2 jugadores** (sigue igual) |
| Periodo de inscripción de la liga | **Nuevo campo obligatorio** en `League`: `registrationStart`, `registrationEnd` |
| Categoría del equipo vs liga | Pueden **no coincidir** — un equipo de cualquier categoría puede apuntarse |
| Apuntarse a una liga | Solo dentro del **periodo de inscripción** y solo si el equipo no está ya apuntado |
| Quién puede apuntar/desapuntar | **Cualquier miembro** del equipo |
| Borrarse de una liga | Solo dentro del periodo de inscripción |
| Notificaciones | A todos los miembros del equipo cuando se apunta o se borra |
| Datos existentes | Se borran y se regeneran |

---

## 3. Modelo de datos (cambios)

### 3.1. `Team` — pasa a ser independiente

**Antes:**
```prisma
model Team {
  leagueId  String   // obligatorio
  ...
  @@unique([leagueId, name])
}
```

**Después:**
```prisma
model Team {
  id        String        @id @default(cuid())
  name      String
  category  TeamCategory  @default(INTERMEDIATE)
  createdByUserId  String  // dueño / creador del equipo
  createdAt DateTime      @default(now())

  members      TeamMember[]
  invitations  TeamInvitation[]
  registrations LeagueRegistration[]
  homeMatches  Match[] @relation("TeamA")
  awayMatches  Match[] @relation("TeamB")
  // … resto de relaciones a partidos independientes y categoryProposals
}
```

- Se elimina `leagueId` y la unique `(leagueId, name)`.
- `createdByUserId` registra quién creó el equipo (solo informativo; *no* da
  permisos especiales — cualquier miembro tiene los mismos derechos).
- Unicidad nueva: `@@unique([createdByUserId, name])` para que un mismo usuario
  no tenga dos equipos con el mismo nombre. (No es global porque distintos
  usuarios pueden llamar igual a sus equipos.)

### 3.2. `LeagueRegistration` — nueva tabla

```prisma
model LeagueRegistration {
  id           String       @id @default(cuid())
  leagueId     String
  teamId       String
  registeredByUserId String
  registeredAt DateTime     @default(now())
  withdrawnAt  DateTime?    // null = activa
  withdrawnByUserId  String?

  league       League @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  team         Team   @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@unique([leagueId, teamId, withdrawnAt])  // un equipo activo único por liga
  @@index([leagueId])
  @@index([teamId])
}
```

Nota sobre la unicidad: PostgreSQL trata `null` como distinto en unique, así
que `@@unique([leagueId, teamId, withdrawnAt])` permite múltiples filas con
`withdrawnAt = null` para distinta combinación leagueId+teamId, pero solo una
con `withdrawnAt = null` para una pareja concreta. Eso permite re-apuntarse
después de haberse borrado, manteniendo el histórico.

### 3.3. `League` — periodo de inscripción

```prisma
model League {
  ...
  registrationStart DateTime  @map("registration_start")
  registrationEnd   DateTime  @map("registration_end")
  startDate         DateTime  @map("start_date")        // sigue siendo el inicio de juego
  endDate           DateTime  @map("end_date")
  ...
}
```

Reglas:
- `registrationStart < registrationEnd <= startDate < endDate`.
- Inscripción permitida cuando `now ∈ [registrationStart, registrationEnd]` y
  la liga está en `DRAFT`.
- Al activar la liga (manual o automáticamente al pasar `startDate`), se
  bloquea cualquier nueva inscripción/baja.

### 3.4. `TeamInvitation` — nueva tabla

```prisma
model TeamInvitation {
  id            String   @id @default(cuid())
  teamId        String
  invitedUserId String                // ya resuelto por email/username
  invitedByUserId String
  status        TeamInvitationStatus  @default(PENDING)
  createdAt     DateTime @default(now())
  resolvedAt    DateTime?

  team          Team @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@unique([teamId, invitedUserId, status])  // evita duplicar PENDING
  @@index([invitedUserId, status])
}

enum TeamInvitationStatus {
  PENDING
  ACCEPTED
  REJECTED
  CANCELLED
}
```

### 3.5. `NotificationType` — nuevos valores

- `TEAM_INVITATION` — invitas a alguien a tu equipo
- `TEAM_INVITATION_ACCEPTED` — el invitado acepta
- `TEAM_INVITATION_REJECTED` — el invitado rechaza
- `LEAGUE_REGISTRATION_ADDED` — un miembro apuntó al equipo a una liga
- `LEAGUE_REGISTRATION_REMOVED` — un miembro desapuntó al equipo

### 3.6. Match y resto

`Match.teamAId` / `teamBId` siguen siendo FK a `Team`. La liga del partido
sigue en `Match.leagueId`. Como dos equipos pueden jugar la misma liga sin
estar dentro del modelo `Team`, todo sigue funcionando — la activación de la
liga genera fixtures sobre los equipos cuyo `LeagueRegistration` está activo
en el momento de la activación.

---

## 4. Cambios funcionales

### 4.1. Mis equipos (`/equipos`)

- **Lista**: equipos donde el usuario actual es miembro.
- **Crear**: nombre + categoría inicial. Tras crear, redirigir a la página del
  equipo para invitar al segundo jugador.
- **Detalle del equipo** (`/equipos/[id]`):
  - Miembros (1 o 2).
  - Invitaciones pendientes (con botón cancelar).
  - Botón "Invitar jugador" (si miembros < 2 y no hay invitación pendiente).
  - Lista de ligas donde está apuntado actualmente + histórico.
- **Invitar**: input para email *o* nombre de usuario; resuelve a `userId` o
  error "no existe ese usuario". Crea `TeamInvitation` + notifica al invitado.
- **Bandeja de invitaciones del invitado**: en `/perfil` (o `/equipos`),
  sección "Invitaciones pendientes" con aceptar/rechazar.

### 4.2. Ligas disponibles (`/ligas`)

La página de ligas ya existe. Añadir:
- Estado calculado por liga: `inscripción abierta` / `cerrada` / `inscripción
  futura`.
- Botón **"Apuntarse"** visible solo si:
  - liga en `DRAFT` y `now ∈ [registrationStart, registrationEnd]`
  - el usuario tiene al menos 1 equipo
  - ese equipo todavía no está apuntado (filtra)
- Si el usuario tiene múltiples equipos elegibles, modal/select para elegir.
- Si ya estás apuntado, badge "Apuntado con: X" + botón "Borrarse" (solo si
  inscripción aún abierta).

### 4.3. Detalle de liga (`/ligas/[slug]`)

- Mostrar fechas: inscripción + temporada.
- Ya no hay "Añadir equipo" para LEAGUE_ADMIN — los equipos se autoapuntan.
  (Conservamos una vía admin para casos excepcionales: TBD si lo dejamos.)
- Botón "Activar liga" sigue ahí. Al activar, se generan fixtures con los
  equipos registrados en ese momento.

### 4.4. Borrarse de una liga

Endpoint en `/ligas/[slug]` o desde `/equipos/[id]`:
- Cualquier miembro del equipo puede invocar.
- Solo en periodo de inscripción + liga en DRAFT.
- Marca `LeagueRegistration.withdrawnAt = now()`.
- Notifica a todos los miembros del equipo.

---

## 5. Cambios en código (alto nivel)

### Eliminamos / refactorizamos:
- `LeagueService.createTeam` — desaparece. La creación de equipo vive en un
  nuevo `TeamService.create` independiente de la liga.
- `LeagueService.addTeamMember` / `removeTeamMember` — desaparecen como están.
  Los reemplazan invitaciones (`TeamService.invite`, `TeamService.acceptInvitation`).
- `Team.leagueId` — fuera del schema, fuera de las queries.

### Nuevo módulo: `src/modules/teams/`
- `application/team-service.ts` — create, invite, acceptInvitation, rejectInvitation, cancelInvitation, listForUser, getById.
- `application/league-registration-service.ts` — register(teamId, leagueId), withdraw(teamId, leagueId), listRegistrationsForLeague, listRegistrationsForTeam.
- `domain/types.ts`.
- `presentation/` — labels para invitation status.
- `index.ts` — barrel.

### Cambios en `LeagueService`:
- `activateLeague` — usa `LeagueRegistration` activos en vez de `league.teams`.
- `getTeams(leagueId)` — devuelve los equipos *registrados activos* en la liga.

### Wipe + reseed:
- Borrar todos los partidos, ligas, equipos, etc.
- Seed regenera datos coherentes con el nuevo modelo.

---

## 6. Plan de ejecución

1. **Migración + schema** — `Team` sin `leagueId`, `LeagueRegistration`,
   `TeamInvitation`, fechas de inscripción, nuevos NotificationType.
2. **Wipe data** — script o migración que borra equipos/ligas existentes.
3. **Backend**:
   - `TeamService` (create, invite + flow, acceptInvitation/reject).
   - `LeagueRegistrationService` (register, withdraw, list).
   - Adaptar `LeagueService` (activate, getTeams, validar registro).
4. **UI**:
   - `/equipos` (lista + crear).
   - `/equipos/[id]` (detalle + invitar + ver inscripciones).
   - Bandeja de invitaciones (en `/perfil` o `/equipos`).
   - Apuntarse/borrarse desde `/ligas` y `/ligas/[slug]`.
   - Form de creación de liga: campos de inscripción.
5. **Server actions** + Zod.
6. **Tests** — TeamService, LeagueRegistrationService, validaciones de fecha,
   guard "ya apuntado".
7. **Reseed** y QA manual end-to-end.

---

## 7. Out of scope (por ahora)

- **Liga admin invita equipos**: si lo necesitamos, añadimos `TeamService.invite`
  variante "by admin" o simplemente que el admin pida al equipo que se apunte.
- **Capacidad máxima de la liga**: no hay límite por ahora.
- **Plazos de pago / fee de inscripción**: fuera.
- **Aprobación manual del LEAGUE_ADMIN**: por ahora la inscripción es directa.

---

## 8. Riesgos

- Reseed pierde el histórico actual (asumido por el usuario).
- Los IDs de equipos cambian, así que cualquier link externo o referencia
  cacheada queda obsoleta. No hay externos hoy.
- Match relations seguirán existiendo apuntando a teams; al borrar todo
  primero (cascade desde league/team), los matches caen también. OK.

---

## 9. Aprobación

Este diseño implementa los puntos #2/#3/#4 con las decisiones que el usuario
confirmó el 2026-04-29. La regeneración de datos elimina el riesgo de
migraciones complejas. Falta confirmación final del usuario antes de empezar.
