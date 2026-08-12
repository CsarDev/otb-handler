# Design: Advanced Configurable Pagination (paginacion-avanzada)

## Context

The archived `multiselect-paginacion-listas` change (implemented and verified) shipped the shared `Paginated<T>` envelope (D33), `parsePaginacion` (D33), and a minimal prev/next `Pagination` component (D37, `packages/ui/src/components/pagination.tsx`, 58 lines) with decisions D33–D41 standing. This change upgrades that foundation:

1. **Component is minimal.** `pagination.tsx` renders only prev/next + "Página X de Y". No page numbers, no first/last, no ellipsis, no `aria-current="page"`, no page-size selector, no `maxSlots`. As lists grow (multas, aportes, and especially libro diario — which grows with every payment), prev/next-only navigation is impractical and rows per page cannot be controlled.
2. **Per-list store state exists but is not user-configurable.** `apps/web/src/stores/app.store.ts` holds `multasPage/PageSize/Total` (lines 118–125, 310–350) and `aporteRegistrosPage/PageSize/Total` (lines 107–114, 257–298) with `setMultasPage`/`setAporteRegistrosPage` (D38 pattern: single page-mutation action, effect deps `[tab, filters, setter]` exclude the page field → loop guard). The page size is hard-wired to 25.
3. **Libro diario is NOT paginated.** `GET /api/reportes/libro-diario` (`packages/api/src/routes/reportes.ts:83–135`) returns a BARE ARRAY ordered by `fecha` only (non-deterministic for same-date rows), no total, no limit. The store (`fetchLibroDiario`, `app.store.ts:628–645`) types it as `LibroDiarioEntry[]`; `reportes.tsx` renders it fully (table 268–304, cards 306–326).

The delta specs (`pagination`, `reports`, `paginacion-window`) encode the accepted product decisions. This design turns them into concrete architecture decisions D42–D51 that continue the archived D-numbering (archived used D33–D41).

**Domain context** (per PROJECT_KNOWLEDGE.md — Phase 4, Contabilidad): "Libro diario, mayor, balance general" is the OTB accounting ledger; every payment creates a `movimientos` row, so libro diario is the fastest-growing list in the app — the strongest justification for paginating it. The legacy PHP app (`js/reportes.js`) also had a reportes view with filter presets, which the React `reportes.tsx` replaces.

## Goals

- **G1** — Upgrade `Pagination` ADDITIVELY: optional props `onPageSizeChange?`, `pageSizeOptions?` (default `[10, 25, 50, 100]`), `maxSlots?` (default 7); the 2 existing call sites (multas.tsx:361–366, aportes.tsx:599–604) compile with zero changes. (pagination spec, MODIFIED Requirement)
- **G2** — Standard navigation: `[Primera][Anterior][page numbers][Siguiente][Última]` + "Página X de Y", ellipsis window via the NEW pure `paginasVisibles` helper (`packages/ui/src/lib/paginacion-window.ts`), `aria-current="page"` on the current page button. (pagination spec + paginacion-window spec)
- **G3** — Native `<select>` page-size selector, `aria-label="Filas por página"`, LEFT of the controls, rendered ONLY when `onPageSizeChange` is provided; options `[10, 25, 50, 100]`, default 25, none above the server cap (100). (pagination spec, Configurable Page Size requirement)
- **G4** — Responsive: below `sm:` (640px) hide numbers + first/last (`hidden sm:flex`), keep prev / info / next + size select; `sm:` NOT `md:`, matching the app-wide table↔cards breakpoint. (pagination spec, Responsive requirement)
- **G5** — Store page-size setters `setMultasPageSize(size, filters)` / `setAporteRegistrosPageSize(size, filters)` / `setLibroDiarioPageSize` — clamp to options, reset page to 1, single refetch; existing reset effects (`[tab, filters, setter]`) do not include pageSize → no double-fetch. (pagination spec, Configurable Page Size scenarios)
- **G6** — `GET /api/reportes/libro-diario` → ALWAYS envelope `{ items, total, page, pageSize }` via `parsePaginacion` (defaults 1/25, cap 100), deterministic `ORDER BY fecha ASC, id DESC` (tiebreak for same-date rows), `total` = filtered COUNT mirroring the same FROM + LEFT JOIN + WHERE; the only consumer (reportes.tsx via app.store.ts) updated in the same change. (reports spec)

## Non-Goals

- Paginating socios (~17 rows), egresos, asistencia, dashboard/config/definiciones/pagos-modal (proposal).
- localStorage persistence of page size (app has zero localStorage usage today; additive later).
- Paginating any endpoint beyond multas / aportes / libro diario; changing the existing multas/aportes envelope shapes.
- Adding a "últimos 30 días" default filter to libro diario — the current handler (reportes.ts:92–112) has NO date default despite the main reports spec scenario claiming one (see D51); this change preserves the EXISTING filter semantics verbatim and only adds pagination.
- Schema changes / migrations (no new index for the ORDER BY — same rationale as D34; movimientos is small).
- Changing `fetchLibroDiario`'s error handling (it silently sets `reportsLoading: false` on failure today — preserved).

## Technical Approach

Three layered workstreams mirroring the archived change:

1. **UI contract** (`packages/ui`): rewrite `pagination.tsx` additively (D42–D46), NEW pure helper `paginacion-window.ts` + its vitest suite (D43), export both + `DEFAULT_PAGE_SIZE_OPTIONS` from `@otb/ui`.
2. **Store** (`apps/web/src/stores/app.store.ts`): page-size setters for the 3 lists + libro diario page/pageSize/total state + `fetchLibroDiario` refactor to `(filters?, page?)` with envelope unpack (D47).
3. **API** (`packages/api/src/routes/reportes.ts`): libro diario envelope + `parsePaginacion` reuse + deterministic order + filtered COUNT (D48), then route wiring in `reportes.tsx` (D49).

## Architecture Decisions

### Decision: Component API extension — additive contract (D42)

**Choice**: `PaginationProps` gains three OPTIONAL props; the four existing required props are untouched:

```ts
// ── packages/ui/src/components/pagination.tsx (D42) ─────────────────────────
export type PaginationProps = {
  page: number;                     // página actual (1-based)
  total: number;                    // total de filas FILTRADAS (envelope.total)
  pageSize: number;                 // filas por página (envelope.pageSize)
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void; // presente → renderiza el <select> (D45)
  pageSizeOptions?: number[];       // default DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
  maxSlots?: number;                // default 7 — ventana de `paginasVisibles` (D43)
};
```

**Backward-compat proof** (verified by grep on Aug 2026): the ONLY two `Pagination` call sites in the repo are `apps/web/src/routes/multas.tsx:361–366` and `apps/web/src/routes/aportes.tsx:599–604`. Both pass exactly the four required props (`page`, `total`, `pageSize`, `onPageChange`). Since all new props are optional, both sites compile unchanged. `apps/desktop` and `apps/mobile` contain zero `Pagination` imports (grep: 0 matches).

