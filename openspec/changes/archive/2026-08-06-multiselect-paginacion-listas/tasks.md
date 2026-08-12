# Tasks: Searchable MultiSelect for Multas + Pagination of Growing Lists (multiselect-paginacion-listas)

Implementation order follows the design's rollout order (design.md §Migration/Rollout): **core types → lib helpers → API routes → store → UI (Pagination + routes) → tests → final verification**. Each task is a reviewable work unit (work-unit-commits); tests land with the behavior they verify. Slices A–D follow the design's slice mapping (design.md §Slice Mapping) as STACKED PRs to main — **Slice A changes both GET shapes, so the web store halves (Slice B/C) must merge promptly after A; main is runtime-broken for the two lists until B+C land** (D39). `strict_tdd` is TRUE (vitest workspace, `pnpm test`): RED failing tests are authored before the GREEN route change inside each backend work unit.

**Task index** (16 work units → `T<area>.<n>`):

| Task | Area | Slice | Summary |
|------|------|-------|---------|
| T1.1 | [core] | A | `Paginated<T>`; `BulkMultaRequest.socioIds?` + `grupoIds?`; `BulkMultaResponse` (D33/D36) |
| T1.2 | [api] | A | NEW `lib/paginacion.ts` — `parsePaginacion`, defaults 1/25, cap 100 (D33) |
| T1.3 | [api] | A | `lib/aportes.ts` — `sociosPorGrupos` union helper (D35) |
| T2.1 | [api] | A | GET /multas → envelope + `ORDER BY fechaGen DESC, id DESC` (D33/D34) |
| T2.2 | [api] | A | GET /aportes → envelope + `ORDER BY gestion DESC, mes DESC, id DESC` (D33/D34) |
| T2.3 | [api] | A | POST /bulk `grupoIds` validation + union target set (D35/D36) |
| T3.1 | [ui] | C | NEW `Pagination` component + `@otb/ui` export (D37) |
| T4.1 | [web] | B | Store multas half: `multasTotal/Page/PageSize`, `fetchMultas(filters?, page?)`, `setMultasPage`, `createMultasBulk` (D38) |
| T4.2 | [web] | C | Store aporte half: `aporteRegistrosTotal/Page/PageSize`, `fetchAporteRegistros(filters?, page?)`, `setAporteRegistrosPage` (D38) |
| T5.1 | [web] | B | `multas.tsx` create tab: Socios+Grupos MultiSelects, zod at-least-one, union count + copy, no raw fetch (D41) |
| T5.2 | [web] | C | `multas.tsx` listar tab: page-reset effect, empty-state on `total===0`, `Pagination` render (D37/D38) |
| T5.3 | [web] | C | `aportes.tsx` pagar tab: page-reset effect, empty-state, `Pagination` render (D37/D38) |
| T6.1 | [test] | A | NEW `multas.test.ts`: bulk `grupoIds` matrix + multas envelope matrix (D40) |
| T6.2 | [test] | A | `aportes-generacion.test.ts`: GET /aportes pagination describe (D40) |
| T6.3 | [test] | D | Edge cases + a11y + copy + manual smoke pass (D40 polish) |
| T7.1 | [all] | D | Final verification gate: tests, typecheck, build, no-raw-fetch grep |

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ≈ 1,100 authored (A ~635 · B ~195 · C ~225 · D ~80) |
| 400-line budget risk | **High** — Slice A alone ≈ 635 lines (>400); B/C/D Low |
| 800-line budget risk (session guard) | Low per slice — A ≈ 635 < 800 |
| Chained PRs recommended | Yes — 4 stacked slices (A → B → C → D) |
| Suggested split | PR A (backend+tests) → PR B (web multas) → PR C (pagination UI + aportes) → PR D (polish) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main (cached) |

```
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
```

Decision is **Yes** per ask-on-risk: the forecast says chain (A–D), and Slice A (routes + lib + NEW ~320-line test suite) exceeds the 400-line default budget — the orchestrator must confirm the stacked-to-main order before apply. Per design.md §Slice Mapping: if Slice A alone exceeds the guard, commit the new test suite as its own commit within the slice (it already is — T6.1/T6.2 are separate units).

