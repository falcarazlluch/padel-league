# Partidos Independientes — Design Spec

## Objetivo

Permitir a los usuarios organizar partidos fuera del calendario de ligas: tanto partidos abiertos donde cualquier jugador puede unirse (OPEN) como retos directos entre dos equipos de una liga (TEAM_CHALLENGE). El alcance es exclusivamente coordinación (fecha, lugar, participantes) — sin registro de resultados.

---

## Modelo de datos

### Cambios en `IndependentMatch` (modelo ya existente)

Añadir campos:
- `type IndependentMatchType` — enum `OPEN | TEAM_CHALLENGE`
- `challengedTeamId String?` — FK a `Team`, solo para `TEAM_CHALLENGE`
- `leagueId String?` — FK a `League`, opcional (para retos entre equipos de una liga)

Enum `IndependentMatchType`:
```prisma
enum IndependentMatchType {
  OPEN
  TEAM_CHALLENGE
}
```

### Statuses por tipo

| Tipo | Flujo de status |
|------|----------------|
| `OPEN` | `OPEN` → `CONFIRMED` (lleno) \| `CANCELLED` |
| `TEAM_CHALLENGE` | `OPEN` → `PENDING_APPROVAL` → `CONFIRMED` \| `REJECTED` \| `CANCELLED` |

> El status `PENDING_APPROVAL` indica que el reto fue enviado y está esperando respuesta del equipo retado.

### Nuevo modelo: `IndependentMatchInvitation`

```prisma
model IndependentMatchInvitation {
  id        String    @id @default(cuid())
  matchId   String
  match     IndependentMatch @relation(fields: [matchId], references: [id])
  email     String
  token     String    @unique @default(uuid())
  expiresAt DateTime
  acceptedAt DateTime?
  createdAt DateTime  @default(now())
}
```

Usado para todos los casos de invitación por email — tanto usuarios registrados como externos. Los tokens expiran a los 7 días.

### Modelos existentes sin cambios

- `IndependentMatchParticipant` — un registro por cada participante confirmado en el partido
- `IndependentMatchJoinRequest` — solicitud de unirse a un partido OPEN, con estado `PENDING | APPROVED | REJECTED`

---

## Navegación

Se añade **"Jugar"** como nuevo ítem en la barra de navegación principal (entre "Mis partidos" y "Disputas").

### Estructura de rutas

```
/jugar                     Hub con dos tabs: "Tablón" y "Mis partidos"
/jugar/nuevo               Formulario de creación (elige tipo)
/jugar/[id]                Detalle del partido
```

Los partidos de liga en "Mis partidos" (ruta `/partidos`) no cambian. Los partidos independientes viven exclusivamente en `/jugar`.

---

## Flujo 1: Partido OPEN

### Creación

El organizador rellena:
- Nombre del partido
- Ubicación
- Fecha y hora (opcional, puede dejarse sin fijar)
- Descripción (opcional)
- Número máximo de jugadores: 2 o 4 (default 4)

El organizador queda automáticamente como primer `IndependentMatchParticipant`. Status inicial: `OPEN`.

### Descubrimiento (Tablón)

Tab "Tablón" en `/jugar` lista todos los partidos con `type = OPEN` y `status = OPEN` que aún tienen plazas disponibles. Cada card muestra: nombre, ubicación, fecha, plazas `(ocupadas/máximo)`, descripción.

### Unirse (usuario registrado, sin invitación)

1. Usuario pulsa "Unirme" en el tablón o en la página de detalle.
2. Se crea `IndependentMatchJoinRequest` con estado `PENDING`.
3. El organizador recibe notificación in-app.
4. En `/jugar/[id]`, el organizador ve las solicitudes pendientes y puede aprobar o rechazar cada una.
5. Al aprobar: se crea `IndependentMatchParticipant` para ese usuario.
6. Al alcanzar `maxPlayers` participantes: status del partido → `CONFIRMED` y desaparece del tablón.

### Invitar por email

El organizador, desde `/jugar/[id]`, puede invitar a cualquier persona por email:

1. Escribe la dirección de email y pulsa "Invitar".
2. El sistema crea `IndependentMatchInvitation` (token UUID, expira en 7 días).
3. Se envía email (Resend) con enlace `/jugar/[id]?token=<token>`.
4. **Si el usuario ya existe en la plataforma**: también recibe notificación in-app.
5. Al seguir el enlace:
   - Usuario registrado: se une directamente (se crea `IndependentMatchParticipant`), sin pasar por la cola de solicitudes.
   - Usuario no registrado: se le dirige al flujo de registro. Tras registrarse, el token sigue activo y lo une automáticamente al partido.
