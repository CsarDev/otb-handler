# Tasks: Aportes as Dynamic Definitions — Many-to-Many Socio Assignment (tipos-aporte-cobros)

> REWRITE of the old task list (model `tipos_aporte` + `socios.tipo_aporte_id`, 8 commits) into the
> **corrected authoritative model**: the aporte is the dynamic DEFINITION (`aportes_definicion`),
> socio↔aporte is many-to-many (`socio_aportes`), group application is dynamic (NOT materialized),
> and record generation is definition-driven (no manual `monto`/`tipo` override). Maps 1:1 to the
> reworked specs `aporte-definitions`, `payments`, `socios-estados` and design `D1–D11`.

## Sequencing contract

- Every task is **one reviewable work unit** → one (or a coherent set of) conventional-commit(s).
- Tests stay in the same task as the behavior they verify (work-unit-commits).
- Tasks are ordered by dependency; a task in a later phase never depends on a phase-2 task.
- Each task is completable in ONE apply session. If a task grows beyond a session, split it further.
- Before apply, resolve the Open Questions in `design.md` (D3 `mes` optional field; migration DROP stays in `0005` by default).

---

## Phase 1: Schema + Core Foundation

### [db] T1.1 — Rework schema to `aportes_definicion` + `socio_aportes` + `aportes.aporteId`
- [x] DONE (Slice 1) — commit `fb9eb2b`
- **OBJETIVO**: Replace the catalog/FK model in the DB schema. Rename `packages/db/src/schema/tipos-aporte.ts` → `aporte-definicion.ts` with the definition table `aportes_definicion` (`id` text PK slug, `nombre`, `monto` real, `recurrencia` text default `'mensual'`, `inicio`/`fin` text nullable, `modalidadPago` text default `'cuotas'`, `aplicaGrupoId` text FK `grupos(id)` nullable, `activo` int default 1). Create `socio-aportes.ts` (`socio_aportes`: `socioId`+`aporteId` composite PK, FKs — clone of `socio-grupos.ts`). Add `aporteId` (text FK → `aportes_definicion.id`, nullable) to `aportes.ts`, keeping `tipo`+`monto_base` (D2). Remove `tipoAporteId` and legacy `aporteBase` from `socios.ts`. Update `schema.ts` exports (remove `tipos-aporte`, add `aporte-definicion` + `socio-aportes`).
- **REFS**: spec `aporte-definitions` (Definition CRUD, capability rework); design D1, D2, File Changes rows 1–4.
- **ARCHIVOS**: `packages/db/src/schema/aportes-definicion.ts` (renamed), `packages/db/src/schema/socio-aportes.ts` (new), `packages/db/src/schema/aportes.ts` (mod), `packages/db/src/schema/socios.ts` (mod), `packages/db/src/schema.ts` (mod).
- **CRITERIOS DE HECHO**:
  - `aportes_definicion` has columns `{ id, nombre, monto, recurrencia, inicio, fin, modalidad_pago, aplica_grupo_id, activo }`; no `monto_base`/`descripcion`.
  - `socio_aportes` composite PK `(socio_id, aporte_id)` with FKs to `socios` and `aportes_definicion`.
  - `aportes` gains nullable `aporte_id` FK; `tipo`+`monto_base` remain (D2).
  - `socios` no longer references `tipo_aporte_id`/`aporte_base`.
  - `pnpm --filter @otb/db typecheck` passes; `drizzle-kit` no drift against migration-0005 target.
- **COMMIT(S)**: `refactor(db): rework tipos_aporte into aportes_definicion and add socio_aportes join`