**Interpretation of "render unchanged"**: the proposal's phrase means compile-level compatibility + preserved regression BEHAVIORS, not identical pixels. The delta spec's MODIFIED requirement is authoritative: the component now SHALL render `[Primera][Anterior][page numbers][Siguiente][Última]` unconditionally — page numbers/first/last are the feature, not a flag. What stays gated is the SIZE SELECTOR (`onPageSizeChange` absent → no `<select>`) and the defaults (`pageSizeOptions`/`maxSlots` absent → `[10,25,50,100]` / 7). The `(IMPLEMENTED — regression)` scenarios — next enabled on page 1 of a multi-page list, prev disabled on page 1, next disabled on last page, `total=0 → null` — all hold under the new layout (verified in D44).

**Alternatives considered**: gating the new navigation behind a `variant`/`showNumbers` flag — rejected (defeats the purpose: the two call sites SHOULD gain numbers; the spec makes the full navigation unconditional); a breaking required-prop change — rejected (would force edits at both call sites, contradicting the additive contract). **Rationale**: optional props + unconditional navigation is the smallest diff that satisfies the spec's MODIFIED requirement while keeping the API additive.

### Decision: Ellipsis window — `paginasVisibles` in `paginacion-window.ts` (D43)

**Choice**: NEW pure module `packages/ui/src/lib/paginacion-window.ts`, exported from `@otb/ui`:

```ts
// ── packages/ui/src/lib/paginacion-window.ts (D43) ──────────────────────────
export type PaginaSlot = number | 'ellipsis';

/**
 * Ventana de números de página para el Pagination (D43).
 * Set visible = {1, totalPages, page-1, page, page+1} ∩ [1, totalPages], ordenado;
 * 'ellipsis' donde el gap entre consecutivos es > 1. totalPages ≤ maxSlots → TODAS
 * las páginas sin ellipsis. NUNCA excede maxSlots elementos. Determinista y sin
 * efectos (pura). `page` NO se clampea ANTES del set: los vecinos fuera de rango
 * se descartan por la intersección (p.ej. paginasVisibles(30, 20) → [1,'ellipsis',20]).
 */
export function paginasVisibles(page: number, totalPages: number, maxSlots = 7): PaginaSlot[] {
  const tp = Math.max(1, totalPages);
  if (tp <= maxSlots) return Array.from({ length: tp }, (_, i) => i + 1);

  const nums = [...new Set([1, tp, page - 1, page, page + 1])]
    .filter((n) => n >= 1 && n <= tp)
    .sort((a, b) => a - b);

  // Guard de cap SOLO para maxSlots < 7 (config custom): quita números interiores
  // (nunca 1, tp ni `page`) hasta que números + ellipsis quepan en maxSlots.
  // Con el default 7 el set (≤5 números) + ellipsis (≤2) ya cumple (≤7) — el guard
  // jamás se dispara en los casos pinneados por el spec.
  let final = nums;
  while (final.length + contarEllipsis(final) > maxSlots && final.length > 2) {
    const candidato =
      final.find((n) => n !== 1 && n !== tp && n !== page) ??
      final.find((n) => n !== 1 && n !== tp) ??
      page;
    final = final.filter((n) => n !== candidato);
  }

  const out: PaginaSlot[] = [];
  for (let i = 0; i < final.length; i++) {
    if (i > 0 && final[i] - final[i - 1] > 1) out.push('ellipsis');
    out.push(final[i]);
  }
  return out;
}

function contarEllipsis(nums: number[]): number {
  let e = 0;
  for (let i = 1; i < nums.length; i++) if (nums[i] - nums[i - 1] > 1) e++;
  return e;
}
```

**Verification against the spec's exact outputs** (paginacion-window spec + pagination delta):

| Call | Expected | How the algorithm produces it |
|------|----------|------------------------------|
| `(3, 5)` | `[1,2,3,4,5]` | tp=5 ≤ 7 → all, no ellipsis |
| `(5, 20)` | `[1,'ellipsis',4,5,6,'ellipsis',20]` | set {1,4,5,6,20}; gaps 1→4, 6→20 |
| `(1, 20)` | `[1,2,'ellipsis',20]` | set {1,2,20}; 0 descartado; gap 2→20 |
| `(20, 20)` | `[1,'ellipsis',19,20]` | set {1,19,20}; 21 descartado; gap 1→19 |
| `(10, 20)` | `[1,'ellipsis',9,10,11,'ellipsis',20]` | ellipsis en ambos lados |
| `(9, 2)` | `[1,2]` | tp=2 ≤ 7 → all (página fuera de rango aún navegable) |
| `(30, 20)` | `[1,'ellipsis',20]` | page NO clampeada: {1,20,29,30,31}∩[1,20] = {1,20} |
| sweep 1..10_000 | length ≤ 7 | máx 5 números + 2 ellipsis = 7 |

**Why ±1, NOT ±2**: the visible set is `{1, totalPages, page-1, page, page+1}` — a ±1 window around the current page. This is locked by the spec examples: page 5 of 20 → `1 … 4 5 6 … 20` (NOT `1 … 3 4 5 6 7 … 20`). A ±2 window would consume 6 numbers + 2 ellipses = 8 slots, exceeding maxSlots=7 — the ±1 window is the maximal symmetric neighborhood that fits the 7-slot budget with the 1/N anchors. Rationale for the default 7: the pinned spec examples (5 numbers + 2 ellipses) exactly fill 7 slots; odd maxSlots keeps the current page centered.

**Why pure/testable**: no I/O, no React, no store — deterministic function of `(page, totalPages, maxSlots)`. This is what makes it the package's FIRST unit-testable module (D50).

**Alternatives considered**: `react-paginate`/headlessui — rejected (zero-dep precedent from D31/D37, nothing in the lockfile); inline the window in the component — rejected (the paginacion-window spec mandates a dedicated exported helper + dedicated suite); a `±2` window — rejected (violates the locked examples and the 7-slot cap). **Rationale**: the spec pins exact outputs; the set+intersection formulation is the minimal deterministic construction that satisfies every pinned case, including out-of-range pages, without special-casing.

### Decision: Navigation rendering rules (D44)

**Choice**: full layout `[Primera][Anterior][page numbers][info][Siguiente][Última]`, size select LEFT of the controls when provided (D45), row keeps D37's `mt-4 flex items-center justify-end gap-2` plus `flex-wrap` (narrow viewports). Rules:

