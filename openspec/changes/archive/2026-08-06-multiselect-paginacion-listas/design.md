# Design: Searchable MultiSelect for Multas + Pagination of Growing Lists (multiselect-paginacion-listas)

## Context

The archived `aporte-multigrupo-multiselect` change (implemented and verified) shipped the searchable MultiSelect (D31) and the M:N group-application model (D23–D30) with decisions D12–D32 standing. This change applies the same two patterns to the two places the user identified:

1. **Multas creation** (`apps/web/src/routes/multas.tsx`) still uses a checkbox scrollbox (lines 163–177), can only charge DIRECTLY selected socios, and bypasses the store with a raw `fetch('/api/multas/bulk')` (line 81). It cannot charge whole groups, so an admin fining a group (e.g. a grupo that skipped an activity) must hand-pick every socio.
2. **List endpoints that grow** — `GET /api/multas` (multas.ts:8–39) and `GET /api/aportes` (aportes.ts:31–63) — return BARE ARRAYS with no limit/offset, no total, no deterministic ORDER BY. There are no pagination primitives anywhere in the codebase (no `Paginated<T>`, no `Pagination` component, no store page state). Multas grow per batch; aportes = 222 cobros growing ~200+/yr (exploration).

The specs (deltas for `payments` and the new `pagination` capability) encode the accepted product decisions. This design turns them into concrete architecture decisions D33–D41 that continue the archived D-numbering (archived used D12–D32).

## Goals

- **G1** — `POST /api/multas/bulk` accepts optional `grupoIds?: string[]`; the target set becomes the deduped UNION of direct `socioIds` and the CURRENT members (primario OR adicional membership) of ALL `grupoIds`, then the existing `permite(..., 'multas')` filter applies and ONE multa per socio is materialized via the existing bulk loop. Point-in-time semantics: members at creation only; a later joiner is NOT retrocharged; NO `multa_grupos` tracking. Absent `grupoIds` → behaves exactly as today. (payments spec, Requirement 1)
- **G2** — Always-envelope `{ items, total, page, pageSize }` (option C) on `GET /api/multas` and `GET /api/aportes` with deterministic ORDER BY per list; existing filters keep working and apply BEFORE pagination; `total` = filtered count. (pagination spec, Requirements 1–2)
- **G3** — Reusable `Pagination` component in `@otb/ui` (zero-deps, D31-style) with props `{ page, total, pageSize, onPageChange }`, boundary-disabled controls, no controls when `total=0`, keyboard-accessible. (pagination spec, Requirement 3)
- **G4** — Store holds `page`/`pageSize`/`total` per list, unpacks the envelope, refetches on page change, and resets `page` to 1 on ANY filter change. (pagination spec, Requirement 4)
- **G5** — The raw `/api/multas/bulk` fetch moves into the store as `createMultasBulk` (mirrors `createAportesBulk`, surfaces API errors as friendly messages). (payments spec, Requirement 3)

## Non-Goals

- Pagination on socios (17 rows), asistencia, reportes selectors, libro diario, per-record payment modals (proposal).
- M:N `multa_grupos` tracking or retroactive group charges (rejected in exploration; point-in-time semantics chosen and now locked by the spec).
- Egresos, actividades, dashboard (dashboard.ts is self-contained aggregate SQL over tables — unaffected).
- Groups DELETE-guard changes (multas adds NO new reference to `grupos`; existing guard untouched).
- Schema changes / migrations (explicitly out: the ORDER BY does not get a new index — see D34).
- Page-size UI selector / "per-page" configurability (fixed default 25, cap 100; locked by spec).
- Other list endpoints (egresos, movimientos) — NOT enveloped.

## Technical Approach

A backend contract change + shared-UI refactor, both layered on the archived change:

1. **Core** (`packages/core/src/index.ts`): add `Paginated<T>`; `BulkMultaRequest` gains `grupoIds?: string[]`; add `BulkMultaResponse`.
2. **API lib**: NEW `lib/paginacion.ts` with the shared parse/clamp helper (`parsePaginacion`); `lib/aportes.ts` gains `sociosPorGrupos(grupoIds)` (reverse of `gruposAdicionalesPorSocio`, D35).
3. **API routes**: `multas.ts` GET / → envelope + `ORDER BY fechaGen DESC, id DESC`; POST /bulk → optional `grupoIds` validation + union target set. `aportes.ts` GET / → envelope + `ORDER BY gestion DESC, mes DESC, id DESC`.
4. **UI**: NEW `Pagination` component (D37) exported from `@otb/ui`; `multas.tsx` create tab → two MultiSelects (Socios + Grupos) + `createMultasBulk` store action; listar tab + `aportes.tsx` pagar tab → pagination wiring with page-reset-on-filter.
5. **Store** (`app.store.ts`): `page`/`pageSize`/`total` per list, envelope unpack, `setMultasPage`/`setAporteRegistrosPage`, `createMultasBulk`.
6. **Tests**: NEW `packages/api/test/multas.test.ts` (none exists today); aportes pagination coverage added to `aportes-generacion.test.ts`. The envelope change touches ZERO existing test files (verified, D39).

## Architecture Decisions

### Retained from the archived design (unchanged)

| # | Decision | Status in this change |
|---|----------|----------------------|
| D1–D11, D23–D30 | Aporte definition model, dedup invariant (D13), server UUIDs (D14), permission enforcement via `cargarPermisosPorEstado`/`permite`, M:N join model, MultiSelect contract | Retained as-is |
| D31 | MultiSelect component (`packages/ui/src/components/multi-select.tsx`, zero deps, chips + filter + keyboard + ARIA) | **Reused verbatim** for the multas create form (Socios AND Grupos) |
| D32 | Two-MultiSelect composition pattern in `aportes.tsx` with `selectedSocioIds`/`selectedGrupoIds` state | Mirrored in `multas.tsx` |