### Suggested Work Units (chained-PR boundaries)

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Backend contract: types + helpers + both GETs + POST /bulk + new/updated suites | PR A | `pnpm test` (api: `multas.test.ts`, `aportes-generacion.test.ts`) | vitest in-memory sqlite via `requestJson` (no live server needed) | `git revert` of the 2 GET handlers + POST /bulk + core/lib deltas; additive except GET shapes; `grupoIds` optional → POST reverts to `socioIds`-only |
| 2 | Web multas: store multas half + create-tab MultiSelects | PR B | `pnpm typecheck` (web) + `pnpm build` (web) | dev-server smoke (create with socios+grupos, union count, toast) | revert `app.store.ts` multas half + `multas.tsx` create tab; list still renders page-1 data |
| 3 | Pagination UI: `Pagination` component + store aporte half + both listar/pagar wirings | PR C | `pnpm typecheck` (ui, web) + `pnpm build` | dev-server smoke (page nav, boundary disables, reset-on-filter) | revert `pagination.tsx` + export + store aporte half + both route wirings |
| 4 | Polish: edge cases, a11y, copy, full regression | PR D | `pnpm test` (root) full regression | dev-server smoke checklist | revert polish-only changes; no behavior rework |

---

## Phase 1: Foundation — Core Types + Lib Helpers [Slice A]

### T1.1 [core] `packages/core/src/index.ts` — `Paginated<T>`, `BulkMultaRequest`, `BulkMultaResponse` (D33/D36)

- [x] Add `export type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number }` (total = COUNT of all rows matching filters, pre-pagination; page/pageSize echo effective values).
- [x] `BulkMultaRequest`: `socioIds` becomes `socioIds?: string[]` (optional with grupoIds) + add `grupoIds?: string[]` + keep `concepto`, `monto`, `actividadId?`, `fecha?`.
- [x] Add `export type BulkMultaResponse = { count: number; items: Multa[] }`.
- [x] **Do NOT** add `page`/`pageSize` to any filter type — `MultaFilters`/`AporteFilters` are store-local and `page`/`pageSize` are separate query params (D38 correction to the proposal).
- [x] **Files**: `packages/core/src/index.ts`.
- [x] **Verification**: `pnpm typecheck` (core) passes.
- [x] **Depends on**: none.

### T1.2 [api] NEW `packages/api/src/lib/paginacion.ts` — `parsePaginacion` (D33)

- [x] `export const DEFAULT_PAGE_SIZE = 25; export const MAX_PAGE_SIZE = 100;`
- [x] `export function parsePaginacion(query: { page?: string; pageSize?: string }): { page: number; pageSize: number }` — non-integer/`page < 1` → 1; non-integer/`pageSize < 1` → 25; `pageSize > 100` → clamped to 100 (echo shows 100); negative/NaN → defaults.
- [x] **Files**: `packages/api/src/lib/paginacion.ts` (NEW).
- [x] **Verification**: `pnpm typecheck` (api); clamp/fallback semantics exercised by T6.1/T6.2 envelope scenarios.
- [x] **Depends on**: none.

### T1.3 [api] `packages/api/src/lib/aportes.ts` — `sociosPorGrupos` (D35)

- [x] Add `export function sociosPorGrupos(grupoIds: string[]): Set<string>` — deduped union of socios with `grupoPrimarioId ∈ grupoIds` (batch select on `schema.socios`) OR `socio_grupos.grupoId ∈ grupoIds` (batch join select); 2 queries, no N+1; empty input → empty Set; point-in-time resolution at call time.
- [x] **Files**: `packages/api/src/lib/aportes.ts`.
- [x] **Verification**: `pnpm typecheck` (api).
- [x] **Depends on**: none.

## Phase 2: API Routes [Slice A] — RED tests first per work unit

### T2.1 [api] `packages/api/src/routes/multas.ts` — GET / envelope + ORDER BY (D33/D34)