### [db] T1.2 — Migration 0005 (additive-then-drop) + `catalogo.ts` + `seed.ts`
- [x] DONE (Slice 1) — commit `8f1c9d6` (migration); `catalogo.ts`/`seed.ts` adaptation landed in `fb9eb2b` (compile dependency)
- **OBJETIVO**: Create `packages/db/drizzle/0005_<name>.sql` following the design SQL (additive statements FIRST: `aportes_definicion`, seed 4 default definitions via `INSERT OR IGNORE`, `socio_aportes`, `aportes.aporte_id`; additive-first BACKFILL `socio_aportes` from `socios.tipo_aporte_id` CASE `ta-*`→`ap-*`; DROP block LAST: `socios.tipo_aporte_id`, `socios.aporte_base`, `tipos_aporte`). Update `packages/db/src/catalogo.ts` (replace `TIPOS_APORTE_CATALOGO`+`idTipoAportePorMonto` with `APORTES_DEFINICION_SEED` — 4 defs `ap-mensual/ap-familiar/ap-jubilado/ap-honorario` with monto 50/30/25/0, `recurrencia='mensual'`, `modalidad_pago='cuotas'`, `activo=1` — plus `APORTE_ID_POR_TIPO` mapping `ta→ap`). Update `packages/db/src/seed.ts` to seed definitions and `socio_aportes` from old `tipoAporteId` per socio, generate records with `aporte_id`, and write NO `tipo_aporte_id`/`aporte_base`.
- **REFS**: spec `aporte-definitions` (Seed of Default Definitions); spec `socios-estados` (Migration drops type/base columns after additive step); design D1, Migration/Rollout.
- **ARCHIVOS**: `packages/db/drizzle/0005_*.sql` (new), `packages/db/src/catalogo.ts` (mod), `packages/db/src/seed.ts` (mod).
- **CRITERIOS DE HECHO**:
  - Migration idempotent (`INSERT OR IGNORE`); re-running does not duplicate definitions or rows.
  - Backfill: each socio with `tipo_aporte_id='ta-pleno'` gets a `socio_aportes` row `(id, 'ap-mensual')`; legacy mapping per `APORTE_ID_POR_TIPO`.
  - DROP block runs only after additive statements; existing `aportes` records are never deleted or rewritten.
  - Fresh seed → `aportes_definicion` contains `ap-mensual` "Cuota Social Mensual" (`recurrencia='mensual'`, `activo=1`).
  - `pnpm --filter @otb/db db:migrate && db:seed` succeed; `pnpm --filter @otb/db typecheck` passes.
- **COMMIT(S)**: `feat(db): add migration 0005 for aportes_definicion and socio_aportes with backfill and drop`

### [core] T1.3 — Core types: definition `Aporte`, record `AporteRegistro`, `SocioAporte`, multiselect
- [x] DONE (Slice 1) — commit `12202d7`
- **OBJETIVO**: Rework `packages/core/src/index.ts`. Add `Recurrencia` and `ModalidadPago` unions; rename `TipoAporte`→**`Aporte`** (definition: `{ id, nombre, monto, recurrencia, inicio, fin, modalidadPago, aplicaGrupoId, activo }`) and `TipoAporteInput`→**`AporteInput`** (per design contract, D6/D4/D7). Rename the RECORD type `Aporte`→**`AporteRegistro`** (alias `Cobro`) with `aporteId: string | null` added (D7b, D2). Add `SocioAporte` join and `AporteInherited`. Update `Socio`/`SocioInput`: remove `tipoAporteId`/`tipoAporteNombre`/`aporteBase`, add `aporteIds: string[]` + `aportesInherited: AporteInherited[]`. Rework `BulkAporteRequest` → `{ socioIds?, aporteIds, gestion, mes? }` (no `monto`/`tipo`/`meses`); add `CrearAporteRequest`. Update `ResumenSocioReport`/`DBData` arrays to `AporteRegistro[]`.
- **REFS**: spec `aporte-definitions` (Definition CRUD validation), `socios-estados` (aporteIds multiselect), design D1, D2, D7, D7b, Interfaces/Contracts.
- **ARCHIVOS**: `packages/core/src/index.ts` (mod).
- **CRITERIOS DE HECHO**:
  - `Aporte` (definition) and `AporteRegistro` (record) are distinct, exported types; `Recurrencia`/`ModalidadPago` unions exported.
  - `Socio` exposes `aporteIds: string[]` and `aportesInherited: AporteInherited[]`; NO `tipoAporteId`/`tipoAporteNombre`/`aporteBase` anywhere.
  - `BulkAporteRequest`/`CrearAporteRequest` have no `monto`/`tipo` overrides.
  - `pnpm --filter @otb/core typecheck` passes (all `@otb/core` consumers compile).
- **COMMIT(S)**: `refactor(core): rename record to AporteRegistro and add definition Aporte types with aporteIds multiselect`

---

## Phase 2: API — Definition Router + Helpers

