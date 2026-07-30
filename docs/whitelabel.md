# Whitelabel multi-tenant (p. ej. RACC)

Una **Organización** es un tenant servido en su propio subdominio
(`racc.mypadelleague.es`) con branding propio y un entorno **aislado**: solo ve
sus competiciones, sus parejas y sus jugadores.

## Modelo

| Concepto | Dónde vive |
| --- | --- |
| Tenant | `organizations` (`slug` = subdominio, colores, logo, lema) |
| Pertenencia | `organization_members` (`ORG_ADMIN` \| `ORG_PLAYER`) |
| Frontera de aislamiento | `leagues.organization_id`, `teams.organization_id` |
| Enlace de inscripción | `tournament_invite_links` (multi-uso, revocable) |
| Estado del wizard | `tournament_enrollments` (1 fila por torneo × usuario) |
| Invitación a la pareja | `tournament_partner_invites` (usuario existente **o** email) |

`organization_id = NULL` **es** la plataforma pública (`mypadelleague.es`). No es
"sin tenant": es el tenant por defecto, y toda query lo filtra igual que a RACC.

La identidad es compartida: un mismo email es una sola cuenta y puede pertenecer
a varias organizaciones. Lo que cambia por tenant es **qué ve**.

## Resolución del tenant

1. `src/middleware.ts` lee el `Host`, extrae el slug con
   `tenantSlugFromHost()` y lo sella en la cabecera `x-org-slug` (`''` = pública).
2. Los server components leen `getTenant()` / `getTenantId()`
   (`src/shared/tenant/context.ts`), memoizado con `React.cache` → una sola
   consulta por render.
3. Las rutas bajo `/api/**` están fuera del `matcher` del middleware, así que
   `getTenant()` cae a parsear el `Host` directamente. Es intencionado.

Subdominios reservados (`www`, `api`, `admin`, `cdn`…) y los hosts
`*.vercel.app` nunca son tenants. Una organización con `is_active = false`
resuelve a `null`, así que su subdominio se comporta como la app pública en
lugar de filtrar un tenant desactivado.

### Desarrollo local

- `http://racc.localhost:3000` funciona directamente en Chrome y Safari.
- Si tu resolver no soporta subdominios de `localhost`, abre
  `http://localhost:3000/dashboard?org=racc` **una vez**: el middleware guarda
  una cookie `padel_org_dev` y el resto de la navegación se queda en el tenant.
  El override se ignora por completo en producción (`NODE_ENV === 'production'`),
  donde el subdominio es la única fuente de verdad.
- `?org=` vacío borra la cookie y vuelves a la plataforma pública.

### Producción (Vercel)

1. Añade el dominio comodín `*.mypadelleague.es` al proyecto.
2. Crea el registro DNS `CNAME *  →  cname.vercel-dns.com`.
3. Define `ROOT_DOMAIN=mypadelleague.es`.

## Permisos

| Acción | Quién |
| --- | --- |
| Crear una organización, activar/desactivar, designar `ORG_ADMIN` | `SUPER_ADMIN` de plataforma (`/admin/organizaciones`, solo en el apex) |
| Crear competiciones del tenant, generar/revocar enlaces, ver el estado de inscripciones | `ORG_ADMIN` de **esa** organización |
| Inscribirse | cualquier miembro (`ORG_PLAYER`) |

Un `LEAGUE_ADMIN` global **no** manda dentro de un tenant: ese rol gobierna solo
la plataforma pública. Y un `ORG_ADMIN` no puede nombrar más `ORG_ADMIN`, lo que
deja fuera la escalada de privilegios dentro del tenant.

Entrar en el subdominio sin pertenecer a la organización no da 404: el layout
de `(app)` devuelve `TenantAccessDenied`, que explica que hace falta el enlace de
inscripción y no revela nada más que el nombre público del club.

## Flujo de inscripción guiada

