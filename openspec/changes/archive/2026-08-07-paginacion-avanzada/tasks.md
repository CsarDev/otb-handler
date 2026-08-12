# Tasks: Advanced Configurable Pagination (paginacion-avanzada)

Implementation order follows the design's rollout (design.md §Migration/Rollout): **core constant → pure helper + test → component + exports → API + suite → store → routes → polish → verification**. Each task is a reviewable work unit (work-unit-commits); tests land with the behavior they verify. Slices A–D follow the design's slice mapping (design.md §Slice Mapping) as STACKED PRs to main — **Slice A changes the libro-diario GET shape, so the store refactor (T4.2, Slice B) must merge promptly after A; the reportes tab is runtime-broken until B lands** (D48 audit: exactly ONE fetch site + ONE render site, both updated in the same chain). `strict_tdd` is TRUE (vitest workspace, `pnpm test`): the two NEW suites are authored RED before their GREEN route/helper changes.

**Test plan mapping (design D50)**: `packages/ui/src/lib/paginacion-window.test.ts` — the FIRST vitest suite in `packages/ui` (vitest script `--passWithNoTests`; workspace `packages/*` picks it up automatically) → **Slice A** (T1.2). `packages/api/test/reportes.test.ts` — NEW suite (design confirms no reportes suite exists; mirrors `multas.test.ts`'s envelope matrix), **Slice A** (T2.2). Component/store/route behavior stays source-verified (D40/D50: no UI test infra — typecheck + api suites + manual smoke).

**Task index** (14 work units → `T<area>.<n>`):

| Task | Area | Slice | Summary |
|------|------|-------|---------|
| T1.1 | [core] | A | `DEFAULT_PAGE_SIZE_OPTIONS` + `PageSizeOption` in `@otb/core` (D51) |
| T1.2 | [ui] | A | RED: NEW `paginacion-window.test.ts` — first vitest suite in `packages/ui` (D43/D50) |
| T1.3 | [ui] | A | GREEN: NEW `paginacion-window.ts` — `paginasVisibles` + `PaginaSlot` (D43) |
| T1.4 | [ui] | A | `packages/ui/src/index.ts` — export helper + constant (D43/D51) |
| T2.1 | [api] | A | `reportes.ts` GET /libro-diario → envelope + `fecha ASC, id DESC` + COUNT (D48) |
| T2.2 | [test] | A | RED: NEW `reportes.test.ts` — libro-diario envelope matrix (D48/D50) |
| T3.1 | [ui] | B | `pagination.tsx` additive upgrade: numbers/ellipsis/first-last, aria-current, size select, sm: rule (D42/D44/D45/D46) |
| T4.1 | [web] | B | `app.store.ts` — `setMultasPageSize` + `setAporteRegistrosPageSize` (D47) |
| T4.2 | [web] | B | `app.store.ts` — libroDiario state + `fetchLibroDiario(filters?, page?)` refactor + setters (D47) |
| T5.1 | [web] | C | `multas.tsx` — wire `onPageSizeChange` (D42/D47) |
| T5.2 | [web] | C | `aportes.tsx` — wire `onPageSizeChange` (D42/D47) |
| T5.3 | [web] | C | `reportes.tsx` — filters object, page-reset effect, Pagination render, empty-state (D49) |
| T6.1 | [ui/web] | D | Polish: a11y audit, responsive pass, single-page hide-if-totalPages=1 (if confirmed) (D44/D46/D50) |
| T7.1 | [all] | D | Final gate: `pnpm test` + `pnpm typecheck` + verify matrix vs 33 scenarios |

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ≈ 620–760 authored (A ~330–400 · B ~180–220 · C ~45–60 · D ~60–80) |
| 400-line budget risk | **Medium** — Slice A is AT the guard (helper+suite ≈ 165, envelope+suite ≈ 255); if A exceeds it, split `reportes.test.ts` into its own commit within the slice (archived D40 precedent) |
| Chained PRs recommended | Yes — 4 stacked slices (A → B → C → D) |
| Suggested split | PR A (backend + pure helper + both new suites) → PR B (component + store) → PR C (route wiring) → PR D (polish/regression) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main (cached) |

```
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium
```

Decision is **Yes** per ask-on-risk: the forecast says chain (A–D) with Slice A at the 400-line guard — the orchestrator must confirm the stacked-to-main order before apply. Per design.md §Slice Mapping: A's two new test files are already separate units (T1.2/T2.2) so an in-slice split is trivial if A lands over budget.

### Suggested Work Units (chained-PR boundaries)

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Backend + pure helper: core constant, `paginasVisibles` + suite, ui exports, libro-diario envelope + `reportes.test.ts` | PR A | `pnpm --filter @otb/ui test` + `pnpm test` (api: reportes.test.ts) | vitest in-memory sqlite via `requestJson` (no live server); ui suite pure | `git revert` of reportes.ts handler → bare array; delete `paginacion-window.ts` + `.test.ts`; core/ui deltas additive |
| 2 | Component + store: `pagination.tsx` upgrade; store page-size setters + libroDiario state + `fetchLibroDiario` refactor | PR B | `pnpm typecheck` (ui, web) + `pnpm --filter @otb/ui test` | dev-server smoke (numbers/ellipsis/first/last at both existing call sites, unchanged props) | revert `pagination.tsx` + `app.store.ts` additions; routes still render page-1 data (additive props) |
| 3 | Route wiring: multas/aportes `onPageSizeChange`; reportes.tsx filters + effect + Pagination + empty-state | PR C | `pnpm typecheck` (web) | dev-server smoke (size select refetch + reset, libro diario "Página X de Y", beyond-range no false empty-state) | revert the 3 route edits + store libroDiario field usage; main keeps additive component |
| 4 | Polish: a11y audit, responsive pass, single-page polish (if confirmed), full regression | PR D | `pnpm test` (root) + `pnpm typecheck` | dev-server smoke checklist at 360/640/1024px | revert polish-only edits; no behavior rework |

---

## Phase 1: Foundation — Core Constant + Pure Helper [Slice A]

### T1.1 [core] `packages/core/src/index.ts` — `DEFAULT_PAGE_SIZE_OPTIONS` + `PageSizeOption` (D51)

- [x] Add `export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const` + `export type PageSizeOption = (typeof DEFAULT_PAGE_SIZE_OPTIONS)[number]` next to `Paginated<T>` (line ~211). One source of truth for the select options (D45) and the store clamp (D47); the API cap stays `MAX_PAGE_SIZE = 100` in `packages/api/src/lib/paginacion.ts` (separate server concern, D51).
- [x] **Files**: `packages/core/src/index.ts`.
- [x] **Verification**: `pnpm typecheck` (core).
- [x] **Depends on**: none.

### T1.2 [ui] RED: NEW `packages/ui/src/lib/paginacion-window.test.ts` — first vitest suite (D43/D50)

- [x] Author the failing suite FIRST (strict TDD — this is the package's first real test file; `vitest run --passWithNoTests` must now find real tests). Cover EVERY contract case (paginacion-window spec scenarios 1–7 + design matrix D43/D50): all-pages ≤7 `(3,5)→[1,2,3,4,5]`; middle `(5,20)→[1,'ellipsis',4,5,6,'ellipsis',20]`; edge 1 `(1,20)→[1,2,'ellipsis',20]`; edge N `(20,20)→[1,'ellipsis',19,20]`; both sides `(10,20)→[1,'ellipsis',9,10,11,'ellipsis',20]`; out-of-range small `(9,2)→[1,2]` and large `(30,20)→[1,'ellipsis',20]`; cap sweep `paginasVisibles(p, 10_000)` for p in 1..10_000 → length ≤ 7; custom `maxSlots=5` → length ≤ 5; defensive `(1,0)`/`(1,-3)` → `[]`; determinism (same call twice, deep-equal).
- [x] **Files**: `packages/ui/src/lib/paginacion-window.test.ts` (NEW).
- [x] **Verification**: `pnpm --filter @otb/ui test` — suite RED until T1.3 lands.
- [x] **Depends on**: none (pure contract pinned by the spec).

### T1.3 [ui] GREEN: NEW `packages/ui/src/lib/paginacion-window.ts` — `paginasVisibles` (D43)

- [x] Implement per design D43 verbatim: `PaginaSlot = number | 'ellipsis'`; `tp = Math.max(1, totalPages)`; `tp <= maxSlots` → all pages; visible set `[...new Set([1, tp, page-1, page, page+1])].filter(1<=n<=tp).sort()`; cap guard loop (only fires for custom maxSlots < 7, never for default 7); insert `'ellipsis'` where gap > 1. Do NOT clamp `page` before the set — out-of-range neighbors fall out via the intersection.
- [x] **Files**: `packages/ui/src/lib/paginacion-window.ts` (NEW).
- [x] **Verification**: `pnpm --filter @otb/ui test` — T1.2 suite GREEN.
- [x] **Depends on**: T1.2 (RED).

### T1.4 [ui] `packages/ui/src/index.ts` — export helper + constant (D43/D51)

- [x] Export `paginasVisibles`, `type PaginaSlot` from `./lib/paginacion-window`; re-export `DEFAULT_PAGE_SIZE_OPTIONS` from `@otb/core` (component default in D45 imports it here for convenience).
- [x] **Files**: `packages/ui/src/index.ts`.
- [x] **Verification**: `pnpm typecheck` (ui).
- [x] **Depends on**: T1.3, T1.1.

## Phase 2: API Route [Slice A] — RED suite first

### T2.1 [api] `packages/api/src/routes/reportes.ts` — GET /libro-diario envelope (D48)

- [x] Lines 83–135: add `parsePaginacion(c.req.query())` (existing `packages/api/src/lib/paginacion.ts`, defaults 1/25, cap 100); keep the EXISTING filter block untouched (`anulado=0` + tipo/fechas/gestion/mes/estadoId/grupoId); `total` = `count(*)` over the SAME FROM + LEFT JOIN socios + WHERE (estadoId/grupoId reference `schema.socios` — a join-less count would fail, D33 pattern); items = same field list as today, `.orderBy(asc(schema.movimientos.fecha), desc(schema.movimientos.id)).limit(pageSize).offset((page - 1) * pageSize)`; return `c.json({ items, total: Number(total?.n ?? 0), page, pageSize })`. Add `asc`/`desc` to the drizzle-orm import.
- [x] Preserve the EXISTING filter semantics verbatim — do NOT add the "últimos 30 días" default (D51 flag: the current handler has no date default; the regression scenario is a spec/code discrepancy, re-tag in verify, not implement).
- [x] **Files**: `packages/api/src/routes/reportes.ts`.
- [x] **Verification**: `pnpm test` — reportes.test.ts scenarios in T2.2 (default 25/60, clamp 100, beyond-range page 9, empty total 0, invalid fallbacks, deterministic order, same-date tiebreak, filters-before-pagination, anulado regression, estadoId+grupoId combined).
- [x] **Depends on**: T2.2 (RED authored before this GREEN).

### T2.2 [test] RED: NEW `packages/api/test/reportes.test.ts` — libro-diario envelope matrix (D48/D50)

- [x] Author the failing suite BEFORE the T2.1 GREEN change (strict TDD). NEW suite (design confirms none exists) mirroring `multas.test.ts`'s envelope structure. Seed socios via `crearSocio` (estadoId/grupoId cases); seed `movimientos` via direct `ejecutar('INSERT INTO movimientos (id, tipo, socio_id, monto, numero_recibo, nota, fecha, anulado) VALUES (...)', [...])` with explicit ids/`fechas` for deterministic order (`limpiarDatos()` already deletes movimientos, helpers.ts:58). Matrix (design Test Plan §2): default 60 movs → `{ items: [25], total: 60, page: 1, pageSize: 25 }`; `pageSize=500` → echo 100; `page=9` beyond range → `items: []`, total kept; empty → `{ items: [], total: 0 }`; `page=abc&pageSize=-5` → defaults 1/25; deterministic order — 60 movs distinct fechas, page 1 = 25 oldest, union pages 1–3 = all 60 no dupes/gaps, raw-SQL cross-check `ORDER BY fecha ASC, id DESC`; same-date tiebreak `id DESC`; filters before pagination (`?tipo`, `?estadoId`, `?grupoId`, `?fechaDesde&fechaHasta`) → subset + filtered total; regression `anulado=0` never shows; regression combined estadoId+grupoId (COUNT mirrors joins).
- [x] **Files**: `packages/api/test/reportes.test.ts` (NEW).
- [x] **Verification**: `pnpm test` (api) — RED before T2.1, finalized GREEN with it. Existing 7 api suites (aporte-dedup, aporte-definicion, aportes-bulk-all-pagos, aportes-generacion, grupos, multas, socios-aportes) pass untouched (D48 audit: none call /libro-diario).
- [x] **Depends on**: none (GREEN target is T2.1).

## Phase 3: UI Component [Slice B]

### T3.1 [ui] `packages/ui/src/components/pagination.tsx` — additive upgrade (D42/D44/D45/D46)

- [x] Add OPTIONAL props `onPageSizeChange?`, `pageSizeOptions?` (default `DEFAULT_PAGE_SIZE_OPTIONS`), `maxSlots?` (default 7) — the 4 required props untouched, so multas.tsx:361–366 and aportes.tsx:599–604 compile unchanged (D42 backward-compat proof: only 2 call sites in repo, zero in desktop/mobile).
- [x] Rendering (D44): `totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))`; `total === 0` → `null` (regression preserved); full layout `[<select>?][Primera hidden sm:inline-flex][Anterior][numbers hidden sm:flex][Página X de Y aria-live="polite"][Siguiente][Última hidden sm:inline-flex]`; row `mt-4 flex flex-wrap items-center justify-end gap-2` (D37 + flex-wrap). Numbers via `paginasVisibles(page, totalPages, maxSlots)` — number buttons native `<button type="button">` with `aria-label={`Página ${n}`}`, current page carries `aria-current="page"` + `bg-blue-600 text-white border-blue-600`; `'ellipsis'` → `<span aria-hidden="true">…</span>` (never focusable). Primera `ChevronsLeft`+"Primera" `aria-label="Primera página"` `disabled={page <= 1}`; Anterior `ChevronLeft` (D37 preserved); Siguiente `ChevronRight` `disabled={page >= totalPages}`; Última `ChevronsRight`+"Última" `aria-label="Última página"` `disabled={page >= totalPages}`; REAL `disabled` attribute (focus skips, D37 precedent). Out-of-range page still renders (navigable window, D43).
- [x] Size select (D45): rendered FIRST (LEFT of controls) ONLY when `onPageSizeChange` provided: native `<select aria-label="Filas por página">` over `(pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS)`, `value={pageSize}`, `onChange={(e) => onPageSizeChange(Number(e.target.value))}`; no option above 100 (server cap syncs, no extra clamp). Absent prop → NO select (spec scenario).
- [x] Responsive (D46): numbers container `hidden sm:flex items-center gap-1`; Primera/Última `hidden sm:inline-flex`; prev/info/next + select ALWAYS visible; `sm:` (640px) NOT `md:` (matches app table↔cards breakpoint at multas.tsx:283/327, aportes.tsx:564, reportes.tsx:269/307).
- [x] **Files**: `packages/ui/src/components/pagination.tsx`, `packages/ui/src/index.ts` (export updated automatically via existing `export *` or explicit re-export).
- [x] **Verification**: `pnpm typecheck` (ui) + `pnpm --filter @otb/ui test`; manual smoke T6.1/T7.1 (pagination scenarios: full nav on multi-page, first/last boundary disables, ellipsis 1…4 5 6…20, all pages ≤7, aria-current, out-of-range renders, below sm hides numbers/first/last).
- [x] **Depends on**: T1.1 (constant), T1.3 (helper). **Slice B**.

## Phase 4: Store [Slice B]

### T4.1 [web] `apps/web/src/stores/app.store.ts` — page-size setters multas/aportes (D47)

- [x] Add `setMultasPageSize: async (pageSize, filters?) => Promise<void>` and `setAporteRegistrosPageSize: async (pageSize, filters?) => Promise<void>` following the D38 single-mutation pattern: `const size = DEFAULT_PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE` (25 — import from `@otb/core`); `set({ multasPageSize: size, multasPage: 1 })` (reset page 1); ONE refetch `return get().fetchMultas(filters, 1)`. Existing route effects (multas.tsx:114 `[tab, filters, setMultasPage]`, aportes.tsx:218) do NOT include pageSize → no double-fetch (D47 proof).
- [x] **Files**: `apps/web/src/stores/app.store.ts`.
- [x] **Verification**: `pnpm typecheck` (web); manual smoke (pagination scenario "Changing the size resets to page 1 and refetches" on both lists).
- [x] **Depends on**: T1.1 (constant). **Slice B**.

### T4.2 [web] `apps/web/src/stores/app.store.ts` — libro diario state + fetch refactor (D47)

- [x] Add `libroDiarioTotal: number` (default 0), `libroDiarioPage: number` (1), `libroDiarioPageSize: number` (25). Refactor `fetchLibroDiario` (lines 191, 628–645): 7 positional args → `(filters?: LibroDiarioFilters, page?: number)` — build `URLSearchParams` from the object, ALWAYS set `page` (`page ?? get().libroDiarioPage`) and `pageSize` (`get().libroDiarioPageSize`), response type `Paginated<LibroDiarioEntry>` (reuses `Paginated<T>` from `@otb/core`), unpack `{ libroDiario: data.items, libroDiarioTotal: data.total, libroDiarioPage: data.page, libroDiarioPageSize: data.pageSize, reportsLoading: false }`; error path unchanged (silent `reportsLoading: false`). Add `setLibroDiarioPage(page, filters?)` and `setLibroDiarioPageSize(pageSize, filters?)` — clamp + reset page 1 + single refetch (identical shape to T4.1). Exactly ONE caller (reportes.tsx:61) — updated in T5.3.
- [x] **Files**: `apps/web/src/stores/app.store.ts`.
- [x] **Verification**: `pnpm typecheck` (web) — catches the single caller signature change until T5.3 lands.
- [x] **Depends on**: T1.1, T2.1 (envelope). **Slice B — MUST merge promptly after A** (reportes tab broken until this unpack lands).

## Phase 5: Web Routes [Slice C]

### T5.1 [web] `apps/web/src/routes/multas.tsx` — wire `onPageSizeChange` (D42/D47)

- [x] Existing `Pagination` call (lines 361–366): add `onPageSizeChange={(s) => setMultasPageSize(s, listarFilters)}`. Nothing else changes (additive API).
- [x] **Files**: `apps/web/src/routes/multas.tsx`.
- [x] **Verification**: `pnpm typecheck` (web); manual smoke (select renders left of controls; change refetches + resets to page 1).
- [x] **Depends on**: T3.1, T4.1. **Slice C**.

### T5.2 [web] `apps/web/src/routes/aportes.tsx` — wire `onPageSizeChange` (D42/D47)

- [x] Existing `Pagination` call (lines 599–604): add `onPageSizeChange={(s) => setAporteRegistrosPageSize(s, pagarFilters)}`.
- [x] **Files**: `apps/web/src/routes/aportes.tsx`.
- [x] **Verification**: `pnpm typecheck` (web); manual smoke (same as T5.1 on the pagar tab).
- [x] **Depends on**: T3.1, T4.1. **Slice C**.

### T5.3 [web] `apps/web/src/routes/reportes.tsx` — libro diario wiring (D49)

- [x] (1) Derive `libroDiarioFilters` (store-local `LibroDiarioFilters`, undefined-when-empty) from existing state: `{ fechaDesde: fechaDesde || undefined, fechaHasta: fechaHasta || undefined, gestion: ldGestion || undefined, mes: ldMes || undefined, tipo: ldTipo === 'todos' ? undefined : ldTipo, estadoId: ldEstadoId || undefined, grupoId: ldGrupoId || undefined }` (fechaDesde/fechaHasta SHARED with balance rango mode — preserves today's behavior). (2) Effect (line 61): replace the 7-arg `fetchLibroDiario(...)` with `setLibroDiarioPage(1, libroDiarioFilters)`; deps replace `fetchLibroDiario` with `setLibroDiarioPage` and MUST NOT include `libroDiarioPage`/`libroDiarioPageSize` (loop guard, D47). Balance/resumen branches keep `fetchBalance`/`fetchResumenSocio`. (3) Render `<Pagination page={libroDiarioPage} total={libroDiarioTotal} pageSize={libroDiarioPageSize} onPageChange={(p) => setLibroDiarioPage(p, libroDiarioFilters)} onPageSizeChange={(s) => setLibroDiarioPageSize(s, libroDiarioFilters)} />` after line 326; add `Pagination` to the `@otb/ui` import (line 4). (4) Empty-state (line 262): `libroDiario.length === 0 && !reportsLoading` → `libroDiarioTotal === 0 && !reportsLoading` (beyond-range page must not show false "No hay movimientos"); table/cards render conditions stay `libroDiario.length > 0`.
- [x] **Files**: `apps/web/src/routes/reportes.tsx`.
- [x] **Verification**: `pnpm typecheck` (web); manual smoke (reports scenario: envelope unpacks, "Página X de Y", page nav + size select, empty state only on total 0).
- [x] **Depends on**: T3.1, T4.2, T2.1 (envelope). **Slice C**.

## Phase 6: Polish [Slice D]

### T6.1 [ui/web] Polish: a11y, responsive, single-page (D44/D46/D50)

- [x] A11y audit of `Pagination`: `aria-current="page"` present on current number; `aria-live="polite"` page info; all buttons keyboard-accessible (Tab + Enter/Space, native); ellipsis span `aria-hidden` (never focusable/announced); size select labeled via `aria-label`.
- [x] Responsive pass at 360/640/1024px: below 640 numbers + Primera/Última hidden, select + prev/info/next visible, `flex-wrap` no overflow; at ≥640 full nav.
- [x] Single-page lists (total > 0, totalPages === 1): hide the controls when `totalPages === 1` ONLY if the design Open Question is confirmed (currently spec-minimum = render all-disabled + number 1) — defer if unconfirmed.
- [x] **Files**: `packages/ui/src/components/pagination.tsx`, `apps/web/src/routes/reportes.tsx` (polish-only edits).
- [x] **Verification**: `pnpm typecheck` + manual smoke; regression via T7.1.
- [x] **Depends on**: T3.1, T5.1–T5.3. **Slice D**.

## Phase 7: Verification [Slice D]

### T7.1 [all] Final verification gate

- [x] `pnpm test` (root — all workspaces green; NEW paginacion-window + reportes suites execute with real tests, NOT skipped by `--passWithNoTests`; existing 7 api suites untouched).
- [x] `pnpm typecheck` (core, api, ui, web) — clean, especially `apps/web` after the `fetchLibroDiario` signature refactor and new props at both call sites.
- [x] Verify matrix: walk ALL 33 spec scenarios (15 pagination + 9 reports + 9 paginacion-window) against code/tests; RE-TAG the reports "últimos 30 días" scenario as a spec/code discrepancy (D51 flag — handler has no date default; do NOT implement it here).
- [x] Manual dev-server smoke: size select refetches + resets page (multas/aportes/libro diario); numbers/ellipsis/first/last render; aria-current present; below 640px compact control; libro diario paginates with deterministic order.
- [x] **Depends on**: all prior tasks. **Slice D**.
- [x] **Verification**: exit code 0 for every command; `git status` shows only intended files.

---

## Scenario Coverage Traceability (33/33 — 26 NEW + 7 regression)

| Spec scenario | Task(s) |
|---|---|
| **pagination (15)** | |
| Selector renders only when onPageSizeChange is provided — NEW | T3.1 (D45 gating), T5.1/T5.2 (props wired) |
| Changing the size resets to page 1 and refetches with the new pageSize — NEW | T4.1/T4.2 (setters clamp+reset+refetch), T5.1/T5.3 |
| Options are [10, 25, 50, 100] with no option above the server cap — NEW | T1.1 (D51 constant), T3.1 (D45 select) |
| Page-size change with active filters keeps the filters and refetches — NEW | T4.2 (filters passed through), T5.3 |
| Below sm: only prev/info/next and the size select render — NEW | T3.1 (D46 `hidden sm:flex`), T6.1 (responsive pass) |
| At sm: and above the full navigation renders — NEW | T3.1 (D46) |
| Component renders and drives page changes — (regression) | T3.1 (D44 preserves onPageChange), T7.1 manual |
| Boundary pages disable the appropriate control — (regression) | T3.1 (D44 disables) |
| Empty list renders no pagination controls — (regression) | T3.1 (`total === 0` → null) |
| Full navigation renders on a multi-page list — NEW | T3.1 (D44 layout) |
| First and last controls disable at boundary pages — NEW | T3.1 (D44 Primera/Última disables) |
| Ellipsis appears when totalPages > 7 and gap > 1 — NEW | T1.2/T1.3 (`paginasVisibles`), T3.1 (renders slots) |
| All pages are shown when totalPages ≤ 7 — NEW | T1.2/T1.3, T3.1 |
| Current page button carries aria-current="page" — NEW | T3.1 (D44), T6.1 (a11y audit) |
| Out-of-range page keeps rendering controls — NEW | T1.3 (window), T3.1 (renders), T2.2 (server echo) |
| **reports (9)** | |
| Movimientos en rango de fechas + LEFT JOIN fields — (regression) | T2.1 (fields/WHERE preserved), T2.2 (fields asserted) |
| Sin filtros retorna últimos 30 días — (regression, D51 FLAG) | T2.1 (verbatim — no default added), T7.1 (re-tag discrepancy) |
| Filtro por estado del socio — (regression) | T2.1 (WHERE preserved), T2.2 (estadoId case) |
| Filtro por grupo del socio + combinable — (regression) | T2.1, T2.2 (grupoId + combined case) |
| Devuelve la primera página con total — NEW | T2.1 (D48), T2.2 (60-mov default case) |
| pageSize mayor a 100 se clampea a 100 — NEW | T2.1 (parsePaginacion cap), T2.2 |
| Filtros antes de la paginación + total filtrado — NEW | T2.1 (COUNT mirrors WHERE), T2.2 |
| Orden determinista entre páginas (sin dupes/huecos) — NEW | T2.1 (fecha ASC, id DESC), T2.2 (union + raw-SQL cross-check) |
| Lista vacía items [] y total 0 — NEW | T2.1, T2.2 |
| **paginacion-window (9)** | |
| All pages when totalPages ≤ 7 — NEW | T1.2 (RED), T1.3 (GREEN) |
| Window around a middle page — NEW | T1.2, T1.3 |
| Edge page 1 — NEW | T1.2, T1.3 |
| Edge page totalPages — NEW | T1.2, T1.3 |
| Ellipsis on both sides when far from the edges — NEW | T1.2, T1.3 |
| Out-of-range page returns a navigable window — NEW | T1.2, T1.3 |
| maxSlots is never exceeded — NEW | T1.2 (10_000 sweep), T1.3 (cap guard) |
| The suite runs under the existing vitest script — NEW | T1.2 (first real suite), T7.1 (`pnpm test` root) |
| Every contract case has a test — NEW | T1.2 (full matrix) |

---

## Dependency Ordering

- **Within Slice A**: T1.1 (constant, independent) → T1.2 (RED suite, pure contract) → T1.3 (GREEN helper, after T1.2) → T1.4 (exports, after T1.3) → T2.2 (RED reportes suite) → T2.1 (GREEN route, after T2.2). TDD: each RED suite is authored before its GREEN change.
- **Slice B (after A)**: T3.1 (needs T1.1 + T1.3; can parallel-build with T4.1/T4.2) → T4.1 (needs T1.1) → T4.2 (needs T1.1 + T2.1 envelope). **T4.2 MUST merge promptly after A** — it is the consumer-side unpack of the new envelope; main's reportes tab is runtime-broken from A until B lands (D48 audit: exactly one fetch site, updated in this chain).
- **Slice C (after B)**: T5.1/T5.2 (need T3.1 + T4.1) → T5.3 (needs T3.1 + T4.2 + T2.1). T5.3 completes the envelope consumer; C is the smallest slice (~45–60 lines) — clean review.
- **Slice D (after C)**: T6.1 (polish, includes the single-page hide if the Open Question is confirmed) → T7.1 (final gate: tests + typecheck + 33-scenario verify matrix, incl. the D51 "últimos 30 días" re-tag).
- **Stack constraint**: A→B→C→D stacked-to-main; A changes the libro-diario GET shape, so B must merge promptly after A (main is runtime-broken for the reportes tab between A and B); B itself is additive (component props optional, store additions only) so C can lag safely; D is pure polish.