### [api] T2.1 — `lib/aportes.ts` helpers (rename of `lib/tipos-aporte.ts`)
- [x] DONE (Slice 2) — commit `96a65ba`
- **OBJETIVO**: Rename/rework `packages/api/src/lib/tipos-aporte.ts` → `lib/aportes.ts`. Provide: `aporteDefPorId(id)`, `aporteDefActivoDefault()` (first definition with `activo=1`, D11), `mesesDefinicion(def, gestion, mes?)` — months `m ∈ [1..12]` with `(inicio==null || date(g,m)>=inicio)` AND `(fin==null || endOfMonth(g,m)<=fin)`, optional `mes` lower bound `max(1,mes)` (D3/D8) — and `socioHoldsAporte(socio, def, groups)` applicability helper (direct via `socio_aportes` OR `def.aplicaGrupoId ∈ { grupoPrimarioId ∪ additional }`). REMOVE `resolverMonto`/override logic.
- **REFS**: design D3, D5, D8, D11, File Changes `lib/aportes.ts`; spec `payments` (definition-driven).
- **ARCHIVOS**: `packages/api/src/lib/aportes.ts` (renamed/modified from `lib/tipos-aporte.ts`).
- **CRITERIOS DE HECHO**:
  - `mesesDefinicion` returns correct month sets for open/inverted/partial windows and honors `mes` lower bound.
  - `socioHoldsAporte` returns true for direct assignment OR group membership (primary or additional); false otherwise.
  - `aporteDefActivoDefault()` returns the first `activo=1` definition (rowid order) for `config.ts` (D11).
  - Dead `resolverMonto`/`tipoAportePorId`/`tipoAporteActivoDefault` code removed with no dangling `schema.tiposAporte` references.
  - `pnpm --filter @otb/api typecheck` passes.
- **COMMIT(S)**: `refactor(api): add definition-driven aporte helpers (mesesDefinicion, socioHoldsAporte)`

### [api] T2.2 — Definition CRUD router `aportes-definicion.ts` + mount (rename of `tipos-aporte.ts`)
- [x] DONE (Slice 2) — commit `eac5d21`
- **OBJETIVO**: Rename/rework `packages/api/src/routes/tipos-aporte.ts` → `aportes-definicion.ts`. Full CRUD on `/api/aportes-definicion`: `GET /` (full list), `POST /` (validate `nombre`, `monto>=0`, `recurrencia` enum, `inicio/fin` window `fin>=inicio`, `modalidadPago` enum, `aplicaGrupoId` exists when provided, `activo` 0/1 default 1; default `recurrencia='mensual'` D6, `modalidadPago='cuotas'` D4, client slug `id` accepted D7, duplicate id → 400), `PUT /:id` (IGNORE `id`, no rename D7; 404 not found), `DELETE /:id` (**409** when referenced by `socio_aportes` OR any `aportes.aporte_id` — message `"No se puede eliminar: hay socios o registros usando este aporte"`, D10; else 200; 404 not found). Mount in `packages/api/src/index.ts`: replace `api.route('/api/tipos-aporte', ...)` with `/api/aportes-definicion`.
- **REFS**: spec `aporte-definitions` (Definition CRUD + DELETE Guard 409); design D4, D6, D7, D10, Error States.
- **ARCHIVOS**: `packages/api/src/routes/aportes-definicion.ts` (renamed), `packages/api/src/index.ts` (mod).
- **CRITERIOS DE HECHO**:
  - `GET /api/aportes-definicion` → 200 array with all fields incl. `monto`, `recurrencia`, `inicio`, `fin`, `modalidadPago`, `aplicaGrupoId`, `activo`.
  - Rejections: missing/negative `monto`, invalid `recurrencia`, invalid `modalidadPago`, inverted window, unknown `aplicaGrupoId`, duplicate id, missing `nombre` → 400.
  - `PUT` with an `id` body field does NOT change the definition id (D7).
  - `DELETE` free definition → 200 removed; `DELETE` with `socio_aportes` assignment or `aportes.aporte_id` record → 409 with the friendly message; definition retained.
  - `404` for PUT/DELETE of nonexistent id.
  - `pnpm --filter @otb/api typecheck` + build pass; no `/api/tipos-aporte` route remains mounted.
- **COMMIT(S)**: `feat(api): add aportes-definicion CRUD router with 409 delete guard`

---

## Phase 3: API — Socios, Generation, Config