### Decision: Shared paginated envelope contract + parse/clamp helper (D33)

**Choice**: Both list routes ALWAYS respond with `{ items, total, page, pageSize }` (option C — never a bare array, never conditional). Core gains:

```ts
// ── packages/core/src/index.ts (deltas only) ──────────────────────────────
/** Envelope paginado compartido (D33) — GET /api/multas y GET /api/aportes. */
export type Paginated<T> = {
  items: T[];
  total: number;   // COUNT de TODAS las filas que matchean los filtros (antes de paginar)
  page: number;    // echo del page efectivo
  pageSize: number; // echo del pageSize efectivo (clamped)
};
```

NEW shared helper `packages/api/src/lib/paginacion.ts` (Spanish naming matches `validarGestionMes`, `cargarPermisosPorEstado`):

```ts
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** page/pageSize query → { page, pageSize } efectivos (D33). */
export function parsePaginacion(query: { page?: string; pageSize?: string }): { page: number; pageSize: number } {
  const page = Number(query.page);
  const pageSize = Number(query.pageSize);
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize:
      Number.isInteger(pageSize) && pageSize >= 1
        ? Math.min(pageSize, MAX_PAGE_SIZE)   // cap 100; 150 → 100
        : DEFAULT_PAGE_SIZE,                  // 0, negativos, NaN → 25
  };
}
```

Route shape (both routes, identical pattern):

```ts
const { page, pageSize } = parsePaginacion(c.req.query());
const where = filters.length ? and(...filters) : undefined;          // filtros ANTES de paginar
const total = db.select({ n: sql<number>`count(*)` })
  .from(schema.multas)
  .leftJoin(schema.socios, eq(schema.multas.socioId, schema.socios.id))
  .where(where)                                                       // mismo FROM+joins+WHERE (estadoId/grupoId filtran sobre socios)
  .get();
const items = baseQuery.where(where)
  .orderBy(desc(schema.multas.fechaGen), desc(schema.multas.id))
  .limit(pageSize).offset((page - 1) * pageSize)
  .all();
return c.json({ items, total: Number(total?.n ?? 0), page, pageSize });
```

The COUNT query MUST mirror the same FROM + LEFT JOIN + filters (the existing `estadoId` and `grupoId` filters reference `schema.socios` — a count without the join would fail). `drizzle-orm` accepts `.where(undefined)` as a no-op, so a single `where` const works for both queries.

**Behavior contract** (from the pagination spec): `page` default 1, `pageSize` default 25 cap 100; non-numeric / out-of-range values fall back to defaults; `pageSize` larger than 100 is CLAMPED (echo shows 100); a page beyond range returns `items: []` while keeping `total` and ECHOING the requested page (no page clamping — spec scenario "A page beyond the range returns empty items"); empty list → `{ items: [], total: 0, page: 1, pageSize: 25 }`.

**Alternatives considered**: (a) bare-array when no `limit` given (C′ only-when-`limit`) — rejected: all consumers are in-repo and updated in the same change (D39); the conditional shape would permanently complicate the store unpacking; (b) `{ data, meta }` nesting — rejected: flatter envelope matches the codebase's direct-response style (e.g. `{ definiciones, generados }`). **Rationale**: option C is locked by the proposal/specs; the helper guarantees identical clamping semantics on both routes without duplication, and the count + page query share one WHERE builder.

### Decision: Deterministic ORDER BY with unique tiebreak (D34)

**Choice**:

- `GET /api/multas` → `ORDER BY multas.fecha_gen DESC, multas.id DESC`. `fechaGen` is `text` `YYYY-MM-DD` (lexicographic = chronological, `notNull` — multas.ts schema); `id` is the PK.
- `GET /api/aportes` → `ORDER BY aportes.gestion DESC, aportes.mes DESC, aportes.id DESC`. `gestion`/`mes` are `integer` (nullable columns — SQLite sorts NULLs LAST in DESC, deterministic).

Both orderings terminate in `id` (server UUID, unique per row), so the composite key is a strict total order over the result set: within a single fetch pair, no two rows can tie → no duplicates/gaps across pages (spec scenario "Ordering is deterministic across pages"). The `id` tiebreak also makes the order stable when new rows are inserted between two fetches (existing rows keep their relative order; only page membership shifts at the boundary).

**Index note**: no index serves these orderings today (multas has only the PK; aportes has the partial `aporte_dedup_unico` on `(socio_id, aporte_id, mes, gestion)` which is orthogonal). SQLite will sort (full scan + temp sort). This is DELIBERATE: the proposal's Non-Goals exclude schema changes/migrations, and both tables are small (multas: per-batch tens–hundreds; aportes: ~222 + ~200/yr) — a temp sort at this scale is negligible. If multas ever reaches tens of thousands, add an additive index `(fecha_gen, id)` in a future change.

**Alternatives considered**: ordering by `rowid` (insertion order) — rejected (does not match business recency semantics: fines/cobros must show newest first); `fechaGen DESC` alone — rejected (not a total order — same-date rows would flip between pages); descending only, no tiebreak — same as previous. **Rationale**: (recency key, PK) is the minimal deterministic ordering that satisfies "no duplicates/gaps" and matches what an admin expects (newest first).

### Decision: Group-member union helper `sociosPorGrupos` (D35)

**Choice**: add to `packages/api/src/lib/aportes.ts` (where `gruposAdicionalesPorSocio` already lives — the proposal explicitly says "Shared helper extracted from `lib/aportes.ts`"), as the reverse direction of the existing socio→groups batch helper:

```ts
/**
 * Miembros ACTUALES de los grupos dados (D35): unión DEDUPADA de los socios con
 * `grupoPrimarioId ∈ grupoIds` O membresía en `socio_grupos` con `grupoId ∈ grupoIds`.
 * 2 queries batch (socios primarios + join de adicionales), sin N+1. Semántica
 * POINT-IN-TIME: se resuelve en el momento de la llamada (un socio que ingresa
 * al grupo DESPUÉS no es retrocargado — el call site materializa al crear).
 */
export function sociosPorGrupos(grupoIds: string[]): Set<string> {
  const ids = new Set<string>();
  if (grupoIds.length === 0) return ids;
  const primarios = db
    .select({ id: schema.socios.id })
    .from(schema.socios)
    .where(inArray(schema.socios.grupoPrimarioId, grupoIds))
    .all();
  for (const p of primarios) ids.add(p.id);
  const adicionales = db
    .select({ socioId: schema.socioGrupos.socioId })
    .from(schema.socioGrupos)
    .where(inArray(schema.socioGrupos.grupoId, grupoIds))
    .all();
  for (const m of adicionales) ids.add(m.socioId);
  return ids;
}
```

The multas route resolves the target set as:

```ts
const targetIds = [...new Set([...(body.socioIds ?? []), ...sociosPorGrupos(grupoIds)])];
```

then feeds the EXISTING permission filter unchanged (`cargarPermisosPorEstado()` + `permite(permisos, s.estadoId, 'multas')` — multas.ts:53–59) and the EXISTING bulk transaction loop (multas.ts:65–82). No new permission code; no new insert path. The `Set` gives O(1) socio-dedup across overlapping groups and direct selection (spec scenarios "dedup on the union", "charged once").

**Alternatives considered**: a new `packages/api/src/lib/grupos.ts` — rejected: `lib/aportes.ts` already holds the generic membership helpers (`gruposAdicionalesPorSocio`, `grupoIdsPorDefinicion`), the proposal names `lib/aportes.ts` explicitly, and the pair (socio→grupos / grupos→socios) stays cohesive; extracting later is trivial if a third consumer appears. A SQL `UNION` query — rejected: two batch queries + in-memory Set matches the established N+1-free batch pattern and keeps Drizzle typing simple. **Rationale**: the helper is the exact inverse of `gruposAdicionalesPorSocio`; reusing the primario-OR-adicional definition keeps multas-group semantics identical to how aportes already resolves group membership.

### Decision: /bulk `grupoIds` validation + error cases (D36)

**Choice**: `POST /api/multas/bulk` validation, in order, ALL before any insert:

1. Required fields: `concepto` and `monto` (unchanged). The `socioIds` requirement becomes conditional: **`socioIds` (non-empty) OR `grupoIds` (non-empty) required** — i.e. `if ((!body.socioIds?.length && !body.grupoIds?.length) || !body.concepto || !body.monto) return 400 { error: 'socioIds (array), concepto, and monto are required' }` (message text unchanged; an absent/empty `grupoIds` keeps `socioIds` required — backward compat).
2. `grupoIds` shape: when present, MUST be an array → else `400 { error: 'grupoIds must be an array' }` (mirrors `validarSocioIds`'s `'...must be an array'` style).
3. `grupoIds` existence: EVERY id MUST exist in `grupos` → else `400 { error: 'grupoIds contains an invalid group' }` BEFORE any insert (D18 pattern from the archived change).
4. Target set: `targetIds = dedup(socioIds ?? [] ∪ sociosPorGrupos(grupoIds))` (D35).
5. Empty/fully-excluded target: the EXISTING `permitidos.length === 0` check (multas.ts:61–63) returns `400 { error: 'Ningún socio puede participar en esta acción en su estado actual' }` — REUSED verbatim for the group path (spec scenario "Group path where all members are excluded returns the existing 400"). An empty group (zero members, no direct socios) falls here too — consistent, no new message.
6. Materialize ONE multa per permitted socio through the existing `db.transaction` loop; respond `201 { count, items }` (unchanged shape/status).

`grupoIds: []` (present but empty) contributes zero members and behaves like absent — acceptable and simplest; the spec only pins "absent = exactly as today".

**Alternatives considered**: silently skip unknown groups — rejected (spec mandates 400 + no multa created; silent skipping could charge the wrong set); resolve members AFTER the transaction — rejected (validation must precede any insert, D18 pattern). **Rationale**: the four error paths reuse the route's existing messages/statuses wherever possible — only two NEW messages (`grupoIds must be an array`, `grupoIds contains an invalid group`) enter the contract, and the 400-all-excluded message is identical to today's.

### Decision: `Pagination` component contract (D37)

**Choice**: hand-rolled `packages/ui/src/components/pagination.tsx`, exported from `packages/ui/src/index.ts` as `Pagination`. Zero new dependencies (lucide-react `ChevronLeft`/`ChevronRight` — the kit already depends on lucide-react, D31 uses `X`). Contract:

```ts
// ── packages/ui/src/components/pagination.tsx (D37) ────────────────────────
export type PaginationProps = {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};
export const Pagination: React.FC<PaginationProps>;   // exportada desde packages/ui/src/index.ts
```

Rendering rules:
- `totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))`.
- **`total === 0` → render `null`** (spec: "NO pagination controls SHALL render").
- Previous control: native `<button type="button">`, `disabled={page <= 1}`, label "Anterior" + `ChevronLeft`, `aria-label="Página anterior"`.
- Next control: native button, `disabled={page >= totalPages}`, label "Siguiente" + `ChevronRight`, `aria-label="Página siguiente"`.
- Page info text: `Página {page} de {totalPages}` (spec example), `aria-live="polite"` for screen-reader updates on page change.
- Keyboard: native buttons are Tab-focusable and Enter/Space-activate — no custom key handling needed; use the real `disabled` attribute (not `aria-disabled`) so focus skips disabled controls.
- Styling: same visual language as the rest of the UI kit (`border border-gray-300 rounded-md px-3 py-1.5 text-sm`, enabled = `text-gray-700 hover:bg-gray-50`, disabled = `text-gray-300 cursor-not-allowed`), `flex items-center justify-end gap-2` row, `mt-4`.
- Single-page lists (total > 0, page 1 = last): both controls render disabled — spec-minimum; hiding single-page controls is deferred to Slice D polish.

**Alternatives considered**: third-party pagination (react-paginate/headlessui) — rejected (no deps in the lockfile; OTB scale is prev/next + info, no page-number ellipsis needed; matches the hand-rolled MultiSelect precedent); a page-number button row — rejected (spec defines only prev/next + info). **Rationale**: D31 proved the zero-dep hand-rolled pattern; the contract is deliberately minimal (4 props, controlled) so both lists use it identically.

### Decision: Store state shape, envelope unpack, reset-on-filter (D38)

**Choice**: per-list pagination state in `apps/web/src/stores/app.store.ts`, naming aligned with the existing `multasLoading`/`aporteRegistrosLoading`:

```ts
// multas list
multas: Multa[];
multasTotal: number;       // ← envelope.total
multasPage: number;        // ← envelope.page (default 1)
multasPageSize: number;    // ← envelope.pageSize (default 25)
multasLoading: boolean;
multasError: string | null;
fetchMultas: (filters?: MultaFilters, page?: number) => Promise<void>;
setMultasPage: (page: number, filters?: MultaFilters) => Promise<void>;
createMultasBulk: (payload: BulkMultaRequest) => Promise<BulkMultaResponse>;

// aporte registros list
aporteRegistros: AporteRegistro[];
aporteRegistrosTotal: number;
aporteRegistrosPage: number;
aporteRegistrosPageSize: number;
aporteRegistrosLoading: boolean;
aporteRegistrosError: string | null;
fetchAporteRegistros: (filters?: AporteFilters, page?: number) => Promise<void>;
setAporteRegistrosPage: (page: number, filters?: AporteFilters) => Promise<void>;
```

- `fetchMultas(filters?, page?)` — the existing param builder (store lines 282–300) additionally sets `page`/`pageSize` when the page arg is passed OR when `get().multasPage !== 1 || get().multasPageSize !== DEFAULT`; simplest: ALWAYS append `page` (`page ?? get().multasPage`) and `pageSize` (`get().multasPageSize`). Response type becomes `Paginated<Multa>`; unpack: `set({ multas: data.items, multasTotal: data.total, multasPage: data.page, multasPageSize: data.pageSize, multasLoading: false })`. Same for `fetchAporteRegistros` with `Paginated<AporteRegistro>`.
- `setMultasPage(page, filters)` — `set({ multasPage: page })` then `return get().fetchMultas(filters, page)`. **This single action serves BOTH the page-change AND the filter-change reset** (see wiring below), which is what prevents a reset/fetch loop.
- `createMultasBulk(payload)` — mirrors `createAportesBulk` (store 531–536): `request<BulkMultaResponse>('/multas/bulk', { method: 'POST', body: JSON.stringify(payload) })`, then `await get().fetchMultas(undefined, 1)` (refresh the list, first page, unfiltered — parity with today's post-create `fetchMultas()`). Errors: the shared `request` helper throws `ApiError` carrying the API's message (e.g. `"Ningún socio puede participar en esta acción en su estado actual"`) — the route's try/catch alerts `e.message` (friendly, spec Requirement 3 scenario "surfaces API errors").

**Reset-on-filter wiring** (both routes): the existing list effects (multas.tsx:64–77, aportes.tsx:195–209) currently call `fetchMultas(filters)`/`fetchAporteRegistros(filters)` on `[tab, filters]`. They change to call the page action with page 1:

```tsx
useEffect(() => {
  if (tab !== 'listar') return;
  const hasFilters = /* existing boolean */;
  setMultasPage(1, hasFilters ? { ...filters mapped } : undefined);
}, [tab, filters, setMultasPage]);
```

Because `setMultasPage` only mutates `multasPage` and the effect deps contain `filters`/`tab` (NOT `multasPage`), a filter change resets to page 1 and refetches; a `onPageChange(p)` call passes the CURRENT filter object unchanged → `filters` identity stable → the effect does NOT re-fire → no loop. This satisfies spec scenarios "A filter change resets the page to 1" and "Page change updates the store and refetches".

**Correction to the proposal**: "list filter types gain page/pageSize" does NOT apply — `MultaFilters`/`AporteFilters` are store-LOCAL types (app.store.ts:54–74) and `page`/`pageSize` are separate query params, NOT filter fields. No core filter type exists to change; the executor must NOT add `page`/`pageSize` to the filter objects.

**Alternatives considered**: page state owned by the route component (local useState) — rejected (store owns list data + fetch; page must survive tab switches, and the store already owns every other list parameter); a generic `usePagination` hook — rejected (two consumers, three lines each; a hook adds indirection without payoff). **Rationale**: the explicit-arg fetch signature + single setPage action keeps the store the single source of truth for list state and makes reset semantics trivially testable.

### Decision: Backward-compat analysis of the envelope change (D39)

**Choice**: enumerate EVERY in-repo consumer of the two GET endpoints (verified by grep on Aug 2026):

| Endpoint | Consumer | Where | Impact |
|----------|----------|-------|--------|
| `GET /api/multas` | `fetchMultas` store action | `app.store.ts:295` (`request<Multa[]>(`/multas${qs}`)`) | Updated in this change (D38) |
| `GET /api/multas` | `multas.tsx` listar effect | route line 67 (`fetchMultas(filters)`) | Updated via store signature (D38) |
| `GET /api/multas` | `multas.tsx` post-create refresh | route line 96 (`await fetchMultas()`) | Replaced by `createMultasBulk`'s internal refresh |
| `GET /api/aportes` | `fetchAporteRegistros` store action | `app.store.ts:262` (`request<AporteRegistro[]>(`/aportes${qs}`)`) | Updated in this change (D38) |
| `GET /api/aportes` | `aportes.tsx` pagar effect | route line 198 | Updated via store signature (D38) |
| `GET /api/aportes` | definition create/edit refresh | `aportes.tsx:286, 293` (`void fetchAporteRegistros()`) | No-arg call still valid (page defaults to store state) |
| `GET /api/aportes` | socio save refresh | `app.store.ts:222, 229` (`void get().fetchAporteRegistros()`) | No-arg call still valid |
| Tests | — | `packages/api/test/*` — verified NO suite calls `requestJson('/api/multas'...)` or `requestJson('/api/aportes'...)` as GET (all `/api/aportes` hits are POST `/`, `/bulk`, `/bulk/all`, `/:id/pagar`, `/:id/anular`, `/:id/pagos`; multas has no suite at all) | **Zero test churn from the envelope** |
| Dashboard / reportes | — | `dashboard.ts` + `reportes.ts` query `schema.multas`/`schema.aportes` TABLES directly (aggregate SQL) — they never call the GET / routes | Unaffected |
| Other apps | — | `apps/desktop` and `apps/mobile` contain no consumers (grep: 0 matches); no legacy `js/` folder exists | Unaffected |

**Conclusion**: exactly TWO in-repo consumers (both store actions), both updated in the same change → always-envelope (option C) is safe. There is NO external consumer and NO test that asserts the bare-array shape. The only residual risk is a future consumer written against the old shape — mitigated by the type (`Paginated<T>`) and the new suite.

### Decision: Test strategy (D40)

**Choice**: the NEW suite `packages/api/test/multas.test.ts` covers the bulk-with-`grupoIds` matrix (payments spec scenarios 1–8) AND the multas envelope matrix (pagination spec scenarios); aportes envelope coverage is added to the EXISTING `aportes-generacion.test.ts` (it already creates records; the pagination spec scenarios are endpoint-agnostic and the aportes suite is the natural home). Envelope impact on the other 5 suites: NONE (D39 verified zero GET-`/` consumers). Full matrix in the Test plan section.

**Alternatives considered**: one shared pagination describe file for both endpoints — rejected (the repo organizes suites by domain route; adding a `GET /api/aportes` describe to an existing aportes suite keeps that convention); store/UI component tests — rejected (no test infra exists in `apps/web`/`packages/ui`; only `packages/api/test` exists in the vitest workspace — the archived change relied on manual smoke for UI, and this one does too). **Rationale**: the suite split mirrors the repo's per-route test organization and keeps the envelope contract verified twice (once per endpoint) exactly where the endpoints live.

### Decision: Multas create form — MultiSelects, union live-count, store action (D41)

**Choice**: `apps/web/src/routes/multas.tsx` create tab (mirrors D32):

1. Replace the checkbox scrollbox (lines 163–177) with a **Socios** MultiSelect: options = the existing `permitidos` filter (socios whose estado permits `multas` — line 127–129, unchanged). Add a **Grupos** MultiSelect: options = `grupos` (from the store). Component state `selectedGrupoIds: string[]` replaces nothing (new); `createForm.watch('socioIds')` stays as the socio selection (MultiSelect is controlled via `createForm.setValue('socioIds', ...)` — same pattern as the existing `toggleSocio`).
2. Zod schema: `socioIds: z.array(z.string())` (drop `min(1)`) + `grupoIds: z.array(z.string()).default([])`; add a superRefine requiring `socioIds.length || grupoIds.length` with message "Seleccione al menos un socio o grupo".
3. Live target count + copy: local helper `calcularSociosObjetivo(socios, selectedSocioIds, selectedGrupoIds)` computing the deduped union the CLIENT knows (socios with `grupoPrimarioId ∈ selectedGrupoIds` OR `s.grupos` additional membership ∈ selectedGrupoIds — the `Socio.grupos` array carries additional memberships) ∪ `selectedSocioIds`. Button label: `Crear Multas ({n} socios)`; when any group is selected, show copy "Se aplicará a todos los socios del grupo al momento de la creación" (point-in-time semantics, payments spec Requirement 2 scenarios). NOTE: the client hint is a best-effort approximation of CURRENT membership; the server re-resolves authoritatively via `sociosPorGrupos` (D35).
4. `handleCreate` replaces the raw fetch (lines 79–102) with `await createMultasBulk({ socioIds, grupoIds, concepto, monto, actividadId })` in a try/catch that alerts `(e as Error).message` (the API's friendly message). No `fetch('/api/multas/bulk')` remains in the route (spec Requirement 3 scenario "NO raw fetch SHALL be called").

**Alternatives considered**: server-driven member-count endpoint for the hint — rejected (an extra request per keystroke for a hint; the client already has the memberships); keep the checkbox scrollbox and add a group select — rejected (user request + proposal WS1 is explicit: MultiSelect parity with D32). **Rationale**: D32's two-MultiSelect composition is proven in `aportes.tsx`; the union hint mirrors the server semantics with data the store already holds.

## Data Flow

```
1) MULTAS CREATE (POST /api/multas/bulk — D36)
   body { socioIds?, grupoIds?, concepto, monto, actividadId?, fecha? }
     │  socioIds requerido SOLO si grupoIds ausente/vacío (400 si ninguno)
     │  grupoIds: array + cada id existe en grupos (400 antes de insertar)
     ▼
   targetIds = dedup( socioIds ?? []  ∪  sociosPorGrupos(grupoIds) )        [D35: primario OR adicional, Set]
     ▼
   permitidos = filter(socios, permite(permisos, estadoId, 'multas'))       [EXISTENTE, sin cambios]
     ▼  permitidos vacío → 400 'Ningún socio puede participar...' (REUTILIZADO)
   tx: por cada socio → 1 multa (loop EXISTENTE multas.ts:65-82)
   └ 201 { count, items }                                                    [shape/status SIN cambios]

2) LIST READ (GET /api/multas y GET /api/aportes — D33/D34)
   query { ...filtros, page?, pageSize? }
     │  parsePaginacion → { page, pageSize } (defaults 1/25, cap 100)
     ▼
   where = and(filtros)                                   [filtros ANTES de paginar]
   total = SELECT count(*) ... mismo FROM+joins+WHERE     [filtrado]
   items = SELECT ... ORDER BY <clave recencia> DESC, id DESC  LIMIT pageSize OFFSET (page-1)*pageSize
   └ 200 { items, total, page, pageSize }                 [SIEMPRE envelope, opción C]

3) UI → STORE → API (D38)
   filter change ──► setMultasPage(1, filters) ──► fetchMultas(filters, 1) ──► GET ?page=1&pageSize=25&filtros
   onPageChange(p) ► setMultasPage(p, filters) ──► fetchMultas(filters, p) ──► GET ?page=p&pageSize=25&filtros
        │ (effect deps = [tab, filters] — NO incluye page → sin loop)
        ▼
   envelope unpack: items→multas, total→multasTotal, page→multasPage, pageSize→multasPageSize
   Pagination(page=multasPage, total=multasTotal, pageSize=multasPageSize, onPageChange)
```

## API Contract Changes

**Before → After** (exact shapes):

```text
GET /api/multas?<filtros>
  ANTES:  200 [ { id, socioId, socioNombre, socioApellido, actividadId, concepto, monto,
                  montoPagado, saldoPendiente, razonAnulacion, fechaGen, fechaPago, estado }, ... ]
  DESPUÉS: 200 { items: [ ...mismos rows... ], total, page, pageSize }
           // + query params page?, pageSize? (defaults 1/25, cap 100, clamp/fallback per D33)
           // + ORDER BY fecha_gen DESC, id DESC (D34)

GET /api/aportes?<filtros>
  ANTES:  200 [ { ...AporteRegistro, socioNombre, socioApellido }, ... ]
  DESPUÉS: 200 { items: [ ...mismos rows... ], total, page, pageSize }
           // ORDER BY gestion DESC, mes DESC, id DESC (D34)

POST /api/multas/bulk
  ANTES:  body { socioIds: string[], concepto, monto, actividadId?, fecha? }   // socioIds REQUERIDO
  DESPUÉS: body { socioIds?: string[], grupoIds?: string[], concepto, monto, actividadId?, fecha? }
           // socioIds requerido SOLO si grupoIds ausente/vacío
           // grupoIds: array; cada id DEBE existir → 400 'grupoIds contains an invalid group'
           // no-array → 400 'grupoIds must be an array'
           // target = dedup(socioIds ∪ miembros ACTUALES de todos los grupoIds), permit-filter,
           // una multa por socio, semántica point-in-time, sin tabla M:N
  RESPONSE: 201 { count, items }  // SIN cambios — retrocompatible cuando grupoIds ausente
```

Core type deltas:

```ts
// packages/core/src/index.ts
export type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number };
export type BulkMultaRequest = {
  socioIds?: string[];        // era string[] requerido — opcional con grupoIds
  grupoIds?: string[];        // NUEVO — opcional; [] = sin aporte de grupos
  concepto: string;
  monto: number;
  actividadId?: string;
  fecha?: string;
};
export type BulkMultaResponse = { count: number; items: Multa[] };   // NUEVO (type de la respuesta 201)
```

## Component Contract — `Pagination`

```ts
// packages/ui/src/components/pagination.tsx — exportada desde packages/ui/src/index.ts (D37)
export type PaginationProps = {
  page: number;             // página actual (1-based)
  total: number;            // total de filas FILTRADAS (envelope.total)
  pageSize: number;         // filas por página (envelope.pageSize)
  onPageChange: (page: number) => void;
};
export const Pagination: FC<PaginationProps>;
```

Rendering rules (spec Requirement 3):
- `total === 0` → returns `null` (no controls).
- `totalPages = max(1, ceil(total / max(1, pageSize)))`.
- Prev: native button, `disabled={page <= 1}`, `ChevronLeft` + "Anterior", `aria-label="Página anterior"`.
- Next: native button, `disabled={page >= totalPages}`, "Siguiente" + `ChevronRight`, `aria-label="Página siguiente"`.
- Info: `Página {page} de {totalPages}` with `aria-live="polite"`.
- Zero new deps (lucide-react `ChevronLeft`/`ChevronRight` already available).
- Row: `mt-4 flex items-center justify-end gap-2`.

## Store / State Design

State fields, actions and reset semantics per D38 (exact names above). Key invariants:
- `fetchMultas(filters?, page?)` and `fetchAporteRegistros(filters?, page?)` ALWAYS send `page`/`pageSize` and unpack the envelope (`items`/`total`/`page`/`pageSize`).
- `setMultasPage(page, filters)` / `setAporteRegistrosPage(page, filters)` are the ONLY page-mutation actions; the list effects call them with `page=1` on any filter change; `onPageChange` passes the current filter object.
- Effect deps MUST NOT include the page field (loop guard, D38).
- `createMultasBulk` refreshes the multas list at page 1, unfiltered (parity with today's `fetchMultas()`).
- Empty-state render rule in both routes becomes `total === 0` (not `items.length === 0`) so a beyond-range page doesn't falsely show "No hay ... registrados".

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/core/src/index.ts` | Modify | Add `Paginated<T>`; `BulkMultaRequest.grupoIds?: string[]` + `socioIds?` (was required); add `BulkMultaResponse` (D33/D36) |
| `packages/api/src/lib/paginacion.ts` | Create | `parsePaginacion(query)` + `DEFAULT_PAGE_SIZE=25`/`MAX_PAGE_SIZE=100` (D33) |
| `packages/api/src/lib/aportes.ts` | Modify | Add `sociosPorGrupos(grupoIds): Set<string>` (primario OR adicional, 2 batch queries, D35) |
| `packages/api/src/routes/multas.ts` | Modify | GET /: `parsePaginacion`, shared WHERE builder, COUNT + ORDER BY `fechaGen DESC, id DESC` + LIMIT/OFFSET → `{ items, total, page, pageSize }` (D33/D34); POST /bulk: conditional `socioIds`/`grupoIds` requirement, `grupoIds` array + existence validation (400s), union target set via `sociosPorGrupos`, existing permit filter + loop untouched (D36) |
| `packages/api/src/routes/aportes.ts` | Modify | GET /: same envelope pattern; ORDER BY `gestion DESC, mes DESC, id DESC` (D33/D34) |
| `packages/ui/src/components/pagination.tsx` | Create | `Pagination` component (D37): prev/next + page info, boundary disables, `total=0 → null`, native buttons, lucide chevrons |
| `packages/ui/src/index.ts` | Modify | Export `Pagination` (D37) |
| `apps/web/src/stores/app.store.ts` | Modify | multas: `multasTotal/multasPage/multasPageSize`, `fetchMultas(filters?, page?)` envelope unpack, `setMultasPage(page, filters)`, `createMultasBulk(payload)`; aportes: `aporteRegistrosTotal/aporteRegistrosPage/aporteRegistrosPageSize`, `fetchAporteRegistros(filters?, page?)`, `setAporteRegistrosPage(page, filters)` (D38) |
| `apps/web/src/routes/multas.tsx` | Modify | Create tab: Socios + Grupos MultiSelects (D41), zod schema (socioIds/grupoIds at-least-one), union live-count + point-in-time copy, `createMultasBulk` replaces raw fetch; Listar tab: `setMultasPage(1, filters)` effect, empty-state on `multasTotal === 0`, `Pagination` below tables/cards (D37/D38) |
| `apps/web/src/routes/aportes.tsx` | Modify | Pagar tab: `setAporteRegistrosPage(1, filters)` effect, empty-state on total, `Pagination` below tables/cards (D37/D38) |
| `packages/api/test/multas.test.ts` | Create | NEW suite: bulk `grupoIds` matrix (payments spec scenarios) + multas envelope matrix (pagination spec scenarios) (D40) |
| `packages/api/test/aportes-generacion.test.ts` | Modify | Add `GET /api/aportes` pagination describe: envelope shape, ordering, clamps, invalid fallback, filters-before-pagination (D40) |

## Testing Strategy

Infra unchanged: Vitest 2.1, better-sqlite3 `:memory:`, Hono `app.request()`, `helpers.ts` (`migrarDb()`, `limpiarDatos()`, `requestJson()`, `crearSocio()`, `crearGrupo()`, `crearDefinicion()`, `filas()`). No migration involved — `limpiarDatos()` already deletes `multas` and re-seeds groups (helpers.ts:56–76).

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Integration (api) — NEW `multas.test.ts` | Bulk `grupoIds`: `[g1]` with s1 primary + s2 additional → `201 { count: 2 }`, one multa per socio with concepto/monto; socio in group AND in `socioIds` charged once (dedup union, count 2); empty group contributes nothing (count 1 from direct s2); group member whose estado does NOT permit `multas` excluded (count 1); NO retrocharge (add s9 to group AFTER creation → no multa for s9, and no `multa_grupos` row can exist — assert multas row count unchanged); unknown `grupoId` → 400 + nothing created; non-array `grupoIds` → 400; absent `grupoIds` behaves exactly as today (regression: non-permitted s2 excluded → count 1); group path all-excluded → 400 with exact `Ningún socio puede participar en esta acción en su estado actual` | NEW suite, seed via `crearSocio({ grupoPrimarioId })`/`crearGrupo` + raw `socio_grupos` inserts for additional membership (pattern already used in `socios-aportes.test.ts`), `filas()` raw-SQL asserts for row counts |
| Integration (api) — NEW `multas.test.ts` | Multas envelope: default request → `{ items: 25, total: N, page: 1, pageSize: 25 }`; `pageSize=500` → clamped (echo 100, ≤100 items); `page=9` beyond range → `items: []`, `total` kept, page echoed 9; empty list → `total: 0`, `items: []`; invalid `page=abc&pageSize=-5` → defaults (1/25); deterministic ordering across pages (60 multas via 3 bulks with distinct `fecha` → page1 = 25 newest, union of 3 pages = all 60, no dupes/gaps; same-`fechaGen` rows ordered by `id DESC`); filters before pagination (`estado=anulado` on 40 multas w/ 10 anuladas → items 10, total 10); combined `grupoId`+`estadoId` → subset + total; regression: `estado=anulado` returns only anuladas (envelope shape new) | NEW suite, bulk with explicit `fecha` for deterministic ordering; `filas('SELECT ... ORDER BY fecha_gen DESC, id DESC')` cross-check against API page union |
| Integration (api) — `aportes-generacion.test.ts` (Modified) | Aportes envelope: default → `{ items: 25, total: 60, page: 1, pageSize: 25 }` (5 socios × 12 mensual = 60); ordering `gestion DESC, mes DESC, id DESC` (page 1 = mes 12 first, same-mes by id DESC); `pageSize=500` clamp; invalid fallback; `?mes=5` filtered → `total: 5`; `?gestion=<currentYear>&mes=12` combined filter; beyond-range page → empty items + total kept | Add a `describe('GET /api/aportes — paginación')` block; reuse the existing creation helpers; assert envelope fields + ordering of `mes` across pages |
| Existing 5 suites | Regression — MUST pass untouched | Verified (D39): none of `aporte-definicion`, `aportes-bulk-all-pagos`, `aporte-dedup`, `aportes-generacion`, `socios-aportes`, `grupos` call GET /api/multas or GET /api/aportes — the envelope change requires ZERO edits to them |
| Manual smoke | Pagination component: renders below both lists, prev disabled on page 1, next disabled on last page, `total=0` renders nothing, keyboard Tab+Enter; filter change resets to page 1; MultiSelects in the create form (filter-as-you-type, chips, group copy + union count); bulk-with-group create shows the toast/refresh | dev server (no UI test infra exists in `apps/web`/`packages/ui` — D40) |

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Envelope breaks a consumer missed in-repo | Low (was Med) | D39 exhaustive audit: exactly 2 consumers, both store actions, both updated in the same change; zero external/legacy consumers; new suite asserts the shape; C′ fallback reserved per proposal |
| Ordering instability (duplicates/gaps across pages) | Low | Strict total order via unique `id` tiebreak (D34); same-`fechaGen`/same-`(gestion,mes)` rows still ordered by `id DESC`; NULL `mes`/`gestion` sort deterministically (NULLs last in DESC) |
| Filter-reset ↔ page-change loop | Low | Single `setMultasPage` action; effect deps exclude the page field (D38) — the reset and the page change share one path, so identity of `filters` never re-triggers |
| Group membership drift surprises admins (no retrocharge) | Med | Point-in-time semantics documented in the create-form copy (D41, spec Requirement 2) + spec scenario "A socio joining the group after creation is NOT retrocharged" as a RED test |
| Client union hint ≠ server truth | Low | The hint uses client-known memberships only (best-effort); the server re-resolves authoritatively via `sociosPorGrupos` (D35); hint is display-only |
| `pageSize` division-by-zero / NaN in the component | Low | `Math.max(1, pageSize)` guard in `totalPages` (D37) — defensive; the store always passes ≥ 1 |
| Beyond-range page shows a false empty state | Low | Empty state keys off `total === 0`, not `items.length === 0` (D38) |

## Migration / Rollout

**No migration required.** Fully additive except the two GET response shapes (no schema change, no data backfill, no feature flag). Rollout order within the change: core types → `lib/paginacion.ts` + `lib/aportes.ts` helper → routes (both GETs + POST /bulk) → store → UI (Pagination + routes) → tests. The API and web ship in the same change (single PR chain) so no interim state leaves the old UI consuming the new envelope.

**Rollback**: `git revert` of the two route handlers + store envelope handling + UI wiring restores bare arrays and the checkbox scrollbox. `grupoIds` support is optional — POST /bulk reverts cleanly to `socioIds`-only with no data migration (no M:N table was created; multas rows are plain rows either way).

## Slice Mapping (chained-PR structure from the proposal)

| Slice | Scope | Tasks land where |
|-------|-------|------------------|
| **A — Backend** | `core` deltas (`Paginated<T>`, `BulkMultaRequest.grupoIds`, `BulkMultaResponse`); `lib/paginacion.ts`; `sociosPorGrupos` in `lib/aportes.ts`; GET /multas + GET /aportes envelope + ORDER BY; POST /bulk `grupoIds`; NEW `multas.test.ts`; aportes pagination additions in `aportes-generacion.test.ts` | D33, D34, D35, D36, D40 |
| **B — Web multas** | `multas.tsx` create tab (two MultiSelects, zod at-least-one, union count + copy); `createMultasBulk` store action (removes raw fetch); listar-tab pagination wiring + page state | D38 (multas half), D41 |
| **C — Pagination UI + aportes** | `Pagination` component + export; `aportes.tsx` pagar-tab wiring; shared reset-on-filter behavior (both routes) | D37, D38 (aporte half) |
| **D — Tests & polish** | Edge cases (empty state on total=0, last-page overflow, beyond-range page), a11y pass on Pagination/MultiSelects, copy review, full regression of the 6 existing suites | D40 (polish), spec scenarios final pass |

**Review-budget note**: Slice A carries the biggest diff (routes + lib + new suite); Slice B/C are UI wiring. The 400-line guard should be forecast in sdd-tasks; if Slice A alone exceeds it, split the new test suite into its own commit within the slice.

## Open Questions

- [ ] `grupoIds: []` (present, empty) is treated as "no groups" (behaves like absent) — spec pins only "absent = exactly as today"; confirm `[]` needs no distinct semantics.
- [ ] Single-page lists render both disabled controls (spec-minimum); Slice D may hide them when `totalPages === 1` — confirm the polish is desired.
- [ ] The client union count hint (D41) is display-only best-effort; if admins need an exact pre-submit count, a future `GET /api/grupos/:id/miembros` endpoint would be the honest source — deferred.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. (The "routes" changed are Hono HTTP handlers with fixed paths; no dynamic process-level routing is introduced.)
