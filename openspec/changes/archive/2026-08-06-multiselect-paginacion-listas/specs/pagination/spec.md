# Pagination — Envelopes and Pageable List Contract

## Capability

`pagination` (NEW — no existing main spec)

## Description

The two list endpoints that grow over time — `GET /api/multas` and `GET /api/aportes` — currently return bare arrays with no limit/offset, no total, and no deterministic order. This capability defines the shared pagination contract applied to BOTH lists: `page`/`pageSize` query params (default 25, cap 100), an ALWAYS-envelope response `{ items, total, page, pageSize }` (option C — all consumers are in-repo and updated in the same change), deterministic ORDER BY per list (no duplicates/gaps across pages), a reusable `Pagination` component in `@otb/ui`, store state for page/pageSize/total, and page reset to 1 on any filter change. Existing filters on both lists keep working: WHERE applies before LIMIT/OFFSET and `total` reflects the filtered count.

## Endpoints / Components

| Location | Type | Description |
|----------|------|-------------|
| `packages/api/src/routes/multas.ts` | Modified | GET / → envelope `{ items, total, page, pageSize }`; ORDER BY `fechaGen DESC, id DESC` |
| `packages/api/src/routes/aportes.ts` | Modified | GET / → envelope `{ items, total, page, pageSize }`; ORDER BY `gestion DESC, mes DESC, id DESC` |
| `packages/core/src/index.ts` | Modified | `Paginated<T>` type; list filter types gain `page`/`pageSize` |
| `packages/ui/src/components/pagination.tsx` | New | `Pagination` component, exported from `@otb/ui` |
| `apps/web/src/routes/multas.tsx` | Modified | Paginated multas list wiring |
| `apps/web/src/routes/aportes.tsx` | Modified | Pagination wiring on the pagar tab |
| `apps/web/src/stores/app.store.ts` | Modified | page/pageSize/total state; envelope unpacking; page reset on filter change |

## Requirements

### Requirement: Paginated Envelope — GET /api/multas and GET /api/aportes

Both `GET /api/multas` and `GET /api/aportes` MUST accept OPTIONAL `page` and `pageSize` query params and SHALL ALWAYS respond with the envelope `{ items, total, page, pageSize }` (always-envelope, option C), where `items` is the page slice, `total` is the COUNT of all rows matching the current filters (before pagination), and `page`/`pageSize` echo the effective values. Defaults: `page` = 1, `pageSize` = 25. `pageSize` MUST be capped at 100 (larger values SHALL be clamped to 100). Non-numeric values and out-of-range `page` (< 1) SHALL fall back to the defaults. `items` SHALL be ordered deterministically: multas by `fechaGen DESC, id DESC`; aportes by `gestion DESC, mes DESC, id DESC`.

#### Scenario: Default request returns the first page with a total — NEW

- GIVEN 60 multas exist
- WHEN GET /api/multas
- THEN the response SHALL be 200 with { items: [25 rows], total: 60, page: 1, pageSize: 25 }

#### Scenario: pageSize over the cap is clamped to 100 — NEW

- WHEN GET /api/aportes?pageSize=500
- THEN the response SHALL carry pageSize=100 and at most 100 items

#### Scenario: A page beyond the range returns empty items while keeping the total — NEW

- GIVEN 60 multas exist
- WHEN GET /api/multas?page=9&pageSize=25
- THEN the response SHALL be 200 with { items: [], total: 60, page: 9, pageSize: 25 }

#### Scenario: An empty list returns total=0 with an empty page — NEW

- GIVEN no multas exist
- WHEN GET /api/multas
- THEN the response SHALL be 200 with { items: [], total: 0, page: 1, pageSize: 25 }

#### Scenario: Ordering is deterministic across pages (no duplicates/gaps) — NEW

- GIVEN 60 multas with distinct fechaGen/id values
- WHEN GET /api/multas?page=1 and GET /api/multas?page=2 (pageSize=25)
- THEN every row SHALL appear exactly once across the two pages
- AND page 1 SHALL contain the 25 rows with the highest (fechaGen, id) under the ordering (fechaGen DESC, id DESC)