- [x] `const { page, pageSize } = parsePaginacion(c.req.query())`; single `where = filters.length ? and(...filters) : undefined` shared by COUNT and items (drizzle accepts `.where(undefined)`); `total = SELECT count(*)` with the SAME FROM + LEFT JOIN socios (estadoId/grupoId filters reference `schema.socios`); items: `.orderBy(desc(schema.multas.fechaGen), desc(schema.multas.id)).limit(pageSize).offset((page - 1) * pageSize)`; return `c.json({ items, total, page, pageSize })`.
- [x] **Files**: `packages/api/src/routes/multas.ts` (GET handler, lines 8–39).
- [x] **Verification**: `pnpm test` — multas envelope scenarios in T6.1 (default page, clamp, beyond-range page 9, empty total 0, invalid fallback, deterministic order no dupes/gaps, filtered total, combined filters, estado regression).
- [x] **Depends on**: T1.1, T1.2.

### T2.2 [api] `packages/api/src/routes/aportes.ts` — GET / envelope + ORDER BY (D33/D34)

- [x] Same pattern as T2.1; items `.orderBy(desc(schema.aportes.gestion), desc(schema.aportes.mes), desc(schema.aportes.id))` (NULLs sort last in DESC, deterministic); COUNT mirrors the same FROM + LEFT JOIN + WHERE.
- [x] **Files**: `packages/api/src/routes/aportes.ts` (GET handler, lines 31–63).
- [x] **Verification**: `pnpm test` — aportes pagination describe in T6.2.
- [x] **Depends on**: T1.1, T1.2.

### T2.3 [api] `packages/api/src/routes/multas.ts` — POST /bulk `grupoIds` (D35/D36)

- [x] Validation in order, ALL before any insert: (1) `if ((!body.socioIds?.length && !body.grupoIds?.length) || !body.concepto || !body.monto) return 400 { error: 'socioIds (array), concepto, and monto are required' }` (message unchanged); (2) present-but-non-array `grupoIds` → `400 { error: 'grupoIds must be an array' }`; (3) every id must exist in `grupos` (batch `inArray`) → `400 { error: 'grupoIds contains an invalid group' }`; (4) `targetIds = [...new Set([...(body.socioIds ?? []), ...sociosPorGrupos(grupoIds)])]`; (5) existing `permitidos.length === 0` check reused verbatim → `400 { error: 'Ningún socio puede participar en esta acción en su estado actual' }`; (6) existing bulk transaction loop (lines 65–82) → `201 { count, items }`. Absent/`[]` `grupoIds` → behaves exactly as today.
- [x] **Files**: `packages/api/src/routes/multas.ts` (POST /bulk handler, lines 41–84).
- [x] **Verification**: `pnpm test` — bulk matrix in T6.1 (payments scenarios 1–8).
- [x] **Depends on**: T1.1 (`BulkMultaRequest`), T1.3.

## Phase 3: UI Component [Slice C]

### T3.1 [ui] NEW `packages/ui/src/components/pagination.tsx` — `Pagination` (D37)

- [x] Hand-rolled, zero new deps (lucide-react `ChevronLeft`/`ChevronRight` already in the kit): `export type PaginationProps = { page: number; total: number; pageSize: number; onPageChange: (page: number) => void }`; `totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))`; `total === 0` → render `null`; prev native `<button type="button">` `disabled={page <= 1}` "Anterior" + `ChevronLeft` `aria-label="Página anterior"`; next `disabled={page >= totalPages}` "Siguiente" + `ChevronRight` `aria-label="Página siguiente"`; info `Página {page} de {totalPages}` with `aria-live="polite"`; styling `mt-4 flex items-center justify-end gap-2`, buttons `border border-gray-300 rounded-md px-3 py-1.5 text-sm` (enabled `text-gray-700 hover:bg-gray-50`, disabled `text-gray-300 cursor-not-allowed`).
- Export `Pagination` from `packages/ui/src/index.ts`.
- **Files**: `packages/ui/src/components/pagination.tsx` (NEW), `packages/ui/src/index.ts`.
- **Verification**: `pnpm typecheck` (ui) + `pnpm build` (ui); manual smoke T6.3/T7.1 (pagination scenarios 10–12: next enabled/onPageChange(2), prev disabled page 1, next disabled last page, total 0 → nothing).
- **Depends on**: none.