- `totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))` — D37 formula preserved (division guards intact).
- **`total === 0` → render `null`** — preserved verbatim (spec regression "Empty list renders no pagination controls").
- **Primera**: native `<button type="button">`, `ChevronsLeft` + "Primera", `aria-label="Primera página"`, `disabled={page <= 1}`, `onClick={() => onPageChange(1)}`, `hidden sm:inline-flex` (D46).
- **Anterior**: existing button unchanged (label "Anterior", `ChevronLeft`, `aria-label="Página anterior"`, `disabled={page <= 1}`, `onClick={() => onPageChange(page - 1)}`).
- **Page numbers**: container `hidden sm:flex items-center gap-1`; one native button per slot:
  - number slots → `<button type="button">` with text `{n}`, `aria-label={`Página ${n}`}`, `onClick={() => onPageChange(n)}`; the **current page button** gets `aria-current="page"` + active styling (`bg-blue-600 text-white border-blue-600`); others `border-gray-300 text-gray-700 hover:bg-gray-50`.
  - `'ellipsis'` slots → non-interactive `<span aria-hidden="true">…</span>` (never focusable, never announced).
- **Info**: `Página {page} de {totalPages}` with `aria-live="polite"` — unchanged, sits between numbers and Siguiente (keeps its D37 position relative to prev/next).
- **Siguiente**: existing button unchanged (`disabled={page >= totalPages}`, `onClick={() => onPageChange(page + 1)}`).
- **Última**: native button, `ChevronsRight` + "Última", `aria-label="Última página"`, `disabled={page >= totalPages}`, `onClick={() => onPageChange(totalPages)}`, `hidden sm:inline-flex` (D46).
- **Boundary disables**: Primera AND Anterior disabled on page 1; Última AND Siguiente disabled on the last page (spec scenario "First and last controls disable at boundary pages"). Real `disabled` attribute (not `aria-disabled`) so focus skips disabled controls — D37 precedent.
- **Out-of-range `page`** (server returned `items: []`, total > 0): component still renders; `paginasVisibles` returns a navigable window (D43 handles page > totalPages); `Siguiente` disabled (`page >= totalPages`), `Primera`/`Anterior` enabled — the user navigates back via numbers/first (spec scenario "Out-of-range page keeps rendering controls").
- **Keyboard**: all native buttons — Tab-focusable, Enter/Space-activate, no custom key handling (D37 precedent).

**Alternatives considered**: `aria-disabled` + custom key handling — rejected (real `disabled` skips focus automatically, matches D37); ellipsis as a disabled button — rejected (a disabled button is still focusable with `aria-disabled`, and an interactive-looking ellipsis is a UX lie; a plain `aria-hidden` span is correct). **Rationale**: native semantics + preserved D37 primitives minimize the diff and keep the a11y contract the archived change already established.

### Decision: Page-size selector (D45)

**Choice**: native `<select>`, zero deps, rendered FIRST inside the row (immediately LEFT of `Primera`), and ONLY when `onPageSizeChange` is provided:

```tsx
{onPageSizeChange && (
  <select
    aria-label="Filas por página"
    value={pageSize}
    onChange={(e) => onPageSizeChange(Number(e.target.value))}
    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
  >
    {(pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS).map((opt) => (
      <option key={opt} value={opt}>{opt}</option>
    ))}
  </select>
)}
```

- **Contract**: options `[10, 25, 50, 100]` (default 25; overridable via `pageSizeOptions?`), NEVER an option above 100 — the server cap (100) stays the ceiling, no extra client clamp (locked: "server cap 100 stays in sync — no extra client clamp").
- **When hidden**: `onPageSizeChange` absent → no `<select>` at all; the 2 existing call sites render none until Slice C wires the prop (backward compat, spec scenario "Selector renders only when onPageSizeChange is provided").
- **Value invariant**: the select binds to `pageSize` (the envelope echo). The store clamp (D47) guarantees `pageSize ∈ [10,25,50,100]` after any size change, and initial state is 25 — the native select never faces a value with no matching option.
- **A11y**: label comes from `aria-label="Filas por página"` (spec-mandated, no visible label); native select is keyboard-operable (Tab + arrows) with zero custom handling.