#### Scenario: Invalid page/pageSize values fall back to defaults — NEW

- WHEN GET /api/aportes?page=abc&pageSize=-5
- THEN the response SHALL carry page=1 and pageSize=25

### Requirement: Existing Filters Keep Working with Pagination

All existing query filters on both lists — multas: `socioId`, `estado`, `actividadId`, `fechaDesde`, `fechaHasta`, `gestion`, `estadoId`, `grupoId`; aportes: `socioId`, `mes`, `gestion`, `tipo`, `estado`, `fechaDesde`, `fechaHasta`, `estadoId`, `grupoId` — MUST continue to work unchanged and SHALL apply BEFORE pagination (WHERE before LIMIT/OFFSET). `total` SHALL reflect the filtered row count and `items` SHALL be the filtered slice.

#### Scenario: A filtered list paginates correctly with a filtered total — NEW

- GIVEN 40 multas, of which 10 are anuladas
- WHEN GET /api/multas?estado=anulado&pageSize=25
- THEN the response SHALL be 200 with { items: [10 anuladas rows], total: 10, page: 1, pageSize: 25 }

#### Scenario: estado=anulado filter still returns only anuladas — IMPLEMENTED (regression)

- GIVEN multas in estados pendiente, pagado and anulado
- WHEN GET /api/multas?estado=anulado
- THEN every item SHALL have estado="anulado" (filter behavior unchanged; the envelope shape is new)

#### Scenario: Combined filters (grupoId + estadoId) paginate correctly — NEW

- GIVEN multas for members of g1 and g2 with distintos socio estados
- WHEN GET /api/multas?grupoId=g1&estadoId=<id>&page=1
- THEN only the multas of g1 members whose socio estadoId matches SHALL be in items
- AND total SHALL equal the count of those rows only

### Requirement: Pagination Component — @otb/ui

`@otb/ui` MUST export a `Pagination` component with props `{ page, total, pageSize, onPageChange }`. It SHALL render previous/next controls plus page information (e.g. "Página X de Y", derived from total/pageSize). The previous control SHALL be disabled on page 1; the next control SHALL be disabled on the last page. When `total` is 0, the component SHALL render NO pagination controls. All controls SHALL be keyboard-accessible.

#### Scenario: Component renders and drives page changes — NEW

- GIVEN a list with total=60, page=1, pageSize=25
- WHEN the Pagination component renders with onPageChange
- THEN the next control SHALL be enabled
- AND activating it SHALL invoke onPageChange(2)

#### Scenario: Boundary pages disable the appropriate control — NEW

- GIVEN page=1
- WHEN the component renders
- THEN the previous control SHALL be disabled
- GIVEN page=3 with total=60 and pageSize=25 (last page)
- WHEN the component renders
- THEN the next control SHALL be disabled

#### Scenario: Empty list renders no pagination controls — NEW

- GIVEN total=0
- WHEN the component renders
- THEN NO pagination controls SHALL render

### Requirement: Store Pagination State — page/pageSize/total + Reset on Filter Change

The store MUST hold `page`, `pageSize` and `total` for the multas list AND the aportes list, and SHALL unpack the envelope (`items`, `total`, `page`, `pageSize`) from GET responses. Changing the page SHALL update `page` and refetch the page slice. Any change to a list filter (socio, estado, grupo, gestion, tipo, date range, etc.) SHALL reset `page` to 1 before refetching.

#### Scenario: Page change updates the store and refetches — NEW

- GIVEN the multas list shows page 1
- WHEN onPageChange(2) fires
- THEN the store SHALL set page=2 and refetch GET /api/multas?page=2&pageSize=25

#### Scenario: A filter change resets the page to 1 — NEW

- GIVEN the multas list is on page 4
- WHEN the user changes the estado filter to "pagado"
- THEN the store SHALL reset page to 1 before refetching

#### Scenario: The envelope is unpacked into items + total — NEW

- GIVEN GET /api/aportes responds { items, total, page, pageSize }
- WHEN the store processes the response
- THEN the list SHALL hold items AND total SHALL be stored for the Pagination component