## Phase 4: Store [Slice B + C]

### T4.1 [web] `apps/web/src/stores/app.store.ts` — multas half (D38)

- [x] Add `multasTotal: number`, `multasPage: number` (default 1), `multasPageSize: number` (default 25); `fetchMultas(filters?: MultaFilters, page?: number)` — ALWAYS appends `page` (`page ?? get().multasPage`) and `pageSize` (`get().multasPageSize`) to the param builder (lines 282–300), response type `Paginated<Multa>`, unpack `{ multas: data.items, multasTotal: data.total, multasPage: data.page, multasPageSize: data.pageSize }`; `setMultasPage(page, filters)` = `set({ multasPage: page })` then `return get().fetchMultas(filters, page)` (single path for page-change AND filter-reset); `createMultasBulk(payload: BulkMultaRequest): Promise<BulkMultaResponse>` mirrors `createAportesBulk` (lines 531–536) — `request<BulkMultaResponse>('/multas/bulk', { method: 'POST', body: JSON.stringify(payload) })` then `await get().fetchMultas(undefined, 1)`; `request` throws `ApiError` with the API's message → surfaced as friendly `alert(e.message)` by the caller.
- **Files**: `apps/web/src/stores/app.store.ts`.
- **Verification**: `pnpm typecheck` (web); manual smoke T7.1 (payments scenario 14 — 400 surfaced; pagination scenario 13 — onPageChange(2) refetches page 2).
- **Depends on**: T1.1 (types), T2.1 (envelope), T2.3 (bulk). **Slice B**.

### T4.2 [web] `apps/web/src/stores/app.store.ts` — aporte half (D38)

- [x] Add `aporteRegistrosTotal`, `aporteRegistrosPage` (default 1), `aporteRegistrosPageSize` (default 25); `fetchAporteRegistros(filters?: AporteFilters, page?: number)` — ALWAYS sends page/pageSize, unpacks `Paginated<AporteRegistro>` (replaces `request<AporteRegistro[]>` at line 262); `setAporteRegistrosPage(page, filters)` single mutation path; no-arg callers (aportes.tsx:286,293; app.store.ts:222,229) stay valid (page defaults to store state).
- **Files**: `apps/web/src/stores/app.store.ts`.
- **Verification**: `pnpm typecheck` (web); manual smoke T7.1 (pagination scenario 15 — envelope unpacked into items + total).
- **Depends on**: T1.1 (types), T2.2 (envelope). **Slice C**.

## Phase 5: Web Routes [Slice B + C]

### T5.1 [web] `apps/web/src/routes/multas.tsx` — create tab MultiSelects (D41)

- [x] Replace checkbox scrollbox (lines 163–177) with Socios MultiSelect (options = existing `permitidos`, lines 127–129) + NEW Grupos MultiSelect (options = store `grupos`); component state `selectedGrupoIds: string[]`; socios stays controlled via `createForm.watch('socioIds')` / `setValue('socioIds', ...)` (existing `toggleSocio` pattern).
- Zod: `socioIds: z.array(z.string())` (drop `min(1)`) + `grupoIds: z.array(z.string()).default([])` + superRefine requiring `socioIds.length || grupoIds.length` → "Seleccione al menos un socio o grupo".
- Live union count: `calcularSociosObjetivo(socios, selectedSocioIds, selectedGrupoIds)` (dedup client-known members — `grupoPrimarioId` OR `s.grupos` additional membership — ∪ selectedSocios); button `Crear Multas ({n} socios)`; when any group selected show copy "Se aplicará a todos los socios del grupo al momento de la creación" (point-in-time semantics). Client hint is best-effort display-only; server re-resolves via `sociosPorGrupos` (D35).
- `handleCreate` (lines 79–102): replace raw `fetch('/api/multas/bulk')` with `await createMultasBulk({ socioIds, grupoIds, concepto, monto, actividadId })` in try/catch alerting `(e as Error).message`.
- **Files**: `apps/web/src/routes/multas.tsx`.
- **Verification**: `pnpm typecheck` (web) + `pnpm build` (web); T7.1 grep proves no `fetch('/api/multas/bulk')` remains; manual smoke (payments scenarios 9–13: MultiSelects render, filter-as-you-type, group copy + union count, deduped charge set).
- **Depends on**: T4.1 (D31 MultiSelect already shipped in repo). **Slice B**.