```
ORG_ADMIN                        Jugador                          Pareja
────────                         ───────                          ──────
crea torneo
genera enlace  ──────────────▶   /inscripcion/<token>
                                 │
                                 ├ sin sesión → /registro?inviteToken=…
                                 │              (el enlace sustituye al
                                 │               código de invitación y
                                 │               da de alta en la org)
                                 │  o /login?next=/inscripcion/<token>
                                 │
                                 ├ paso 1  el torneo → "Empezar"
                                 ├ paso 2  nombre + teléfono + nivel
                                 ├ paso 3  pareja:
                                 │    a) ya existe y está completa
                                 │         → inscritos YA + aviso a la pareja
                                 │    b) invitar (usuario o email)
                                 │         → enlace + email + notificación ──▶ /pareja/<token>
                                 │                                              │
                                 │    c) todavía no lo sé                       ├ acepta → se unen al
                                 │         → estado "SIN confirmar"             │  equipo + inscripción
                                 │                                              │  + aviso al que invitó
                                 └ paso 4  ✅ / ⏳ / ⚠️  + checklist            └ rechaza → aviso, vuelve
                                                                                   al paso 3
```

### El contrato "no puedo tener dudas"

El estado vive **solo** en `tournament_enrollments`; no hay estado de wizard en
el cliente que pueda desincronizarse. Todo lo que se muestra sale de
`EnrollmentService.getView()`, y las tres superficies que lo cuentan
(último paso del wizard, `/inscripcion/estado/<slug>`, banner del dashboard)
comparten el mismo componente `EnrollmentChecklist`, así que no pueden
contradecirse.

Reglas que sostienen el contrato:

- **`AWAITING_PARTNER_ACCEPT` nunca cuenta como inscrito.** La
  `LeagueRegistration` se crea únicamente cuando la pareja está completa.
- Unirse al equipo, crear la inscripción y cerrar **las dos**
  `tournament_enrollments` (la de quien invita y la de la pareja) ocurre en una
  sola transacción. No hay ventana en la que uno crea estar dentro y el otro no.
- El paso 4 es alcanzable siempre que exista la inscripción: es la pantalla de
  estado, no un premio. Solo el paso 3 tiene prerrequisito (el perfil).
- Anular propaga: retira la `LeagueRegistration`, avisa a la pareja y limpia su
  enrollment espejo, para que su pantalla no siga diciendo "confirmada".
- Abrir el enlace es una lectura pura. El enrollment se crea al pulsar
  "Empezar", así que un enlace reenviado por WhatsApp no apunta a nadie sin
  querer.
- `EnrollmentService.start()` es idempotente y solo cuenta un uso del enlace la
  primera vez.

### Motivos de bloqueo

Ni el enlace de inscripción ni la invitación de pareja devuelven un error
genérico. Siempre hay una razón concreta —`REVOKED`, `EXPIRED`,
`MAX_USES_REACHED`, `REGISTRATION_NOT_OPEN_YET`, `REGISTRATION_CLOSED`,
`COMPETITION_STARTED`, `ALREADY_RESOLVED`, `TEAM_FULL`, `WRONG_ACCOUNT`— con su
mensaje en `BLOCKED_MESSAGE` / `PARTNER_BLOCKED_MESSAGE`.

## Branding

`OrgBrandStyle` sobreescribe las custom properties `--color-brand-*` en el
layout raíz, así que **todas** las utilidades `bg-brand-navy` / `text-brand-blue`
del proyecto repintan solas: no hay que tocar componente por componente. Los
colores se validan como hex de 6 dígitos al escribir (`OrganizationService`) y
otra vez al renderizar (`safeColor`), porque acaban dentro de un `<style>`.

Cada subdominio es un origen propio → `manifest.webmanifest`, `<title>`,
`theme-color` e iconos son del tenant, y la PWA se instala como "RACC".

Los emails que salen de un tenant usan `wrapEmail({ brand })`: cabecera con el
logo del club y enlaces a su subdominio.

## Borrado de organizaciones

No se expone. `leagues.organization_id` cascadea a `leagues`, pero
`matches.league_id` es `RESTRICT`, así que en cuanto hay partidos jugados el
borrado fallaría a medias. La operación soportada es **desactivar**
(`is_active = false`), que apaga el subdominio y conserva el histórico.

## Añadir un tenant

1. Entra como `SUPER_ADMIN` en el apex → `/admin/organizaciones`.
2. Crea la organización (nombre, slug, colores, logo).
3. Añade al contacto del club por email con rol *Administrador*.
4. Ese admin entra en `https://<slug>.<ROOT_DOMAIN>`, crea el torneo y genera el
   enlace de inscripción desde la ficha de la competición.