### [api] T3.1 — `socios.ts`: `aporteIds` multiselect + dynamic inheritance + shape drop
- [x] DONE (Slice 3) — commit `1970660` (+ `c1a16dc` orden de inserción)
- **OBJETIVO**: Rework `packages/api/src/routes/socios.ts` to the corrected model. Replace `validarTipoAporteId` with `validarAporteIds` (must be array; each id exists AND is active → else 400; NON-array → 400 `"aporteIds must be an array"`; no default-type fallback). POST accepts `aporteIds` (empty/absent → `[]`, no default); transaction inserts `socio_aportes` rows (pattern `socio_grupos`). PUT replaces the assignment set atomically when `aporteIds` provided; preserves when omitted. Read shape `armarSocio`: expose `aporteIds` (direct) + resolve `aportesInherited` dynamically (definitions whose `aplicaGrupoId ∈ { grupoPrimarioId ∪ additional groups }`, minus direct assignments for dedup) — D5, NO materialization. REMOVE `tipoAporteId`/`tipoAporteNombre`/`aporteBase` from shape and select.
- **REFS**: spec `socios-estados` (aporteIds multiselect + group inheritance scenarios); design D5, File Changes `socios.ts`.
- **ARCHIVOS**: `packages/api/src/routes/socios.ts` (mod).
- **CRITERIOS DE HECHO**:
  - POST multi → `socio_aportes` has both rows, response `aporteIds: ["ap-mensual","ap-extra"]`.
  - POST without `aporteIds` → response `aporteIds: []`, NO `socio_aportes` rows.
  - POST invalid / inactive id → 400; non-array → 400.
  - PUT `aporteIds` replaces set atomically (ap-extra row removed); PUT without `aporteIds` preserves.
  - Response has `aportesInherited` from primary + additional groups; direct-dedup; future-member auto-inherits with no `socio_aportes` row.
  - Response NO longer includes `tipoAporteId`/`tipoAporteNombre`/`aporteBase`.
  - `pnpm --filter @otb/api typecheck` + build pass.
- **COMMIT(S)**: `refactor(api): socios multiselect aporteIds and dynamic group-inherited aportes`

### [api] T3.2 — `aportes.ts` definition-driven generation + reject `monto`/`tipo`
- [x] DONE (Slice 3) — commit `3ca6cff`
- **OBJETIVO**: Rework `packages/api/src/routes/aportes.ts` generation. Single `POST /` takes `{ socioId, aporteId, gestion, mes? }` (via `CrearAporteRequest`); `/bulk` takes `{ socioIds, aporteIds, gestion, mes? }`; `/bulk/all` takes `{ aporteIds, gestion, mes? }`. For each (socio permitted by estado) × (definition held directly or inherited via `socioHoldsAporte`): `monto` = definition.monto (snapshot → `monto_base`), `tipo` = definition.recurrencia (snapshot → `tipo`), count per D8 (`anual`→12, `mensual`→`mesesDefinicion`, `unico`/`extraordinario`→`[mes??1]`), set `aporte_id=definition.id`. REJECT body `monto`/`tipo` (400, no override). Enforcement via `cargarPermisosPorEstado`/`permite(...,'aportes')` in single (409 `ERROR_PERMISO` when estado denies), `/bulk`, `/bulk/all` — NO hardcoded `estado='activo'` (D9). Single not-found socio → 404. Keep `/bulk/all` resolving ALL permitted socios; return 400 `"Ningún socio puede participar en esta acción en su estado actual"` when none eligible. Keep `GET /:id/pagos` (pattern `multas`, `referenciaId` + `tipo='ingreso'` + `anulado=0`, 404 absent).
- **REFS**: spec `payments` (definition-driven single/bulk/bulk-all, enforcement, preserved `/pagos`); design D8, D9, Data Flow.
- **ARCHIVOS**: `packages/api/src/routes/aportes.ts` (mod).
- **CRITERIOS DE HECHO**:
  - Single mensual window `ap-mensual`(monto 50, inicio 2025-03-01 fin 2025-05-31) + assigned socio → 3 records mes 3,4,5, `monto` 50, `{count:3}`.
  - Single `anual` → exactly 12 records (mes 1..12, `tipo='anual'`, monto 500); `unico`→1; `extraordinario`→1.
  - Inherited via group (no direct) generates records.
  - `monto` in body → 400, no record; inactive definition → 400; outside window → `{count:0}`; not-held → 400; estado-denies → 409.
  - Bulk uses each definition's monto/count; bulk/all only for permitted socios; no-eligible → 400.
  - `GET /:id/pagos` returns ingreso non-anulado movements ordered by date; excludes anulado; empty → `[]`; nonexistent → 404.
  - `pnpm --filter @otb/api typecheck` + build pass.
- **COMMIT(S)**: `feat(api): definition-driven aporte generation with no monto/tipo override`