### T5.2 [web] `apps/web/src/routes/multas.tsx` — listar tab pagination wiring (D37/D38)

- [x] Replace the listar effect (lines 64–77): on `[tab, filters, setMultasPage]` (deps MUST exclude the page field — loop guard) call `setMultasPage(1, hasFilters ? mapped filters : undefined)`; empty-state renders off `multasTotal === 0` (NOT `items.length === 0`) so beyond-range pages don't show "No hay ... registrados"; render `<Pagination page={multasPage} total={multasTotal} pageSize={multasPageSize} onPageChange={(p) => setMultasPage(p, currentFilters)} />` below the tables/cards.
- **Files**: `apps/web/src/routes/multas.tsx`.
- **Verification**: `pnpm typecheck` (web); manual smoke (pagination scenario 14 — filter change resets to page 1; page change does not re-trigger the effect).
- **Depends on**: T4.1 (setMultasPage), T3.1 (component). **Slice C**.

### T5.3 [web] `apps/web/src/routes/aportes.tsx` — pagar tab pagination wiring (D37/D38)

- [x] Replace the pagar effect (lines 195–209): `setAporteRegistrosPage(1, hasFilters ? mapped filters : undefined)` on `[tab, filters, setAporteRegistrosPage]` (no page dep); empty-state on `aporteRegistrosTotal === 0`; render `Pagination` below tables/cards with `setAporteRegistrosPage(p, currentFilters)`.
- **Files**: `apps/web/src/routes/aportes.tsx`.
- **Verification**: `pnpm typecheck` (web); manual smoke (reset-on-filter on the pagar tab).
- **Depends on**: T4.2, T3.1. **Slice C**.

## Phase 6: Tests [Slice A + D]

### T6.1 [test] NEW `packages/api/test/multas.test.ts` (D40) — RED-first

- [x] **Bulk `grupoIds` matrix** (payments scenarios 1–8): `[g1]` with s1 primary + s2 additional → `201 { count: 2 }`, one multa each with concepto/monto; socio in group AND in `socioIds` → charged once (`{ count: 2 }` from socioIds [s1,s2] ∪ g1 containing s1); empty group contributes nothing (count 1); group member whose estado does not permit `multas` excluded (count 1); NO retrocharge — add s9 to g1 AFTER creation → no multa for s9 and NO `multa_grupos` row (assert multas row count unchanged via `filas()`); unknown `grupoId` → 400 + nothing created; non-array `grupoIds` → 400; absent `grupoIds` = regression (non-permitted s2 excluded → count 1); group path all-excluded → 400 with exact `'Ningún socio puede participar en esta acción en su estado actual'`.
- [x] **Multas envelope matrix** (pagination scenarios 1, 3, 4, 5, 7, 8, 9): default → `{ items: [25], total: N, page: 1, pageSize: 25 }`; `pageSize=500` → clamped echo 100 ≤100 items; `page=9` beyond range → `items: []`, `total` kept, page echoed 9; empty list → `{ items: [], total: 0, page: 1, pageSize: 25 }`; deterministic ordering — 60 multas via 3 bulks with distinct `fecha` → page 1 = 25 newest, union of 3 pages = all 60 no dupes/gaps, same-`fechaGen` ordered `id DESC` (raw-SQL `filas('SELECT ... ORDER BY fecha_gen DESC, id DESC')` cross-check); `estado=anulado` on 40 multas with 10 anuladas → `{ items: [10], total: 10 }`; regression: `estado=anulado` returns only anuladas; combined `grupoId` + `estadoId` → subset + total.
- [x] Seed via `crearSocio({ grupoPrimarioId })` / `crearGrupo` + raw `socio_grupos` inserts for additional membership (pattern from `socios-aportes.test.ts`); `helpers.ts` `limpiarDatos()` already deletes `multas` and re-seeds groups.
- [x] **Files**: `packages/api/test/multas.test.ts` (NEW).
- [x] **Verification**: `pnpm test` (api) — write the failing scenarios BEFORE the T2.1/T2.3 GREEN changes (RED), suite finalized green with them.
- [x] **Depends on**: T2.1, T2.3 (RED authored before them). **Slice A**.

