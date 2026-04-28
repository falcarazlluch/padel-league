# Crónicas IA de partidos — Padel League

## Decisiones

| Aspecto | Decisión |
|---|---|
| Tipos de comentario | **PREVIEW** (pre-partido) + **RECAP** (post-partido) |
| Tono | Roast amistoso / con guasa, irónico pero amable |
| Longitud | 250-400 caracteres (~3-4 frases) |
| Aparece en | Página del partido · feed de la liga (pestaña nueva "Crónicas") · feed del dashboard |
| Disparador PREVIEW | Cuando el partido pasa a `DATE_CONFIRMED` |
| Disparador RECAP | Cuando el resultado pasa a `CONFIRMED` o `ADMIN_RESOLVED` |
| Admins de la liga pueden | Regenerar (sin límite) · editar texto · borrar |
| Etiquetado | Icono ✨ con tooltip "Generado por IA" |
| Lifecycle | Cambio de fecha → mantener PREVIEW · partido cancelado → borrar comentarios · resultado rechazado → borrar RECAP (regenerar al re-confirmarse) |
| Datos enviados a IA | Nombres de equipo, marcador (RECAP), clasificación, últimas rachas. Sin nombres de jugadores. |
| Proveedor | OpenAI (`gpt-4o-mini` por defecto, configurable vía env) |
| Coste | Sin límite global. Feature gobernada por flag `FEATURE_AI_COMMENTARY`. |

---

## Sección 1: Cambios en el schema

Modelo `MatchCommentary` ya existe en `prisma/schema.prisma` con campos básicos. Cambios:

```prisma
enum CommentaryType {
  PREVIEW
  RECAP
}

model MatchCommentary {
  id                 String                @id @default(cuid())
  matchId            String                @map("match_id")
  type               CommentaryType
  provider           AICommentaryProvider
  content            String
  generatedAt        DateTime              @default(now()) @map("generated_at")
  regeneratedCount   Int                   @default(0) @map("regenerated_count")
  rejectedForSafety  Boolean               @default(false) @map("rejected_for_safety")
  promptVersion      String                @default("v1") @map("prompt_version")
  editedAt           DateTime?             @map("edited_at")
  editedByUserId     String?               @map("edited_by_user_id")

  match  Match  @relation(fields: [matchId], references: [id], onDelete: Cascade)
  editor User?  @relation("CommentaryEditor", fields: [editedByUserId], references: [id], onDelete: Restrict)

  @@unique([matchId, type])
  @@index([matchId])
  @@map("match_commentaries")
}
```

**Cambios respecto al schema actual:**
- `@unique([matchId])` → `@@unique([matchId, type])` (permite dos comentarios por partido).
- Nuevo enum `CommentaryType { PREVIEW, RECAP }`.
- Nuevos campos `editedAt`, `editedByUserId` + relación `editor` con `User` (back-relation `editedCommentaries` a definir en el modelo `User`).
- Nuevo `@@index([matchId])` para consultas de feed.

**Migración**: tabla está vacía (feature nunca implementada). `ALTER TABLE` directo.

---

## Sección 2: Arquitectura del módulo

```
src/modules/match-commentary/
├── domain/
│   ├── types.ts              # CommentaryContext, CommentaryRow, CommentaryType
│   └── ai-provider.ts        # interface AIProvider (port)
├── application/
│   ├── context-builder.ts    # Match → CommentaryContext (clasificación + rachas)
│   ├── prompt-builder.ts     # CommentaryContext → string prompt
│   └── match-commentary-service.ts  # generate · regenerate · edit · delete · list
├── infrastructure/
│   └── openai-provider.ts    # OpenAI Chat API → AIProvider
└── index.ts
```

### `AIProvider` (port)

```ts
export interface AIProvider {
  generateCommentary(prompt: string): Promise<{ content: string; model: string }>;
}
```

Hoy hay un único adapter (`OpenAIProvider`). Si en el futuro queremos Claude, se añade otro adapter sin tocar el resto del módulo.

### `OpenAIProvider`

- Usa el SDK oficial `openai` (npm).
- Modelo configurable vía `env().AI_MODEL_OPENAI` (default `gpt-4o-mini`).
- API key vía `env().OPENAI_API_KEY`.
- `temperature: 0.85` (humor/creatividad alta pero acotada).
- `max_tokens: 200` (suficiente para 400 chars).
- Retorna `{ content: string, model: string }`.
- Lanza `Error` con código del proveedor en caso de fallo (rate limit, content policy, etc.).