### [api] T3.3 — `config.ts` derive `aporteMensualBase` from `aporteDefActivoDefault`
- [x] DONE (Slice 3) — commit `08b91c6`
- **OBJETIVO**: Update `packages/api/src/routes/config.ts` so `GET /` derives `aporteMensualBase` from `aporteDefActivoDefault().monto` (via `lib/aportes.ts`) instead of `tipoAporteActivoDefault().montoBase` (D11). Config is NOT a CRUD host for definitions.
- **REFS**: design D11; spec `aporte-definitions` (Frontend — Config has no aporte CRUD).
- **ARCHIVOS**: `packages/api/src/routes/config.ts` (mod).
- **CRITERIOS DE HECHO**:
  - `GET /api/config` returns `aporteMensualBase` equal to the first active definition's `monto`.
  - No `schema.tiposAporte` reference remains in `config.ts`.
  - `pnpm --filter @otb/api typecheck` passes.
- **COMMIT(S)**: `refactor(api): derive config aporteMensualBase from aporte definition`

---

## Phase 4: Store

### [web] T4.1 — `app.store.ts`: `aportes` definitions state + CRUD + generation + record rename
- [x] DONE (Slice 4) — commit (ver `git log` de la slice)
- **OBJETIVO**: Rework `apps/web/src/stores/app.store.ts`. Add `aportes: Aporte[]` (definitions) state + `aportesLoading`/`aportesError`; `fetchAportesDef` (loads `/aportes-definicion` in `fetchConfig` Promise.all), `addAporte`/`updateAporte`/`removeAporte` (CRUD against `/aportes-definicion`); DROP `tiposAporte`/`tiposAporteLoading`/`tiposAporteError`/`fetchTiposAporte`/`addTipoAporte`/`updateTipoAporte`/`removeTipoAporte`. Rename record array `aportes`→**`aporteRegistros`** (type `AporteRegistro[]`, D7b) and `fetchAportes`→`fetchAporteRegistros`; `createAportesBulk`/`createAportesBulkAll` accept the new `BulkAporteRequest` payload (no `tipo`/`monto`/`meses`); keep `fetchPagosAporte`. Replace `selectTiposAporteActivos`→`selectAportesActivos` (filter `activo===1`); remove `montoBaseDeTipoAporte`.
- **REFS**: spec `aporte-definitions`; design D7b, File Changes `app.store.ts`.
- **ARCHIVOS**: `apps/web/src/stores/app.store.ts` (mod).
- **CRITERIOS DE HECHO**:
  - Store exposes `aportes` (definitions) loaded during `fetchConfig`; no `tiposAporte` state/selectors remain.
  - `aporteRegistros` array + `fetchAporteRegistros` replace the old `aportes` record array.
  - CRUD actions hit `/aportes-definicion`; `selectAportesActivos` filters active definitions.
  - `pnpm --filter @otb/web typecheck` passes (all store consumers compile).
- **COMMIT(S)**: `refactor(web): rename store aporte records and add definitions CRUD state`

---

## Phase 5: UI

### [web] T5.1 — `config.tsx`: REMOVE the entire "Tipos de Aporte" CRUD block
- [x] DONE (Slice 5) — commit `4f71c9b`
- **OBJETIVO**: Remove from `apps/web/src/routes/config.tsx` the full aporte-definition CRUD block (schema/types `tipoAporteSchema`/`TipoAporteForm`/`defaultTipoAporteForm`, handlers `handleAddTipoAporte`/`handleOpenEditTipoAporte`/`handleSaveEditTipoAporte`/`handleRemoveTipoAporte`, state `showTipoAporteForm`/`editingTipoAporte`/forms, and the `Tipos de Aporte` list/edit/render section) and the `TipoAporte` store imports. Config keeps OTB, tiposActividad, estados, acciones, grupos (D11 — Config has NO aporte CRUD).
- **REFS**: spec `aporte-definitions` (Frontend — NOT in Config); design D11.
- **ARCHIVOS**: `apps/web/src/routes/config.tsx` (mod).
- **CRITERIOS DE HECHO**:
  - No "Tipo de Aporte"/"aporte" CRUD UI, type, or handler remains in `config.tsx`.
  - `config.tsx` no longer imports `TipoAporte` or the store aporte CRUD actions.
  - `pnpm --filter @otb/web typecheck` + build pass; Config still renders OTB/tiposActividad/estados/acciones/grupos.
- **COMMIT(S)**: `refactor(web): remove aporte definition CRUD from config page`