### T6.2 [test] `packages/api/test/aportes-generacion.test.ts` — GET /aportes pagination describe (D40)

- [x] New `describe('GET /api/aportes — paginación')`: default → `{ items: [25], total: 60, page: 1, pageSize: 25 }` (5 socios × 12 mensual); ordering `gestion DESC, mes DESC, id DESC` (page 1 = mes 12 first, same-mes `id DESC`); `pageSize=500` → clamp 100 (pagination scenario 2); `page=abc&pageSize=-5` → defaults 1/25 (scenario 6); `?mes=5` → `total: 5`; combined `?gestion=<currentYear>&mes=12`; beyond-range page → `items: []` + total kept.
- [x] **Files**: `packages/api/test/aportes-generacion.test.ts`.
- [x] **Verification**: `pnpm test` (api) — new describe green; existing 5 suites untouched by the envelope (D39 verified zero GET-`/` consumers).
- [x] **Depends on**: T2.2. **Slice A**.

### T6.3 [test/polish] Slice D — edge cases, a11y, copy, regression (D40 polish)

- [x] Edge-case pass: empty-state on `total === 0` (both routes), last-page overflow, beyond-range page rendering, single-page both-disabled controls (defer hiding when `totalPages === 1` — pending design open question).
- [x] A11y pass on `Pagination` (Tab focus, Enter/Space activation, `aria-live` page info) and the create-form MultiSelects (reuses D31 ARIA).
- [x] Copy review: point-in-time wording on the create form; empty-state strings.
- [x] Full regression: `pnpm test` (root) — all 6 existing api suites pass untouched (aporte-definicion, aportes-bulk-all-pagos, aporte-dedup, aportes-generacion, socios-aportes, grupos).
- [x] Manual dev-server smoke checklist: Pagination below both lists (prev disabled page 1, next disabled last, total 0 → none, keyboard), MultiSelects filter-as-you-type + chips + group copy + union count, bulk-with-group create shows toast/refresh, filter change resets to page 1. (DEFERRED to post-verify: no browser/e2e harness in this environment — checklist documented in apply-progress.)
- [x] **Files**: `apps/web/src/routes/multas.tsx`, `apps/web/src/routes/aportes.tsx`, `packages/ui/src/components/pagination.tsx` (polish edits); regression run over `packages/api/test/*`.
- [x] **Verification**: `pnpm test` (root) + `pnpm typecheck` + dev-server smoke.
- [x] **Depends on**: T3.1, T5.1–T5.3. **Slice D**.

## Phase 7: Verification [Slice D]

### T7.1 [all] Final verification gate

- [x] `pnpm test` (root — all workspaces green, 6 existing suites untouched + new multas suite).
- [x] `pnpm typecheck` (core, api, ui, web — or `pnpm nx run-many -t typecheck` per repo convention).
- [x] `pnpm build` (web) compiles; `Pagination` import resolves from `@otb/ui`.
- [x] Grep gate: NO `fetch('/api/multas/bulk')` (or raw `fetch('/api/multas')`/`fetch('/api/aportes')`) remains in `apps/web/src/routes/multas.tsx`/`aportes.tsx` (payments scenario 13).
- [x] Manual dev-server smoke of every UI scenario (T6.3 checklist) if harness available. (DEFERRED — no harness in this environment.)
- [x] **Depends on**: all prior tasks. **Slice D**.
- [x] **Verification**: exit code 0 for every command; `git status` shows only intended files.