### `CommentaryContext`

```ts
export type CommentaryContext = {
  type: 'PREVIEW' | 'RECAP';
  league: { name: string };
  teamA: {
    name: string;
    rank: number | null;     // posición en clasificación, null si liga sin matches confirmados
    points: number;
    recent: Array<{ won: boolean; opponent: string }>;  // últimos 3 partidos confirmados
  };
  teamB: {
    name: string;
    rank: number | null;
    points: number;
    recent: Array<{ won: boolean; opponent: string }>;
  };
  // Solo para RECAP:
  result?: {
    sets: Array<{ gamesA: number; gamesB: number }>;
    winnerTeam: 'A' | 'B' | 'DRAW';
  };
  // Solo para PREVIEW:
  scheduledAt?: Date;
};
```

### `MatchCommentaryService`

```ts
export const MatchCommentaryService = {
  async generate(matchId: string, type: CommentaryType, opts?: { regenerate?: boolean }): Promise<void>;
  async regenerate(commentaryId: string, userId: string): Promise<void>;
  async edit(commentaryId: string, userId: string, newContent: string): Promise<void>;
  async delete(commentaryId: string, userId: string): Promise<void>;
  async deleteByMatch(matchId: string): Promise<void>;  // usado al cancelar partido
  async deleteByMatchAndType(matchId: string, type: CommentaryType): Promise<void>;  // usado al rechazar resultado
  async getByMatch(matchId: string): Promise<{ preview: CommentaryRow | null; recap: CommentaryRow | null }>;
  async listForLeague(leagueId: string, limit?: number): Promise<CommentaryRow[]>;
  async listForUser(userId: string, limit?: number): Promise<CommentaryRow[]>;
};
```

**Validaciones:**
- `regenerate`, `edit`, `delete`: verifican que `userId` es `LEAGUE_ADMIN` de la liga del partido. Throw `AuthorizationError` si no.
- `edit`: valida `newContent` con Zod (length 1-1000 chars, trim).
- `generate`: idempotente — si existe `(matchId, type)` y `opts.regenerate !== true`, no-op.

### Prompt (v1)

Stored as constant in `prompt-builder.ts`. Plantilla literal con interpolación de contexto:

```
Eres un cronista de pádel con sentido del humor — irónico pero amable, nunca cruel.
Escribe en español, 250-400 caracteres, máximo 3-4 frases.

CONTEXTO:
- Liga: "{league.name}"
- Equipo A: "{teamA.name}"{ranking_a}
  Últimos partidos: {teamA.recent_formatted}
- Equipo B: "{teamB.name}"{ranking_b}
  Últimos partidos: {teamB.recent_formatted}
{conditional_result_block}

{conditional_instruction_block}

REGLAS:
- No inventes equipos, jugadores, marcadores ni hechos.
- No incluyas datos personales más allá de los nombres de equipo.
- Mantén el tono ligero — sin insultos ni temas sensibles.
- Devuelve solo el texto del comentario, sin comillas ni encabezados.
```

Donde `{conditional_instruction_block}` es:
- **PREVIEW**: *"Escribe una previa con guasa amistosa: pinta el cruce, mete una broma sobre las rachas si las hay, sin spoilers (no sabemos quién ganará)."*
- **RECAP**: *"Escribe la crónica con guasa amistosa: comenta el marcador, lanza un dardo cariñoso al perdedor, mete un guiño a la clasificación si es relevante."*

Si `rank` o `points` son `null` (liga sin partidos confirmados aún), el prompt omite las líneas de clasificación. Si `recent` está vacío, indica explícitamente "Sin partidos previos en la liga".

### `context-builder.ts`

Carga la `Match` con sus relaciones (`league`, `teamA`, `teamB`). Reusa `calculateStandings` de `@/modules/leagues` para obtener clasificación. Para `recent`, consulta los últimos 3 partidos confirmados/admin-resolved donde el equipo participaba (excluyendo el partido actual).

---

## Sección 3: Job handler + triggers

### Cambio en `src/shared/queue/jobs.ts`

```ts
'generate-match-commentary': {
  matchId: string;
  type: 'PREVIEW' | 'RECAP';
  regenerate?: boolean;
};
```

### Handler `src/worker/handlers/generate-match-commentary.ts`

```
1. Lee env().FEATURE_AI_COMMENTARY → si false, log + return (kill switch).
2. Llama MatchCommentaryService.generate(matchId, type, { regenerate }).
3. La service ya hace la validación de idempotencia y la inserción.
4. Si lanza error de provider/transient → re-throw, pg-boss reintenta con backoff.
5. Tras N retries, va a failed_jobs (configurable en pg-boss, default 3).
```