### [web] T5.2 — `aportes.tsx`: definition form + list/edit in "Crear" tab; cobro view
- [x] DONE (Slice 6) — commit `50adf52`
- **OBJETIVO**: Rework `apps/web/src/routes/aportes.tsx`. In the existing **"Crear"** tab add the definition CRUD UI: definition list/edit + form (`nombre`, `monto` Bs, `recurrencia`, `inicio`/`fin`, `modalidadPago`, optional `aplicaGrupoId`, `activo` toggle) using store `addAporte`/`updateAporte`/`removeAporte`; show the friendly 409 error on in-use delete. Adapt the batch generation form to the definition-driven payload (pick definitions via `aporteIds` + socios + `gestion`/`mes`; generate via `createAportesBulk`/`createAportesBulkAll`). The **"Pagar"** tab lists `aporteRegistros` (cobros) and keeps the payments history (`fetchPagosAporte`).
- **REFS**: spec `aporte-definitions` (Frontend); design D7b, File Changes `aportes.tsx`.
- **ARCHIVOS**: `apps/web/src/routes/aportes.tsx` (mod).
- **CRITERIOS DE HECHO**:
  - "Crear" tab renders definition form + list/edit; definition rows show `nombre`, `monto`, `recurrencia`, vigencia window, `activo` badge, and target group for group-scoped defs.
  - Batch generation uses `aporteIds`+definitions (no `tipo`/`monto`/`meses` in the request).
  - "Pagar" tab renders `aporteRegistros` and the payments history from `fetchPagosAporte`.
  - Invariant: Config no longer shows aporte CRUD; all aporte CRUD is here.
  - `pnpm --filter @otb/web typecheck` + build pass; usable at ~360px (wrapping chips, stacked cards).
- **COMMIT(S)**: `feat(web): definition CRUD and cobro view in aportes page`

### [web] T5.3 — `socios.tsx`: aporte multiselect + read-only inherited chips
- [x] DONE (Slice 5) — commit `8a2c0c2`
- **OBJETIVO**: Rework `apps/web/src/routes/socios.tsx`. Replace the single type select with a multi-active-definition chips selector (`aporteIds`, options = `selectAportesActivos`). Add read-only `aportesInherited` chips with a group legend (primary/secondary source). Replace `Aporte Base` cells/amount displays with direct (`aporteIds`) + inherited chip summaries. Update the zod schema (drop `tipoAporteId`, add `aporteIds: string[]`).
- **REFS**: spec `socios-estados` (Group Inheritance, Frontend/UI); design D5, File Changes `socios.tsx`.
- **ARCHIVOS**: `apps/web/src/routes/socios.tsx` (mod).
- **CRITERIOS DE HECHO**:
  - Socio form allows selecting ONE OR MORE active definitions (multiselect chips); no `tipoAporteId` select.
  - List/detail show read-only inherited chips with group source; direct assignments shown distinctly.
  - No `aporteBase`/`tipoAporteNombre` rendering remains.
  - `pnpm --filter @otb/web typecheck` + build pass; wraps at ~360px.
- **COMMIT(S)**: `feat(web): socio aporte multiselect and inherited group chips`

---

## Phase 6: Tests

### [api] T6.1 — Update `test/helpers.ts` to the corrected model
- [x] DONE (Slice 7) — commit `b811adb`
- **OBJETIVO**: Rework `packages/api/test/helpers.ts`: `limpiarDatos` reseeds the 4 definitions (`ap-mensual/ap-familiar/ap-jubilado/ap-honorario`, monto 50/30/25/0) into `aportes_definicion` and clears `socio_aportes`; `IDS` uses definition slugs (`apMensual` etc.); `crearSocio` sends `aporteIds` (default `['ap-mensual']`).
- **REFS**: design Testing Strategy (helpers); spec `aporte-definitions` (Seed).
- **ARCHIVOS**: `packages/api/test/helpers.ts` (mod).
- **CRITERIOS DE HECHO**:
  - `limpiarDatos` leaves `aportes_definicion` reseeded and `socio_aportes`/`aportes` empty each test.
  - `IDS` exposes `ap-mensual/ap-familiar/ap-jubilado/ap-honorario` + state ids; `crearSocio({aporteIds})` works.
  - Whole suite runs against the corrected model (no `tipos_aporte`/`tipoAporteId` references).
- **COMMIT(S)**: `test(api): update integration helpers to definition-driven model`