6. Si el token ha expirado: página de error amigable ("El enlace ha expirado. Pide al organizador que te reenvíe la invitación.").
7. Si el partido ya está lleno: página de error ("Este partido ya está completo.").

---

## Flujo 2: TEAM_CHALLENGE (reto entre equipos)

### Creación

Disponible solo para usuarios que sean miembros de al menos un equipo en una liga `ACTIVE`. El organizador:

1. Selecciona su equipo (selector con los equipos en los que participa).
2. Selecciona el equipo retado (de la misma liga; no puede ser el mismo equipo).
3. Propone ubicación y fecha/hora (ambos opcionales).
4. Crea el reto → status `OPEN`.

Validación en servidor: ambos equipos deben pertenecer a la misma liga. El organizador no puede retar a su propio equipo.

### Notificación al equipo retado

Al crear el reto:
- Todos los miembros del equipo retado reciben **notificación in-app + email** informando del reto, con enlace a `/jugar/[id]`.
- Status cambia a `PENDING_APPROVAL`.

### Aceptar / Rechazar

Cualquier miembro del equipo retado puede entrar a `/jugar/[id]` y ver el reto con botones "Aceptar" y "Rechazar".

- **Primera persona que actúa decide por el equipo** (race condition: el servidor verifica que el status sea aún `PENDING_APPROVAL` antes de procesar).
- **Aceptar** → status `CONFIRMED`. Los 4 miembros (2 de cada equipo) se añaden automáticamente como `IndependentMatchParticipant`. Todos reciben notificación in-app + email.
- **Rechazar** → status `REJECTED`. El organizador recibe notificación in-app + email.
- Si el reto ya fue resuelto (race condition): el servidor devuelve error amigable ("Este reto ya fue respondido.").

### Cancelación

El organizador puede cancelar un reto en cualquier estado (`OPEN`, `PENDING_APPROVAL`, `CONFIRMED`) → status `CANCELLED`. Todos los participantes reciben notificación in-app + email.

---

## Página de detalle `/jugar/[id]`

Contenido adaptado al tipo y estado del partido:

| Estado / Rol | Contenido visible |
|---|---|
| OPEN + organizador | Lista de participantes, solicitudes pendientes (aprobar/rechazar), formulario de invitación por email, botón cancelar |
| OPEN + no participante | Info del partido, plazas disponibles, botón "Unirme" |
| OPEN + solicitud enviada | Info del partido, "Solicitud pendiente de aprobación" |
| PENDING_APPROVAL + equipo retado | Info del reto, botones "Aceptar" / "Rechazar" |
| CONFIRMED | Lista de participantes, info del partido, (botón cancelar solo para organizador) |
| REJECTED / CANCELLED | Info del partido con estado visible |

---

## Emails (Resend)

Tres plantillas nuevas:

1. **Invitación a partido** — para usuario existente o nuevo. Incluye nombre del partido, organizador, fecha/lugar si los hay, enlace con token.
2. **Reto recibido** — para miembros del equipo retado. Incluye nombres de ambos equipos, organizador, enlace al partido.
3. **Reto aceptado / rechazado** — para el organizador del reto. Indica quién respondió y el resultado.

Reutilizar el componente `@react-email/components` ya usado en el proyecto.

---

## Casos límite

| Caso | Comportamiento |
|---|---|
| Token expirado | Página de error con instrucción de pedir reenvío |
| Partido lleno al seguir token | Página de error "Partido completo" |
| Race condition al aceptar reto | El segundo en actuar recibe error 409 amigable |
| Usuario sin equipo intenta crear reto | La opción TEAM_CHALLENGE no aparece en el formulario |
| Invitación duplicada (mismo email, mismo partido) | Servidor devuelve el token existente si no ha expirado; crea uno nuevo si expiró |

---

## Testing

- **Unit**: `calculateAvailableSlots(match, participants)`, validación de token (expirado / usado / válido), lógica de race condition en aceptar reto.
- **Integration**: flujo completo de creación OPEN → solicitud → aprobación → CONFIRMED; flujo TEAM_CHALLENGE → notificación → aceptar → CONFIRMED; flujo de invitación por email (usuario existente y nuevo).
- **UI manual**: golden path de cada flujo en local con seed data.

---

## Fuera de alcance

- Resultado de partidos independientes (no hay reporte de marcador).
- Chat o comentarios en el partido.
- Repetir / clonar un partido existente.
- Búsqueda / filtrado avanzado en el tablón (localización geográfica, nivel, etc.).