Registrar el handler en `src/worker/index.ts` (o donde se registren los handlers existentes).

### Triggers

| Evento | Acción | Ubicación |
|---|---|---|
| Partido pasa a `DATE_CONFIRMED` | enqueue `{ matchId, type: 'PREVIEW' }` | `SchedulingService.acceptProposal` (al confirmar fecha por ambos equipos) |
| `MatchResult` pasa a `CONFIRMED` (validación rival) | enqueue `{ matchId, type: 'RECAP' }` | `MatchService` — método que confirma el resultado |
| `MatchResult` auto-aprobado | enqueue `{ matchId, type: 'RECAP' }` | `src/worker/handlers/match-auto-approve-result.ts` |
| Disputa resuelta por admin (`ADMIN_RESOLVED`) | enqueue `{ matchId, type: 'RECAP' }` | `MatchService.resolveDispute` (o equivalente) |
| Partido cancelado | `MatchCommentaryService.deleteByMatch(matchId)` | Documentado para el futuro: hoy las matches de liga no tienen flow de cancelación. Si se añade, hay que invocar este método en el mismo punto donde el `Match.status` pase a `CANCELLED`. No requiere implementación en este spec. |
| Resultado rechazado | `MatchCommentaryService.deleteByMatchAndType(matchId, 'RECAP')` | Server action de rechazo / disputa |
| Cambio de fecha tras `DATE_CONFIRMED` | (nada — mantenemos la PREVIEW) | — |

---

## Sección 4: Server actions de admin

Archivo: `src/app/(app)/ligas/[slug]/partidos/[matchId]/commentary-actions.ts` (nuevo).

```ts
'use server';

export async function regenerateCommentaryAction(commentaryId: string): Promise<{ error?: string; success?: true }>;
export async function editCommentaryAction(commentaryId: string, content: string): Promise<{ error?: string; success?: true }>;
export async function deleteCommentaryAction(commentaryId: string): Promise<{ error?: string; success?: true }>;
```

Cada acción:
1. Llama `getValidatedSession(token)` → obtiene `userId`.
2. Llama el método correspondiente de `MatchCommentaryService` (que verifica autorización internamente).
3. Si la acción es `regenerate`, también enqueua el job `generate-match-commentary` con `regenerate: true`.
4. `revalidatePath` de la página del partido + de la página de la liga.
5. Retorna `{ error }` o `{ success: true }`.

---

## Sección 5: UI

### 5.1 Página del partido `/ligas/[slug]/partidos/[matchId]/page.tsx`

Sección nueva entre la cabecera y la zona de resultado. Server Component que carga `MatchCommentaryService.getByMatch(matchId)`.

Renderiza dos cards (una por cada tipo) si existen. Si no existe ninguno, no muestra nada.

Card structure:
```tsx
<article className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
  <header className="flex items-baseline justify-between mb-2">
    <h2 className="text-xs font-bold text-brand-blue uppercase tracking-widest">
      ✨ {type === 'PREVIEW' ? 'Previa' : 'Crónica'}
    </h2>
    <time className="text-xs text-slate-400">{formatDate(generatedAt)}</time>
  </header>
  <p className="text-sm text-slate-700 leading-relaxed">{content}</p>
  {isAdmin && <CommentaryAdminActions commentary={commentary} />}
</article>
```

`<CommentaryAdminActions />` (Client Component nuevo) en `_components/commentary-admin-actions.tsx`:
- 3 botones pequeños inline: **Regenerar** · **Editar** · **Borrar**.
- Regenerar: dispara la action y muestra spinner + toast.
- Editar: abre `<textarea>` inline con el contenido actual + botones Guardar/Cancelar.
- Borrar: `confirm("¿Borrar este comentario?")` y dispara action.

### 5.2 Página de la liga `/ligas/[slug]/page.tsx`

Tercera pestaña: **Clasificación · Partidos · Crónicas**.

Cuando `tab === 'cronicas'`, server component carga `MatchCommentaryService.listForLeague(leagueId, 20)` y renderiza una lista cronológica.