### [api] T6.2 — Rename `tipos-aporte.test.ts` → `aporte-definicion.test.ts` (CRUD + 409)
- [x] DONE (Slice 7) — commit `9e748a1`
- **OBJETIVO**: Rename and rework the test file against `/api/aportes-definicion`: list full catalog; create full/group-scoped; rejections (missing/invalid `nombre`, `monto` negative/absent, invalid `recurrencia`, invalid `modalidadPago`, inverted window, unknown `aplicaGrupoId`, duplicate id); update; PUT-id-immutability; 404; delete-free-ok; delete-in-use 409 (assignments AND generated records); delete inactive-in-use. Map to spec `aporte-definitions` scenarios.
- **REFS**: spec `aporte-definitions`; design Testing Strategy.
- **ARCHIVOS**: `packages/api/test/aporte-definicion.test.ts` (renamed from `tipos-aporte.test.ts`).
- **CRITERIOS DE HECHO**:
  - `pnpm --filter @otb/api test` runs `aporte-definicion.test.ts` green against every CRUD/validation/409 scenario.
  - Old `tipos-aporte.test.ts` removed.
- **COMMIT(S)**: `test(api): aporte-definition CRUD and delete-guard coverage`

### [api] T6.3 — Rename `socios-tipo-aporte.test.ts` → `socios-aportes.test.ts` (multiselect + inheritance)
- [x] DONE (Slice 7) — commit `fbda1e1`
- **OBJETIVO**: Rename and rework the test file: POST multiselect; POST without → `[]`; invalid id; inactive id; non-array; PUT atomic replace; PUT preserve; shape has no tipo/base; inheritance chips (primary, secondary, both, future-member no materialization, removal stops unless directly assigned, direct-dedup, read-only).
- **REFS**: spec `socios-estados` (aporteIds + Group Inheritance scenarios); design D5.
- **ARCHIVOS**: `packages/api/test/socios-aportes.test.ts` (renamed from `socios-tipo-aporte.test.ts`).
- **CRITERIOS DE HECHO**:
  - `pnpm --filter @otb/api test` runs `socios-aportes.test.ts` green against all multiselect/inheritance scenarios.
  - Old `socios-tipo-aporte.test.ts` removed.
- **COMMIT(S)**: `test(api): socio aporte multiselect and dynamic inheritance coverage`

### [api] T6.4 — Update `aportes-generacion.test.ts` (definition-driven single)
- [x] DONE (Slice 7) — commit `19f08db`
- **OBJETIVO**: Rework: single mensual window count (3 records 2025-03..05, monto 50); anual → exactly 12; unico → 1; extraordinario → 1; inherited-via-group generation; `monto`-in-body 400 (no override); inactive definition 400; outside-window → `{count:0}`; not-held 400; estado-denies 409. Remove the override-oriented cases.
- **REFS**: spec `payments` (Single Aporte scenarios); design D8, D9.
- **ARCHIVOS**: `packages/api/test/aportes-generacion.test.ts` (mod).
- **CRITERIOS DE HECHO**:
  - `pnpm --filter @otb/api test` runs `aportes-generacion.test.ts` green against all definition-driven single scenarios.
- **COMMIT(S)**: `test(api): definition-driven single aporte generation coverage`

### [api] T6.5 — Update `aportes-bulk-all-pagos.test.ts` (definition-driven bulk + `/pagos`)
- [x] DONE (Slice 7) — commit `4f53d72`
- **OBJETIVO**: Rework: bulk per-definition monto+count; bulk anual 12/socio; reject `monto`/`tipo` in bulk body (400); estado exclusion (only s1); no-eligible 400; inactive definition 400; bulk/all only-permitted; bulk/all no-eligible 400; bulk/all anual 12; preserve `GET /:id/pagos` (ingreso non-anulado, order, empty `[]`, 404).
- **REFS**: spec `payments` (Bulk + bulk/all + preserved `/pagos` scenarios); design D8, D9.
- **ARCHIVOS**: `packages/api/test/aportes-bulk-all-pagos.test.ts` (mod).
- **CRITERIOS DE HECHO**:
  - `pnpm --filter @otb/api test` runs `aportes-bulk-all-pagos.test.ts` green against all bulk/bulk-all/`/pagos` scenarios.
- **COMMIT(S)**: `test(api): definition-driven bulk and payment-history coverage`

---

## Phase 7: Closure (post-verification, no code)