**Alternatives considered**: a custom dropdown/chips selector — rejected (native select = free a11y + keyboard, matches the app's other filter selects); an icon-only button cycling sizes — rejected (opaque, not in the spec); rendering the selector even without `onPageSizeChange` as disabled — rejected (spec says absent prop → NO selector). **Rationale**: the native select is the zero-dep, spec-pinned contract; the only real decision is placement (LEFT of controls, locked) and gating (prop presence, locked).

### Decision: Responsive rule — `sm:` (640px), not `md:` (D46)

**Choice**: the page-numbers container and the Primera/Última buttons carry `hidden sm:flex` / `hidden sm:inline-flex` respectively. Below 640px they are `display:none`; at `sm:` and above they render. Anterior, "Página X de Y", Siguiente and the size select (when provided) are ALWAYS visible. The row keeps `flex-wrap` so the always-visible subset (select + prev + info + next ≈ 400px) wraps gracefully on ~360px viewports instead of overflowing.

**Why `sm:`, NOT `md:`** (locked): the app's table↔cards breakpoint is `sm:` app-wide — `multas.tsx:283` (`hidden sm:block` table) / `:327` (`sm:hidden` cards), `aportes.tsx:564` (`sm:hidden` cards), `reportes.tsx:269` (`sm:block` table) / `:307` (`sm:hidden` cards). Below `sm:` the list renders as stacked CARDS; hiding the page numbers there removes a wide, low-value element from the mobile layout (a 7-slot number row + first/last would exceed 360px), leaving the compact prev/info/next + size select that the spec requires. At `sm:` the full-width table appears and the full navigation fits. `md:` would keep the numbers hidden on `sm`-only tablets that already show the table — mismatched with the app's own breakpoint. Spec scenarios "Below sm: only prev/info/next and the size select render" and "At sm: and above the full navigation renders" pin exactly this.

**Alternatives considered**: `md:` — rejected (locked: mismatch with the app-wide breakpoint, per above); CSS-only hiding on a wrapper with no flex-wrap — rejected (wrap needed for the always-visible subset on narrow screens). **Rationale**: the component's responsive contract must match the data-presentation breakpoint it sits under; `sm:` is the evidence-backed choice.

### Decision: Store page-size setters + libro diario state (D47)

**Choice**: three new setters in `apps/web/src/stores/app.store.ts`, following the D38 single-mutation-action pattern exactly. Canonical options live in `@otb/core` as `DEFAULT_PAGE_SIZE_OPTIONS` (D51) so the component default and the store clamp share one source:

```ts
// ── apps/web/src/stores/app.store.ts (D47) ──────────────────────────────────
type LibroDiarioFilters = {
  fechaDesde?: string; fechaHasta?: string; gestion?: string;
  mes?: string; tipo?: string; estadoId?: string; grupoId?: string;
};

// AppState additions (multas/aporteRegistros state fields already exist):
setMultasPageSize: (pageSize: number, filters?: MultaFilters) => Promise<void>;
setAporteRegistrosPageSize: (pageSize: number, filters?: AporteFilters) => Promise<void>;
libroDiarioTotal: number;         // NUEVO — envelope.total
libroDiarioPage: number;          // NUEVO — default 1
libroDiarioPageSize: number;      // NUEVO — default 25
fetchLibroDiario: (filters?: LibroDiarioFilters, page?: number) => Promise<void>; // refactor
setLibroDiarioPage: (page: number, filters?: LibroDiarioFilters) => Promise<void>;
setLibroDiarioPageSize: (pageSize: number, filters?: LibroDiarioFilters) => Promise<void>;
```

Setter implementation (identical shape for all three lists):

```ts
setMultasPageSize: async (pageSize, filters) => {
  // D47: clamp a las opciones canónicas [10,25,50,100]; fuera de set → default 25.
  const size = DEFAULT_PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE;
  set({ multasPageSize: size, multasPage: 1 });        // reset página 1
  return get().fetchMultas(filters, 1);                 // UN solo refetch
},
setLibroDiarioPage: async (page, filters) => {
  set({ libroDiarioPage: page });
  return get().fetchLibroDiario(filters, page);
},
setLibroDiarioPageSize: async (pageSize, filters) => {
  const size = DEFAULT_PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE;
  set({ libroDiarioPageSize: size, libroDiarioPage: 1 });
  return get().fetchLibroDiario(filters, 1);
},
```

`fetchLibroDiario` refactor: the current 7-positional-arg signature (store 628–645) becomes `(filters?: LibroDiarioFilters, page?: number)` — builds the same `URLSearchParams` from the object, ALWAYS sets `page` (`page ?? get().libroDiarioPage`) and `pageSize` (`get().libroDiarioPageSize`), and unpacks the envelope: `set({ libroDiario: data.items, libroDiarioTotal: data.total, libroDiarioPage: data.page, libroDiarioPageSize: data.pageSize, reportsLoading: false })`. Error path unchanged (silent `reportsLoading: false`). Exactly ONE caller exists (reportes.tsx:61) — updated in the same change (D49).

**No-double-fetch proof**: the route reset effects are `multas.tsx:114` (`[tab, filters, setMultasPage]`), `aportes.tsx:218` (`[tab, filters, setAporteRegistrosPage]`), and the new reportes effect (D49, deps exclude `libroDiarioPage`/`libroDiarioPageSize`). A page-size change mutates ONLY `multasPageSize` + `multasPage` (or the libro-diario equivalents) and fires ONE `fetchX(filters, 1)`; none of those mutations are effect deps → the effects do not re-fire → exactly one network fetch. A page change (`onPageChange(p)`) passes the CURRENT filter object; `filters` identity is stable → the reset effect does not re-trigger (the D38 loop-guard argument, now extended to pageSize).

**Alternatives considered**: page-size as local route state — rejected (the store owns every other list parameter and the envelope echo must land in store fields); a generic `setPageSize` factory — rejected (three explicit setters mirror the three existing `setXPage` actions and keep the store flat, matching the D38 naming); clamping on the server only — rejected (the spec pins "clamp to options" in the store, and the component value-invariant needs it locally). **Rationale**: D38's single-action + loop-guard pattern is proven; the pageSize setters are its natural extension and keep "reset page 1 + refetch" semantics in ONE place.

### Decision: Libro diario server pagination (D48)

**Choice**: `GET /api/reportes/libro-diario` (`packages/api/src/routes/reportes.ts:83–135`) becomes an always-envelope endpoint using the EXISTING `parsePaginacion` (D33) — same clamp/fallback semantics as multas/aportes, ZERO new pagination code:

```ts
// ── packages/api/src/routes/reportes.ts (D48) ───────────────────────────────
import { eq, and, gte, lte, sql, getTableColumns, or, inArray, asc, desc } from 'drizzle-orm';
import { parsePaginacion } from '../lib/paginacion';

reportes.get('/libro-diario', (c) => {
  const { page, pageSize } = parsePaginacion(c.req.query());
  const gestion = c.req.query('gestion');
  const mes = c.req.query('mes');
  const tipo = c.req.query('tipo');
  const fechaDesde = c.req.query('fechaDesde');
  const fechaHasta = c.req.query('fechaHasta');
  const estadoId = c.req.query('estadoId');
  const grupoId = c.req.query('grupoId');

  const filters: any[] = [eq(schema.movimientos.anulado, 0)];
  // ... bloque de filtros EXISTENTE sin cambios (tipo, fechas/gestion/mes, estadoId, grupoId) ...

  const where = and(...filters);
  // COUNT espeja el MISMO FROM + LEFT JOIN + WHERE (los filtros estadoId/grupoId
  // referencian schema.socios — un count sin el join fallaría; patrón D33).
  const total = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.movimientos)
    .leftJoin(schema.socios, eq(schema.movimientos.socioId, schema.socios.id))
    .where(where)
    .get();
  const items = db
    .select({ /* MISMOS campos que hoy: id, tipo, referenciaId, socioId, monto,
                 numeroRecibo, nota, fecha, anulado, socioNombre, socioApellido */ })
    .from(schema.movimientos)
    .leftJoin(schema.socios, eq(schema.movimientos.socioId, schema.socios.id))
    .where(where)
    .orderBy(asc(schema.movimientos.fecha), desc(schema.movimientos.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();
  return c.json({ items, total: Number(total?.n ?? 0), page, pageSize });
});
```

- **Envelope**: `{ items, total, page, pageSize }` ALWAYS — same option-C rationale as D33; `items` keeps the EXACT current row shape (the LEFT JOIN fields `socioNombre`/`socioApellido` included; `anulado` and the rest preserved). `total` = filtered COUNT before pagination (spec scenario "Los filtros se aplican antes de la paginación y total refleja el conteo filtrado").
- **`parsePaginacion` reuse**: same defaults (page 1, pageSize 25), same cap (pageSize > 100 → 100, echo shows 100), same fallbacks (non-integer, `page < 1`, `pageSize < 1` → defaults). New `asc`/`desc` imports added to the drizzle-orm import line; no new lib code.
- **ORDER BY `fecha ASC, id DESC`**: `fecha` is `text` `YYYY-MM-DD` (lexicographic = chronological, `notNull` — movimientos schema); `id` is the PK. The composite is a strict total order → no duplicates/gaps across pages (spec scenario "El orden es determinista entre páginas"). Within the same fecha, `id DESC` = newest row first — matches the locked decision (same-date rows newest first). This is a CHANGE from the current `.orderBy(schema.movimientos.fecha)` (ascending only, unstable for same-date rows); the primary key (fecha ASC) still satisfies the main spec regression scenario "los resultados SHALL estar ordenados por fecha ascendente".
- **Index note**: no index serves `(fecha, id DESC)`; SQLite sorts (full scan + temp sort). DELIBERATE — same rationale as D34: movimientos is small and the proposal's Non-Goals exclude schema changes. If it ever reaches tens of thousands, add `(fecha, id)` in a future change.

**Backward-compat audit — enumerate ALL consumers of GET /api/reportes/libro-diario** (verified by grep on Aug 2026):

| Consumer | Where | Impact |
|----------|-------|--------|
| `fetchLibroDiario` store action | `app.store.ts:628–645` (`request<LibroDiarioEntry[]>`(…)`/reportes/libro-diario${qs}`) | Updated in this change (D47/D49): type becomes `Paginated<LibroDiarioEntry>`, envelope unpack |
| `reportes.tsx` libro-diario tab | route lines 60–61 (effect call), 25 (store destructure), 262–326 (render) | Updated in this change (D49) |
| Tests | `packages/api/test/*` — verified NO suite calls `/api/reportes/libro-diario` (rg: 0 matches; no reportes suite exists) | **Zero test churn** from the envelope |
| `apps/desktop`, `apps/mobile` | grep for `libro-diario`: 0 matches | Unaffected |
| Dashboard / balance / resumen-socio | `dashboard.ts` + `reportes.ts` /balance and /resumen-socio query the `movimientos` TABLE directly (aggregate SQL) — never call GET /libro-diario | Unaffected |

**Conclusion**: exactly ONE fetch site + ONE render site, both updated in the same change → always-envelope is safe, mirroring the D39 audit for multas/aportes.

**Alternatives considered**: conditional envelope (bare array when no `page` param) — rejected (same C′ rejection as D33: all consumers in-repo and updated together; a conditional shape would permanently complicate the store unpack); `{ data, meta }` nesting — rejected (flat envelope matches the codebase style). **Rationale**: the shared `Paginated<T>` + `parsePaginacion` from D33 make this endpoint's pagination a copy of the proven multas/aportes pattern, and the audit proves the shape change is safe.

### Decision: reportes.tsx route wiring (D49)

**Choice**: `apps/web/src/routes/reportes.tsx` libro-diario tab wiring, mirroring the D38 pattern used in multas.tsx/aportes.tsx:

1. **Filters object**: derive a mapped `libroDiarioFilters` (store-local `LibroDiarioFilters`, undefined-when-empty) from the existing state: `{ fechaDesde: fechaDesde || undefined, fechaHasta: fechaHasta || undefined, gestion: ldGestion || undefined, mes: ldMes || undefined, tipo: ldTipo === 'todos' ? undefined : ldTipo, estadoId: ldEstadoId || undefined, grupoId: ldGrupoId || undefined }`. NOTE: `fechaDesde`/`fechaHasta` are SHARED with the balance 'rango' mode (lines 33–34, 58, 61) — the mapping preserves today's behavior exactly.
2. **Effect**: the `libro-diario` branch (line 61) changes from `fetchLibroDiario(...7 positional args...)` to `setLibroDiarioPage(1, libroDiarioFilters)` — the single page-mutation action resets to page 1 and refetches on ANY filter/tab change (D38 semantics). Effect deps: replace `fetchLibroDiario` with `setLibroDiarioPage` (both stable zustand refs); DO NOT add `libroDiarioPage`/`libroDiarioPageSize` (loop guard — D47 proof). The balance and resumen branches keep `fetchBalance`/`fetchResumenSocio`.
3. **Envelope unpack**: `Pagination` render below table + cards (after line 326):
   ```tsx
   <Pagination
     page={libroDiarioPage}
     total={libroDiarioTotal}
     pageSize={libroDiarioPageSize}
     onPageChange={(p) => setLibroDiarioPage(p, libroDiarioFilters)}
     onPageSizeChange={(s) => setLibroDiarioPageSize(s, libroDiarioFilters)}
   />
   ```
   with `Pagination` added to the `@otb/ui` import (line 4).
4. **Empty-state keying**: line 262 changes from `libroDiario.length === 0 && !reportsLoading` to `libroDiarioTotal === 0 && !reportsLoading` — a beyond-range page (empty items, total > 0) must NOT show the false "No hay movimientos" empty state (D38 rule). Table/cards render conditions (`libroDiario.length > 0`) stay as-is.

**Alternatives considered**: keeping `fetchLibroDiario` in the effect and adding a separate page-reset effect — rejected (two effects firing on the same filter changes = two fetches; the D38 single-action pattern exists precisely to avoid this); appending `page` to the positional signature instead of the object refactor — rejected (a 8-positional-arg call would make `setLibroDiarioPageSize`'s filters unreadable; the object form matches `MultaFilters`/`AporteFilters` precedent). **Rationale**: reportes.tsx gets the exact D38 wiring that multas.tsx/aportes.tsx already ship; the signature refactor is safe because there is exactly one caller.

### Decision: Test strategy (D50)

**Choice**: two NEW test suites — no changes to any existing suite:

1. **`packages/ui/src/lib/paginacion-window.test.ts`** — the FIRST vitest suite in `packages/ui` (the package's vitest script runs `--passWithNoTests`; the vitest workspace (`vitest.workspace.ts` → `packages/*`) picks up the new `src/**/*.test.ts` automatically; `packages/ui/tsconfig.json` includes `src`, so `pnpm typecheck` covers the test file too). Pure unit tests, no DOM, no test renderer — `describe`/`it`/`expect` from `vitest` (already a devDependency). Full matrix in the Test plan section.
2. **`packages/api/test/reportes.test.ts`** — NEW suite (no reportes suite exists), mirroring `multas.test.ts`'s envelope matrix structure. Seeds `movimientos` rows directly via `ejecutar('INSERT INTO movimientos (id, tipo, socio_id, monto, numero_recibo, nota, fecha, anulado) VALUES (...)', [...])` — `movimientos` has only `id`/`tipo`/`monto`/`fecha` NOT NULL (schema verified), so direct inserts with explicit ids (`'m1'…`) and explicit fechas give deterministic ordering; socios created via `crearSocio` where `estadoId`/`grupoId` filter tests need them. `limpiarDatos()` already deletes `movimientos` (helpers.ts:58).

**Why component/store scenarios stay source-verified (per D40)**: `apps/web` and `packages/ui` have NO UI test infrastructure — no `@testing-library/react`, no jsdom/vitest-environment in either package.json, and the archived change (D40) already established that UI behavior is verified by manual smoke + typecheck. The `paginacion-window` suite is the deliberate exception because the paginacion-window spec MANDATES it and the helper is pure. The component's rendering rules (D44–D46), the store's clamp/reset/refetch (D47) and the route wiring (D49) are source-verified: typecheck + the server suites prove the contracts they depend on, and the verify phase maps spec scenarios to code.

**Alternatives considered**: react-testing-library component tests — rejected (no infra, no jsdom in the workspace; adding it is a separate change); one shared pagination describe for both envelope suites — rejected (repo organizes suites by domain route; reportes gets its own file); adding libro-diario cases to multas.test.ts — rejected (wrong domain home; reportes.ts is a separate route file). **Rationale**: the suite split mirrors the repo's per-route test organization, and the pure-helper suite lands where the spec mandates it.

### Decision: Shared page-size options constant + spec discrepancy note (D51)

**Choice**: add to `packages/core/src/index.ts` (next to `Paginated<T>`, D33):

```ts
/** Opciones canónicas de pageSize (D51) — default del <select> y clamp del store. */
export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSizeOption = (typeof DEFAULT_PAGE_SIZE_OPTIONS)[number];
```

`packages/ui` (component default in D45) and `apps/web` (store clamp in D47) both import from `@otb/core` — one source of truth, no literal drift between the select options and the store clamp. The component re-exports it from `@otb/ui` for convenience. Note: the server cap lives in `packages/api/src/lib/paginacion.ts` (`MAX_PAGE_SIZE = 100`) — the two constants are intentionally separate concerns (UI options vs server safety cap); the spec's "no option above 100" is guaranteed because the options list ends at 100.

**Spec/code discrepancy (flag, NOT a design change)**: the main reports spec scenario "Libro diario sin filtros retorna últimos 30 días" (carried into the delta as `(IMPLEMENTED — regression)`) describes behavior the CURRENT handler does NOT implement — `reportes.ts:92–112` applies date filters ONLY when `fechaDesde`/`fechaHasta`/`gestion`/`mes` params are provided; there is no 30-day default anywhere in `packages/api/src`. This design PRESERVES the existing filter semantics verbatim (the COUNT mirrors the same WHERE), and does NOT add a 30-day default — that would change existing behavior and is outside this change's scope. The verify phase should re-tag that scenario (or flag it) rather than expect the new code to introduce the default. The delta's own list of "filtros existentes (fechaDesde/fechaHasta — default últimos 30 días —, estadoId, grupoId, gestion, mes, tipo)" should be read as "the existing filter set"; the 30-day parenthetical is aspirational.

## Component Contract — `Pagination` (post-upgrade)

```ts
// packages/ui/src/components/pagination.tsx — exportada desde packages/ui/src/index.ts (D42–D46)
import { DEFAULT_PAGE_SIZE_OPTIONS } from '@otb/core';   // re-exportada también desde @otb/ui (D51)

export type PaginationProps = {
  page: number;                     // página actual (1-based)
  total: number;                    // total de filas FILTRADAS (envelope.total)
  pageSize: number;                 // filas por página (envelope.pageSize)
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void; // presente → <select> "Filas por página" (D45)
  pageSizeOptions?: number[];       // default DEFAULT_PAGE_SIZE_OPTIONS [10, 25, 50, 100]
  maxSlots?: number;                // default 7 (D43)
};
export const Pagination: FC<PaginationProps>;
```

Rendering rules (spec Requirement + D44–D46):

- `totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))`; `total === 0` → `null`.
- Row: `mt-4 flex flex-wrap items-center justify-end gap-2` (D37 row + `flex-wrap`).
- Layout left→right: `[<select> when onPageSizeChange] [Primera (hidden sm:inline-flex)] [Anterior] [numbers (hidden sm:flex)] [Página X de Y (aria-live="polite")] [Siguiente] [Última (hidden sm:inline-flex)]`.
- Numbers computed via `paginasVisibles(page, totalPages, maxSlots)` (D43): number buttons native; current carries `aria-current="page"` + `bg-blue-600 text-white border-blue-600`; `'ellipsis'` → `<span aria-hidden="true">…</span>`.
- Disables: Primera+Anterior `disabled={page <= 1}`; Siguiente+Última `disabled={page >= totalPages}`; real `disabled` attribute.
- Buttons: Primera `ChevronsLeft`+"Primera" aria-label "Primera página"; Anterior `ChevronLeft`+"Anterior" aria-label "Página anterior"; Siguiente "Siguiente"+`ChevronRight` aria-label "Página siguiente"; Última "Última"+`ChevronsRight` aria-label "Última página" (lucide-react already in the kit, D37 precedent).
- Shared button class stays `border border-gray-300 rounded-md px-3 py-1.5 text-sm …` (D37 `btnCls`); number buttons `h-8 w-8` square variant.

## API Contract Changes — libro diario

```text
GET /api/reportes/libro-diario?<filtros>            ← nuevos query params page?, pageSize?
  ANTES:  200 [ { id, tipo, referenciaId, socioId, monto, numeroRecibo, nota, fecha,
                 anulado, socioNombre, socioApellido }, ... ]        (orderBy fecha — no determinista)
  DESPUÉS: 200 { items: [ ...mismos rows... ], total, page, pageSize }
           // page/pageSize via parsePaginacion (defaults 1/25, cap 100, clamps/fallbacks D33)
           // ORDER BY fecha ASC, id DESC (determinista; tiebreak id DESC dentro de la misma fecha)
           // total = COUNT filtrado ANTES de la paginación (mismo FROM + LEFT JOIN + WHERE)
```

- Response type on the client: `request<Paginated<LibroDiarioEntry>>` (reuses `Paginated<T>` from `@otb/core` — NO new core type needed; `LibroDiarioEntry` stays the item type).
- Behavior contract: `page=9` beyond range → `{ items: [], total, page: 9, pageSize }` (no page clamping — same as D33); empty list → `{ items: [], total: 0, page: 1, pageSize: 25 }`; `pageSize=500` → echo 100; `page=abc&pageSize=-5` → defaults 1/25.
- Filters unchanged and applied BEFORE pagination: `anulado=0` always; `tipo`, `fechaDesde`/`fechaHasta`, `gestion`/`mes`, `estadoId`, `grupoId` (grupoId via `or(grupoPrimarioId, inArray(socio_grupos))` subquery — untouched).
- `/balance` and `/resumen-socio` — UNCHANGED (reports spec: "Balance y resumen-socio son UNCHANGED").

## Store / State Design

State fields + actions (D47/D49):

```ts
// apps/web/src/stores/app.store.ts — estado existente (sin cambios):
multasPage/multasPageSize/multasTotal, fetchMultas(filters?, page?), setMultasPage(page, filters)
aporteRegistrosPage/aporteRegistrosPageSize/aporteRegistrosTotal, fetchAporteRegistros(filters?, page?), setAporteRegistrosPage(page, filters)

// NUEVO:
setMultasPageSize: (pageSize, filters?: MultaFilters) => Promise<void>;           // clamp + reset 1 + refetch
setAporteRegistrosPageSize: (pageSize, filters?: AporteFilters) => Promise<void>; // idem
libroDiarioTotal: number; libroDiarioPage: number; libroDiarioPageSize: number;   // defaults 0/1/25
fetchLibroDiario: (filters?: LibroDiarioFilters, page?: number) => Promise<void>; // refactor de 7 args posicionales
setLibroDiarioPage: (page, filters?: LibroDiarioFilters) => Promise<void>;
setLibroDiarioPageSize: (pageSize, filters?: LibroDiarioFilters) => Promise<void>;
```

Key invariants:
- Page-size setters: `size = DEFAULT_PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE` (25); `set({ …PageSize: size, …Page: 1 })`; ONE refetch at page 1 with the CURRENT filters.
- `fetchLibroDiario` ALWAYS sends `page`/`pageSize` and unpacks `items`/`total`/`page`/`pageSize` (D38 rule extended).
- Effect deps MUST NOT include the page/pageSize fields (loop guard, D47 proof). Routes: multas.tsx:114 `[tab, filters, setMultasPage]`; aportes.tsx:218 `[tab, filters, setAporteRegistrosPage]`; reportes.tsx effect (D49) replaces `fetchLibroDiario` with `setLibroDiarioPage` and excludes `libroDiarioPage`/`libroDiarioPageSize`.
- Empty-state keying: multas/aportes already key on `multasTotal === 0`/`aporteRegistrosTotal === 0`; reportes.tsx line 262 switches from `libroDiario.length === 0` to `libroDiarioTotal === 0` (D49).

## Data Flow

Same-store loop used by multas/aportes (D38) extended to libro diario, plus the API envelope (D33/D48):

    [Pagination component]                     [app.store.ts]
    onPageChange(p) ──────────────► setLibroDiarioPage(p, filters)
    onPageSizeChange(s) ──────────► setLibroDiarioPageSize(s, filters)
                                         │  set({ libroDiarioPage, libroDiarioPageSize })
                                         │  ONE refetch: fetchLibroDiario(filters, 1)
                                         ▼
    [GET /api/reportes/libro-diario?page&pageSize]  (reportes.ts)
        filters ─► WHERE (anulado=0 + tipo/estadoId/grupoId/fecha, BEFORE pagination)
        count(*) over same FROM+LEFT JOIN+WHERE ─► total
        ORDER BY fecha ASC, id DESC ─► items (limit pageSize, offset)
                                         │  { items, total, page, pageSize }
                                         ▼
    [store unpack] set({ libroDiario: items, libroDiarioTotal: total,
                         libroDiarioPage: page, libroDiarioPageSize: pageSize })
        │
        ├──► reportes.tsx renders items (table 268–304 / cards 306–326)
        └──► reportes.tsx renders <Pagination page={libroDiarioPage} total={libroDiarioTotal}
                             pageSize={libroDiarioPageSize} onPageChange={…} onPageSizeChange={…} />

    Ellipsis window (pure, unit-tested): paginasVisibles(page, totalPages, maxSlots=7)
        Pagination ──► PaginaSlot[] ──► [Primera][Anterior][1 … 5 6 7 … 20][Siguiente][Última]
                                        aria-current="page" on current; <select> filas por página (D45)

    Loop guard: effect deps [tab, filters, setter] exclude page/pageSize
        → page/pageSize changes re-render only, never re-fire the route effect (no double fetch)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/core/src/index.ts` | Modify | Add `DEFAULT_PAGE_SIZE_OPTIONS` + `PageSizeOption` type (D51) |
| `packages/ui/src/lib/paginacion-window.ts` | Create | Pure `paginasVisibles` + `PaginaSlot` (D43) |
| `packages/ui/src/lib/paginacion-window.test.ts` | Create | FIRST vitest suite in `packages/ui` (D43/D50) |
| `packages/ui/src/components/pagination.tsx` | Modify | Additive props (D42), numbers/ellipsis/first/last + aria-current (D44), size select (D45), `hidden sm:flex` rule (D46) |
| `packages/ui/src/index.ts` | Modify | Export `paginasVisibles`, `type PaginaSlot`, `DEFAULT_PAGE_SIZE_OPTIONS` (re-export de core) |
| `packages/api/src/routes/reportes.ts` | Modify | GET /libro-diario: `parsePaginacion` + envelope + `ORDER BY fecha ASC, id DESC` + COUNT (D48) |
| `packages/api/test/reportes.test.ts` | Create | NEW libro-diario envelope suite (D50) |
| `apps/web/src/stores/app.store.ts` | Modify | `setMultasPageSize`/`setAporteRegistrosPageSize`/`setLibroDiarioPage`/`setLibroDiarioPageSize`; `libroDiarioTotal/Page/PageSize`; `fetchLibroDiario(filters?, page?)` + envelope unpack (D47) |
| `apps/web/src/routes/multas.tsx` | Modify | Add `onPageSizeChange={(s) => setMultasPageSize(s, listarFilters)}` to the existing `Pagination` call (D42/D47) |
| `apps/web/src/routes/aportes.tsx` | Modify | Add `onPageSizeChange={(s) => setAporteRegistrosPageSize(s, pagarFilters)}` (D42/D47) |
| `apps/web/src/routes/reportes.tsx` | Modify | `libroDiarioFilters` object, page-reset effect, envelope unpack, `Pagination` render, empty-state on `libroDiarioTotal` (D49) |

Rollout order within the change: core constant → `paginacion-window.ts` + test → `pagination.tsx` + index exports → `reportes.ts` + `reportes.test.ts` → store → routes. The API and web ship in the same change (single PR chain) so no interim state leaves the old UI consuming the new envelope.

## Test Plan

### 1. `packages/ui/src/lib/paginacion-window.test.ts` — vitest matrix (D43/D50)

| Case | Input | Expected |
|------|-------|----------|
| All pages when totalPages ≤ 7 | `paginasVisibles(3, 5)` | `[1,2,3,4,5]` (no ellipsis) |
| Middle window | `paginasVisibles(5, 20)` | `[1,'ellipsis',4,5,6,'ellipsis',20]` |
| Edge page 1 | `paginasVisibles(1, 20)` | `[1,2,'ellipsis',20]` |
| Edge page totalPages | `paginasVisibles(20, 20)` | `[1,'ellipsis',19,20]` |
| Ellipsis both sides | `paginasVisibles(10, 20)` | `[1,'ellipsis',9,10,11,'ellipsis',20]` |
| Out-of-range small N | `paginasVisibles(9, 2)` | `[1,2]` |
| Out-of-range large N | `paginasVisibles(30, 20)` | `[1,'ellipsis',20]` |
| Cap sweep (default 7) | `paginasVisibles(p, 10_000)` for p in 1..10_000 | length ≤ 7 in EVERY case |
| Cap with custom maxSlots | `paginasVisibles(10, 20, 5)` | length ≤ 5 (e.g. `[1,'ellipsis',10,'ellipsis',20]`) |
| Defensive totalPages | `paginasVisibles(1, 0)` / `paginasVisibles(1, -3)` | `[]` |
| Determinism | call any case twice | deep-equal |

### 2. `packages/api/test/reportes.test.ts` — libro-diario envelope (D48/D50)

Seed: socios via `crearSocio` (for `estadoId`/`grupoId` cases); movimientos via direct `ejecutar('INSERT INTO movimientos …')` with explicit ids/fechas for deterministic order.

| Case | Assert |
|------|--------|
| Default request (60 movs) | 200 `{ items: [25], total: 60, page: 1, pageSize: 25 }` |
| `pageSize=500` | echo `pageSize: 100`, ≤ 100 items |
| `page=9` beyond range | `{ items: [], total: 60, page: 9, pageSize: 25 }` |
| Empty list | `{ items: [], total: 0, page: 1, pageSize: 25 }` |
| `page=abc&pageSize=-5` | defaults `page: 1, pageSize: 25` |
| Deterministic order (60 movs, distinct fechas) | page 1 = 25 OLDEST (fecha ASC); union of pages 1..3 = all 60, no dupes/gaps; raw-SQL cross-check `ORDER BY fecha ASC, id DESC` |
| Same-date tiebreak | rows with identical `fecha` ordered `id DESC` within the page |
| Filters before pagination | `?tipo=ingreso`, `?estadoId=…`, `?grupoId=…`, `?fechaDesde&fechaHasta` → items subset + `total` = filtered count only |
| Regression: anulado=0 | seeded `anulado=1` row NEVER appears; fields `id, tipo, monto, fecha, nota, numeroRecibo, referenciaId, socioId, socioNombre, socioApellido` present |
| Regression: combined estadoId+grupoId | subset + total (COUNT mirrors joins) |

### 3. Regression

- Existing 8 suites (`aporte-dedup`, `aporte-definicion`, `aportes-bulk-all-pagos`, `aportes-generacion`, `multas`, `socios-aportes`, `grupos`) — MUST pass untouched: none call `/api/reportes/libro-diario` (D48 audit; the multas/aportes GET envelopes are NOT touched by this change).
- `pnpm typecheck` clean (config.yaml verify rule) — especially `apps/web` after the `fetchLibroDiario` signature refactor and the new props at both call sites.
- Manual smoke (no UI test infra — D40/D50): size select refetches + resets page; numbers/ellipsis/first/last render; aria-current present; below 640px numbers/first/last hidden; libro diario shows "Página X de Y" and paginates.

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Libro diario envelope breaks a consumer | Low (was Med) | D48 exhaustive audit: exactly ONE fetch site + ONE render site, both updated in the same change; zero test/desktop/mobile consumers; new suite asserts the shape |
| "últimos 30 días" spec claim vs code | Med (spec accuracy, not code risk) | D51 flag: current handler has NO date default; design preserves existing filter semantics; verify phase re-tags or flags the scenario — do NOT implement the default here |
| Ellipsis edge cases (near 1/N, out-of-range, cap) | Low | Pure function + full vitest matrix incl. out-of-range and 10_000-page sweep (D43/D50); the cap guard covers custom maxSlots < 7 |
| Double-fetch on page-size change | Low | Single setter action; effect deps exclude page/pageSize (D47 proof — same loop-guard as D38) |
| `fetchLibroDiario` signature refactor breaks a caller | Low | Exactly one caller (reportes.tsx:61), updated in the same change; `pnpm typecheck` gates it |
| Component regression at the 2 existing call sites | Low | Additive contract (D42): optional props only; the 3 `(IMPLEMENTED — regression)` scenarios verified under the new layout (D44); both call sites compile unchanged |
| Blank page-size select (pageSize ∉ options) | Low | Store clamp keeps `pageSize ∈ [10,25,50,100]` (D47); initial 25; server echo ∈ options |
| `parsePaginacion` quirks (`Number('')` → 0 → default) | Low | Reused as-is (D33); invalid-params test covers fallbacks |

## Migration / Rollout

**No migration required.** Fully additive except the libro-diario response shape (no schema change, no data backfill, no feature flag). **Rollback**: `git revert` of (1) `reportes.ts` handler → bare array + revert the web consumer; (2) delete `paginacion-window.ts` + its test and restore `pagination.tsx`; (3) revert store setters and route wiring. Additive props mean old call sites never depend on new behavior — safe, low-risk revert (proposal rollback plan).

## Slice Mapping (chained-PR structure from the proposal)

| Slice | Scope | Decisions land where | Forecast (diff) | Review-budget note |
|-------|-------|----------------------|-----------------|--------------------|
| **A — Backend + helper** | `reportes.ts` envelope + ORDER BY + COUNT; `paginacion-window.ts` + test; `DEFAULT_PAGE_SIZE_OPTIONS` in core; ui index exports; NEW `reportes.test.ts` | D43, D48, D50 (half), D51 | ~330–400 lines | Near the 400-line guard: if Slice A alone exceeds it, split `reportes.test.ts` into its own commit within the slice (archived D40 precedent) |
| **B — Component + store** | `pagination.tsx` upgrade; `app.store.ts` setters + libroDiario state + fetchLibroDiario refactor | D42, D44, D45, D46, D47 | ~180–220 lines | Component rewrite is the review-critical file — keep D37 primitives intact for a small diff |
| **C — Route wiring** | multas/aportes `onPageSizeChange`; reportes.tsx filters object + page-reset effect + Pagination render + empty-state | D49 (route half), D42 (call sites) | ~45–60 lines | Smallest slice — clean review; reportes.tsx effect deps deserve scrutiny (loop guard) |
| **D — Polish/regression** | a11y audit (aria-current, labels, focus), responsive pass at 360/640/1024px, full `pnpm test` + `pnpm typecheck`, verify matrix vs every spec scenario | D50 (verify), spec final pass | small | Mostly verification; single-page-list hide-if-totalPages=1 polish (Open Questions) lands here if confirmed |

Dependency note: C depends on B (component props + store setters) and on A (envelope for reportes); B depends on A only via the core constant (weak). The proposal's A→B→C→D ordering holds; A and B are individually shippable.

## Open Questions

- [ ] The "últimos 30 días" scenario (D51): confirm the verify phase re-tags it as a spec/code discrepancy, or a follow-up change implements the default — OUT of scope here.
- [ ] Single-page lists (total > 0, totalPages === 1) render the full control with all nav disabled + number 1 — spec-minimum; archived change deferred hiding single-page controls to polish; confirm hiding when `totalPages === 1` is desired in Slice D.
- [ ] `paginasVisibles` keying: the component uses index-based React keys for mixed number/ellipsis slots (list is small and static per render) — acceptable, or prefer value-based keys for the numbers?

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. (The "route" changed is a Hono HTTP handler with a fixed path; no dynamic process-level routing is introduced.)