Card de feed (`<CommentaryFeedCard />` reutilizable):
```tsx
<Link href={`/ligas/${slug}/partidos/${match.id}`} className="block bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow p-4">
  <div className="flex items-center justify-between gap-2 mb-2">
    <p className="font-bold text-brand-navy text-sm truncate">
      {teamAName} <span className="text-slate-400 font-normal">vs</span> {teamBName}
    </p>
    {type === 'RECAP' ? (
      <span className="font-mono text-sm font-bold text-brand-navy shrink-0">{score}</span>
    ) : (
      <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full shrink-0">Previa</span>
    )}
  </div>
  <p className="text-sm text-slate-600 leading-relaxed line-clamp-3">{content}</p>
  <p className="text-xs text-slate-400 mt-2">✨ {formatDate(generatedAt)}</p>
</Link>
```

Si la lista está vacía: *"Aún no hay crónicas en esta liga."*

### 5.3 Dashboard `/dashboard/page.tsx`

**Reemplaza** la sección actual "Últimos resultados" por **"Últimas crónicas"**.

Server fetch: `MatchCommentaryService.listForUser(user.id, 5)`.

Misma `<CommentaryFeedCard />` que la liga, con un campo extra para mostrar la liga:

```tsx
<p className="text-xs text-brand-blue mt-1 truncate">{leagueName} · {type === 'PREVIEW' ? 'Previa' : 'Crónica'}</p>
```

Si está vacío: *"Aún no hay crónicas. Cuando se confirmen fechas o resultados de tus partidos, aparecerán aquí."*

### 5.4 Iconografía y disclosure

- Icono **✨** consistente en todas las cards (header de la card en match detail; pie en feeds).
- Tooltip "Generado por IA" al hover.
- Cards editadas (`editedAt != null`) no añaden indicador visual extra (decisión B).

---

## Cambios en archivos existentes

- `prisma/schema.prisma` → migración (Sección 1)
- `src/shared/queue/jobs.ts` → ampliar tipo `generate-match-commentary`
- `src/modules/leagues/application/scheduling-service.ts` → trigger PREVIEW al `acceptProposal`
- `src/modules/leagues/application/match-service.ts` → trigger RECAP al confirmar resultado · trigger RECAP al `resolveDispute` · borrar RECAP al rechazar resultado
- `src/worker/handlers/match-auto-approve-result.ts` → trigger RECAP
- Donde se haga la transición a `CANCELLED` → llamar `deleteByMatch`
- `src/worker/index.ts` (o equivalente) → registrar el nuevo handler
- `src/app/(app)/ligas/[slug]/page.tsx` → nueva pestaña "Crónicas"
- `src/app/(app)/ligas/[slug]/partidos/[matchId]/page.tsx` → renderizar comentarios
- `src/app/(app)/dashboard/page.tsx` → reemplazar "Últimos resultados" por "Últimas crónicas"

## Archivos nuevos

- `src/modules/match-commentary/domain/types.ts`
- `src/modules/match-commentary/domain/ai-provider.ts`
- `src/modules/match-commentary/application/context-builder.ts`
- `src/modules/match-commentary/application/prompt-builder.ts`
- `src/modules/match-commentary/application/match-commentary-service.ts`
- `src/modules/match-commentary/infrastructure/openai-provider.ts`
- `src/modules/match-commentary/index.ts`
- `src/worker/handlers/generate-match-commentary.ts`
- `src/app/(app)/ligas/[slug]/partidos/[matchId]/commentary-actions.ts`
- `src/app/(app)/ligas/[slug]/partidos/[matchId]/_components/commentary-admin-actions.tsx`
- `src/app/(app)/ligas/[slug]/_components/commentary-feed-card.tsx` (reutilizable en liga + dashboard)
- `tests/unit/modules/match-commentary/prompt-builder.test.ts` (snapshot del prompt para PREVIEW vs RECAP, con/sin clasificación, con/sin recent)
- `tests/unit/modules/match-commentary/context-builder.test.ts` (mockea prisma, verifica que se construye el contexto correcto)
- `tests/integration/match-commentary.test.ts` (e2e: crear liga, partido, confirmar fecha, verificar que se llama al provider mock, verificar lifecycle de cancelación)

## Dependencia npm nueva

- `openai` (SDK oficial). Añadir a `package.json`.

---

## Fuera de alcance

- Notificación al usuario cuando una crónica se genera (no enqueua emails ni in-app).
- Reacciones / likes / comentarios humanos sobre las crónicas.
- Comentarios para partidos independientes (`/jugar/[id]`) — los independientes no tienen scoring estructurado.
- UI de gestión de versiones de prompt.
- Telemetría de coste por liga / por mes.
- Soporte multi-idioma (todo en español por ahora).
- Adapter de Claude (la abstracción está, pero no se implementa otro provider en este spec).
