# Rediseño UI — Padel League

## Decisiones de diseño

| Aspecto | Decisión |
|---|---|
| Estilo global | Vibrant Sport — nav con gradiente, pills activos, tarjetas con gradiente de marca |
| Logo | 88px de alto, mantiene overflow hacia abajo (`-mb-5`), nav sigue compacto (`py-1`) |
| Alcance | App completa: nav, login, dashboard, ligas, partidos, jugar, formularios |
| Tipografía | Sistema (`ui-sans-serif`) — sin cambios |

---

## Sección 1: Nav + fondo global

**Archivo:** `src/app/(app)/layout.tsx`

### Nav
- Fondo: `bg-gradient-to-r from-brand-navy to-brand-navy-light` en vez de `bg-brand-navy` sólido
- Mantener `py-1` — nav sigue estrecho/compacto
- Logo: `h-22` (88px) con `className="h-22 w-auto object-contain drop-shadow-lg"` y margen negativo inferior (ajustar visualmente, aprox. `-mb-5` o `-mb-6`) para el overflow
- Enlace activo: pill amarillo semitransparente. Necesita leer el pathname para aplicar la clase activa
  - Inactivo: `text-sm font-medium text-white/70 hover:text-white transition-colors`
  - Activo: `text-sm font-medium bg-brand-yellow/20 text-brand-yellow border border-brand-yellow/30 px-3 py-1 rounded-full`
- El componente `(app)/layout.tsx` necesita ser Client Component (`'use client'`) o usar un sub-componente cliente para leer `usePathname()`

### Fondo de página
- `<main>`: cambiar `bg-gray-50` en el wrapper a `bg-[linear-gradient(160deg,#e8eef8_0%,#f0f4fb_40%,#f5f7fa_100%)]`

---

## Sección 2: Login y autenticación

**Archivos:** `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/page.tsx`

### layout.tsx
- El fondo `linear-gradient(135deg, #0D1E45 0%, #1A3268 60%, #0D1E45 100%)` ya es correcto — mantener
- Tarjeta: añadir `border-t-4 border-brand-yellow` para acento superior amarillo
- Reemplazar `<img>` por `<Image>` de `next/image` (fix ESLint + LCP)
- Logo en el auth layout: `width={240} height={96}` con `className="w-4/5 h-auto object-contain"`

### login/page.tsx (y demás páginas auth)
- Inputs: `className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all"`
- Botón submit: `className="w-full py-2.5 bg-gradient-to-br from-brand-navy to-brand-navy-light text-white text-sm font-bold rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-brand-navy/30 mt-1"`

---

## Sección 3: Dashboard

**Archivo:** `src/app/(app)/dashboard/page.tsx`

- Eyebrow text antes del título: `<p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">Panel de control</p>`
- Título: `text-2xl font-extrabold text-brand-navy` (era `text-2xl font-bold text-gray-900`)
- Subtítulo: eliminar o cambiar a `text-sm text-slate-400 mt-0.5`
- Tarjeta navy: `bg-gradient-to-br from-brand-navy to-brand-navy-light rounded-2xl p-5 shadow-lg shadow-brand-navy/25`
  - Número: `text-2xl font-extrabold text-brand-yellow`
  - Label: `text-xs text-white/70 mt-1`
- Tarjeta azul: `bg-gradient-to-br from-brand-blue to-brand-blue-light rounded-2xl p-5 shadow-lg shadow-brand-blue/30`
  - Número: `text-2xl font-extrabold text-white`
  - Label: `text-xs text-white/80 mt-1`
- Tarjeta blanca: `bg-white rounded-2xl p-5 shadow-md border border-white/80`
  - Eliminar emoji como icono — texto directamente
- Botón primario: `bg-gradient-to-br from-brand-navy to-brand-navy-light shadow-md shadow-brand-navy/30 rounded-xl font-bold`
- Botón secundario: `bg-white border border-gray-200 rounded-xl shadow-sm`

---

## Sección 4: Patrones compartidos

Se aplican a todas las páginas de contenido (ligas, partidos, jugar, formularios).

### Tarjetas de contenido (listas)
- Antes: `bg-white rounded-xl border border-gray-200`
- Después: `bg-white rounded-2xl border border-slate-200/80 shadow-sm shadow-slate-200 hover:shadow-md transition-shadow`

### Badges de estado
- Activa/Confirmado: `bg-gradient-to-r from-emerald-50 to-green-100 text-emerald-700 shadow-sm shadow-emerald-100`
- Pendiente: `bg-gradient-to-r from-yellow-50 to-amber-100 text-amber-700 shadow-sm shadow-amber-100`
- Cancelado/Rechazado: `bg-gradient-to-r from-red-50 to-rose-100 text-red-600 shadow-sm`
- Abierto: `bg-gradient-to-r from-blue-50 to-sky-100 text-blue-700 shadow-sm`

### Botones
- **Primario**: `bg-gradient-to-br from-brand-navy to-brand-navy-light text-white font-bold rounded-xl shadow-md shadow-brand-navy/30 hover:opacity-90 transition-opacity`
- **Secundario**: `bg-white border border-gray-200 text-slate-700 font-semibold rounded-xl shadow-sm hover:bg-gray-50 transition-colors`
- **Destructivo**: `bg-red-50 border border-red-200 text-red-600 font-semibold rounded-xl hover:bg-red-100 transition-colors`
- **Pill pequeño**: `bg-brand-navy/8 text-brand-navy font-semibold rounded-full border border-brand-navy/15 text-xs px-3 py-1`

### Inputs
- Reposo: `bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent focus:bg-white transition-all`
- Aplicar a todos los `<input>`, `<select>` y `<textarea>` de la app

### Cabeceras de página
```tsx
// Patrón estándar para todas las páginas
<div>
  <p className="text-xs font-semibold tracking-widest uppercase text-brand-blue mb-1">{eyebrow}</p>
  <h1 className="text-2xl font-extrabold text-brand-navy">{title}</h1>
  <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>
</div>
```

---

## Sección 5: Páginas de contenido

Todas las páginas aplican los patrones de la Sección 4. Cambios específicos:

### /ligas (list + detail)
- Cabecera con eyebrow "Temporada 2026" / "Liga"
- Tarjetas de liga con el patrón de sombra suave
- Tabs en la página de detalle: tab activo con `border-b-2 border-brand-yellow text-brand-navy font-bold`, inactivo con `text-slate-400`

### /partidos
- Tarjetas de partido: equipos en `font-bold text-brand-navy`, metadata en `text-slate-400`
- Badge de liga en `text-brand-blue bg-brand-blue/10 rounded-full`

### /jugar
- Tab "Tablón" / "Mis partidos": subrayado `brand-yellow` en activo
- Slots libres: badge verde (`text-emerald-700 bg-emerald-50`)
- Avatares de participantes: gradiente `from-brand-navy to-brand-navy-light` para el organizador, `from-brand-blue to-brand-blue-light` para otros

### Formularios (/ligas/nueva, /jugar/nuevo, etc.)
- Todos los inputs siguen el patrón de la Sección 4
- Labels: `text-sm font-medium text-slate-700`
- Botón submit: patrón primario con gradiente

---

## Fuera de alcance

- Cambios en lógica de negocio o rutas
- Componentes de React reutilizables (no se extraen en este rediseño)
- Modo oscuro
- Animaciones o transiciones complejas (solo `transition-colors`, `transition-shadow`, `transition-opacity`)