### [meta] T7.1 — Archive `ux-avanzado-otb` on verified completion
- **OBJETIVO**: After architecture/verify confirms the change, archive/cancel `openspec/changes/ux-avanzado-otb` (its pendings — anual→12, definition-driven generation, `GET /:id/pagos` — are absorbed here). Plan as a step; do NOT execute in apply.
- **REFS**: proposal.Dependencies; design Rollback.
- **ARCHIVOS**: `openspec/changes/ux-avanzado-otb/*` (archive action).
- **CRITERIOS DE HECHO**: `ux-avanzado-otb` archived/cancelled only after this change verifies.
- **COMMIT(S)**: `chore(meta): archive ux-avanzado-otb change (absorbed by definition-driven model)`

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | **~2,000–2,400** (additions + deletions, code + tests, 6 layers) |
| 400-line budget risk | 🔴 High (far exceeds the budget) |
| Chained PRs recommended | ✅ Yes |
| Delivery strategy | **auto-chain → stacked-to-main** (resolved) |
| Chain strategy | stacked-to-main |
| Decision needed before apply | No (strategy resolved); Open Questions in design remain to confirm |

### Why stacked-to-main
The rework touches ~20 files and replaces a just-implemented model across `db`, `core`, `api`, store, UI and tests. Estimated changed lines (~2,000–2,400) are far over the 400-line review budget. Each slice chosen below is independently reviewable and lands to `main` in order; rollback is per-slice. The UI portion is split so no single slice pushes past the reviewer budget.

### Suggested Work Units (stacked-to-main)

| # | Tasks | PR base | Focused test command | Runtime harness | Rollback boundary |
|---|-------|---------|----------------------|-----------------|-------------------|
| 1 | T1.1, T1.2, T1.3 | main (PR1) | `pnpm --filter @otb/db typecheck` + `@otb/core typecheck` | `pnpm --filter @otb/db db:migrate && db:seed` + `pnpm --filter @otb/db db:generate` (no drift) | Migration 0005 additive part reversible; DROP is last, `socios`/core files revertible |
| 2 | T2.1, T2.2 | PR1 (PR2) | `pnpm --filter @otb/api typecheck` + build | `pnpm dev` + curl `GET/POST/PUT/DELETE /api/aportes-definicion` (incl. 409) | `aporte-definicion.ts`/`lib/aportes.ts` revertible |
| 3 | T3.1, T3.2, T3.3 | PR2 (PR3) | `pnpm --filter @otb/api typecheck` + build | curl POST `/api/socios` (aporteIds), POST `/api/aportes` anual (12) y `/bulk` | `socios.ts`/`aportes.ts`/`config.ts` revertible; records never deleted |
| 4 | T4.1 | PR3 (PR4) | `pnpm --filter @otb/web typecheck` | `pnpm dev` store `aportes` loaded in `fetchConfig` | `app.store.ts` revertible |
| 5 | T5.1, T5.3 | PR4 (PR5) | `pnpm --filter @otb/web typecheck` + build | `pnpm dev` Config (no aporte CRUD) + Socio multiselect/inherited chips at ~360px | `config.tsx`/`socios.tsx` revertible |
| 6 | T5.2 | PR5 (PR6) | `pnpm --filter @otb/web typecheck` + build | `pnpm dev` Aportes — Crear tab definition CRUD + Pagar cobro list/history | `aportes.tsx` revertible |
| 7 | T6.1–T6.5 | PR6 (PR7) | `pnpm --filter @otb/api test` (vitest, in-memory better-sqlite3) | — tests only (additive, no prod effect) | test files removed/adjusted, no prod impact |

_T7.1 (archive) runs at the end of the chain after verification; no code._

### Delivery-strategy resolution
The operator-stated strategy is **PRs chained (stacked-to-main)**. Forecast confirms `chained_prs_recommended: Yes`, `review_budget_risk: High`, `estimated_changed_lines` in the ~2,000–2,400 range. `decision_needed_before_apply`: the strategy is resolved (No new decision), but confirm the two `design.md` Open Questions during apply (3-a: keep optional `mes` for `mensual`; migration: DROP stays in `0005` by default vs split to `0006`).

## Implementation Order

1. **Phase 1 (schema/core)** first — every downstream layer consumes the new types/tables.
2. **Phase 2 (definition router + lib)** — definitions are the source of truth for generation.
3. **Phase 3 (socios + generation + config)** — depends on `lib/aportes.ts` helpers.
4. **Phase 4 (store)** — re-keys UI to `aportes`/`aporteRegistros`.
5. **Phase 5 (UI)** — config removal + socios chips (Slice 5) before aportes page (Slice 6).
6. **Phase 6 (tests)** — helpers reworked first, then the 4 renamed/updated files.
7. **Phase 7 (closure)** — archive only after verification.

## Next Step

Ready for implementation (sdd-apply). Tasks grouped into 7 stacked-to-main slices; each task = one conventional-commit work unit with its verification and rollback boundary.