---

## Scenario Coverage Traceability (29/29)

| Spec scenario | Task(s) |
|---|---|
| **payments** | |
| Bulk with grupoIds creates one multa per current member | T2.3, T6.1 |
| A socio in a selected grupo AND in direct socioIds is charged once | T2.3 (dedup union), T6.1 |
| A group with zero members contributes no multas | T2.3, T6.1 |
| Group members whose estado does not permit "multas" are excluded | T2.3 (permit filter), T6.1 |
| A socio joining the group after creation is NOT retrocharged | T2.3 (point-in-time), T6.1 |
| Unknown grupoId is rejected | T2.3 (D36), T6.1 |
| Bulk without grupoIds behaves exactly as today (regression) | T2.3 (backward compat), T6.1 |
| Group path where all members are excluded returns the existing 400 | T2.3 (reused check), T6.1 |
| Create form renders MultiSelects instead of the checkbox scrollbox | T5.1 (D41) |
| Filter-as-you-type narrows the socio and grupo options | T5.1 (D31 reused) |
| Selecting a grupo shows that its current members will be charged | T5.1 (union count + copy) |
| A socio selected directly AND via a grupo appears once in the charge set | T5.1 (client dedup; server side T6.1) |
| Submitting the create form calls the store action, not a raw fetch | T4.1, T5.1, T7.1 (grep) |
| Store action surfaces API errors as friendly messages | T4.1 (ApiError surfacing) |
| **pagination** | |
| Default request returns the first page with a total | T2.1, T6.1 |
| pageSize over the cap is clamped to 100 | T2.2, T6.2 (aportes as written; T6.1 mirrors for multas) |
| A page beyond the range returns empty items while keeping the total | T2.1, T6.1 |
| An empty list returns total=0 with an empty page | T2.1, T6.1 |
| Ordering is deterministic across pages (no duplicates/gaps) | T2.1 (D34), T6.1 (60-multas union) |
| Invalid page/pageSize values fall back to defaults | T2.2, T6.2 |
| A filtered list paginates correctly with a filtered total | T2.1 (WHERE before LIMIT), T6.1 |
| estado=anulado filter still returns only anuladas (regression) | T2.1, T6.1 |
| Combined filters (grupoId + estadoId) paginate correctly | T2.1 (COUNT mirrors joins), T6.1 |
| Component renders and drives page changes | T3.1 (D37), T6.3 manual |
| Boundary pages disable the appropriate control | T3.1, T6.3 manual |
| Empty list renders no pagination controls | T3.1 (total 0 → null), T6.3 manual |
| Page change updates the store and refetches | T4.1 (setMultasPage), T5.2 |
| A filter change resets the page to 1 | T4.1, T5.2 (deps exclude page) |
| The envelope is unpacked into items + total | T4.1/T4.2 (envelope unpack) |

---

## Dependency Ordering

- **Within Slice A**: T1.1 (core types) → T1.2 + T1.3 (lib, parallel) → T2.1/T2.2 (need T1.1+T1.2), T2.3 (needs T1.1+T1.3) → T6.1 (RED before T2.1/T2.3 GREEN; finalized after), T6.2 (after T2.2). TDD: author failing suite cases first, then the route change.
- **Slice B (after A)**: T4.1 (needs T2.1+T2.3 envelope/bulk) → T5.1 (needs T4.1). B is the first web slice; its store unpack is what keeps the multas list functional post-envelope.
- **Slice C (after B)**: T3.1 (independent, can parallel-build) → T4.2 (needs T2.2) → T5.2 (needs T4.1 + T3.1), T5.3 (needs T4.2 + T3.1). Cross-slice dependency: T5.2 uses `setMultasPage` from B — C's multas listar-tab rendering is deliberately in C so B never renders an unshipped component.
- **Slice D (after C)**: T6.3 → T7.1 (final gate).
- **Stack constraint**: A changes both GET shapes — B and C MUST merge promptly after A (stacked-to-main) so main never leaves the web lists runtime-broken; D is pure polish and can lag.
