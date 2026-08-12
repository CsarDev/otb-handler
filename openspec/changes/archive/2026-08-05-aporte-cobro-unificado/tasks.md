# Tasks: Unified Aporte Definition + Assignment + Cobro Generation (aporte-cobro-unificado)

Implementation order follows the design's rollout order: **schema/migration → core types → shared lib generator + routes → store → UI → tests → final verification**. Each task is a reviewable work unit (work-unit-commits): tests and helpers stay with the behavior they verify, and the generated migration files (journal + snapshot) land with the schema change.

**Task index** (maps `T<phase>.<n>` to the concrete tasks):

| Task | Scope | Summary |
|------|-------|---------|
| T1.1 | [db] | Additive partial unique index migration `0006_*` (D13) |
| T1.2 | [core] | Type deltas: `AporteInput`, `AporteGenerado`/`GeneracionResult`, `CrearDefinicionResponse`, `SocioConGeneracion` |
| T1.3 | [api] | `lib/aportes.ts`: move shared generator + dedup + `definicionesDeGrupos`/`definicionesPorIds` |
| T1.4 | [api] | `routes/aportes.ts`: import shared helpers, delete local copies (dedup-safe D17) |
| T2.1 | [api] | `routes/aportes-definicion.ts` POST: UUID, `socioIds` validation, one-transaction assign + generate (D14/D15/D18/D19) |
| T2.2 | [api] | `routes/socios.ts` POST/PUT: generation in the same transaction over final sets (D16) |
| T3.1 | [web] | `stores/app.store.ts`: new `addAporte` payload/response; `createSocio`/`updateSocio` return `SocioConGeneracion` + refresh `aporteRegistros` |
| T3.2 | [web] | `routes/aportes.tsx`: unified Crear form (definition fields + "Asignar a" radio + live hint + toast); remove "Generar Cobros" (D21/D22) |
| T3.3 | [web] | `routes/socios.tsx`: save toast with `generados.count` |
| T4.1 | [test] | `helpers.ts` + rework the 4 suites (aporte-definicion, socios-aportes, aportes-generacion, aportes-bulk-all-pagos) |
| T4.2 | [test] | New `aporte-dedup.test.ts` cross-path dedup matrix |
| T5.1 | [all] | Final verification: full test run, typecheck across packages, DB migrate smoke |

---

## Phase 1: Foundation — Schema, Core Types, Shared Generator

### T1.1 [db] Additive partial unique index migration `0006_*` (D13)

- [x] Declare the partial unique index in `packages/db/src/schema/aportes.ts` (drizzle): `uniqueIndex('aporte_dedup_unico').on(t.socioId, t.aporteId, t.mes, t.gestion).where(sql\`${t.aporteId} IS NOT NULL\`)` — add the `sql` import from `drizzle-orm/sqlite-core`.
- [x] Generate the migration with `pnpm db:generate` (workdir `packages/db`): creates `packages/db/drizzle/0006_*.sql` and keeps `meta/_journal.json` + `0006_snapshot.json` in sync. Commit all three generated files.
- [x] Confirm the generated SQL is exactly the additive statement: `CREATE UNIQUE INDEX \`aporte_dedup_unico\` ON \`aportes\` (\`socio_id\`, \`aporte_id\`, \`mes\`, \`gestion\`) WHERE \`aporte_id\` IS NOT NULL;` — no drops, no data rewrites.
- [x] Pre-check against the real DB (`packages/db/otb.db`) before landing: assert 219 records total, 0 with `aporte_id IS NOT NULL`, 0 duplicate `(socio_id, aporte_id, mes, gestion)` groups (the index cannot conflict). If an install has dupes, `CREATE UNIQUE INDEX` fails loudly — document the one-off dedup in the migration comment (already drafted in design).
- [x] Verify the test helper picks it up: `migrarDb()` in `packages/api/test/helpers.ts` applies every `*.sql` sorted, so `0006_*` auto-applies in the in-memory DB — run one api test file to confirm no migration error.
- **Depends on**: none.
- **Verification**: `pnpm db:generate` runs clean; `0006_*` + journal + snapshot created; `pnpm test` (api) still green; index exists in DB (`SELECT sql FROM sqlite_master WHERE name='aporte_dedup_unico'`). — ✅ PASSED (see slice A apply-progress; `0006_burly_smiling_tiger.sql`)

### T1.2 [core] Type deltas in `packages/core/src/index.ts` (Interfaces/Contracts)

- [x] `AporteInput`: **drop** the optional `id` field (server-generated now, D14); **add** `socioIds?: string[]` (direct assignment, each MUST reference an existing socio — D18). Keep all existing fields (`nombre`, `monto`, `recurrencia?`, `inicio?`, `fin?`, `modalidadPago?`, `aplicaGrupoId?`, `activo?`).
- [x] Add `AporteGenerado` (item shape: `{ id, socioId, aporteId: string | null, mes, gestion, tipo, montoBase }`) and `GeneracionResult = { count: number; items: AporteGenerado[] }` (the shape the manual endpoints already return; moved to core).
- [x] Add `CrearDefinicionResponse = { definiciones: Aporte[]; generados: GeneracionResult }` — the `201` response of `POST /api/aportes-definicion` (D15).
- [x] Add optional `generados?: { count: number }` to `Socio` (response-only on POST/PUT saves) and new `SocioConGeneracion = Socio & { generados: { count: number } }` (D16).
- [x] Leave `BulkAporteRequest`/`CrearAporteRequest` unchanged (single/bulk/bulk-all endpoints retained, D17).
- **Depends on**: none.
- **Verification**: `pnpm typecheck` (core) passes; no consumer outside the change breaks (routes use their own local `ValoresAporte`; the store passes `AporteInput` through unchanged until T3.1). — ✅ PASSED

### T1.3 [api] `packages/api/src/lib/aportes.ts` — shared dedup generator + helpers

- [x] Move from `packages/api/src/routes/aportes.ts` into `lib/aportes.ts` (exported): `generarAportes`, `mesesParaDefinicion`, `aportesDirectosPorSocio`, `gruposAdicionalesPorSocio`, `validarGestionMes`, `validarDefinicionesActivas`, plus the supporting types (`SocioParaGenerar`, `AporteCreado`, `TxAportes`).
- [x] In `generarAportes`, add **dedup inside the transaction** (D13): before each `INSERT`, SELECT `(socio_id, aporte_id, mes, gestion)` — skip if a row exists; count **only newly inserted rows** in the returned `items`. Keep the insert `onConflictDoNothing()` as defense-in-depth (no-op when the index from T1.1 exists).
- [x] Add helper `definicionesDeGrupos(grupoIds: string[]): Aporte[]` (D20): batch `inArray` query on `aportesDefinicion` for `aplicaGrupoId ∈ grupoIds` **and `activo = 1`** — used for membership-time generation (group-scoped half of the socio-save union).
- [x] Add helper `definicionesPorIds(ids: string[]): Aporte[]`: batch lookup of active definitions by id — used for the direct half of the socio-save union.
- [x] Keep `aporteDefPorId`, `aporteDefActivoDefault`, `mesesDefinicion`, `socioHoldsAporte` as-is.
- **Depends on**: T1.1 (index is the backstop; app-level SELECT works without it), T1.2 (`AporteGenerado` shape).
- **Verification**: `pnpm typecheck` (api) passes; exports compile; no behavior change yet (routes still use local copies until T1.4). — ✅ PASSED

### T1.4 [api] `packages/api/src/routes/aportes.ts` — switch to shared helpers (D17)

- [x] Import the moved helpers from `lib/aportes.ts` (`generarAportes`, `mesesParaDefinicion`, `aportesDirectosPorSocio`, `gruposAdicionalesPorSocio`, `validarGestionMes`, `validarDefinicionesActivas`) and **delete the local copies**.
- [x] Single `POST /`, `/bulk`, `/bulk/all` flow through the now-dedup-safe generator — contracts unchanged, but **re-running for an already-materialized `(socio, aporte, mes, gestion)` returns only new rows** (re-run → `{ count: 0, items: [] }`).
- [x] `GET /`, `GET /socio/:socioId`, `GET /:id/pagos`, `POST /:id/pagar`, `POST /:id/anular`, `PUT /:id` unchanged.
- **Depends on**: T1.3.
- **Verification**: `pnpm typecheck` (api); existing api test suites still pass unchanged (no suite re-runs a generation path, so dedup does not alter current assertions); spot-check `POST /api/aportes/bulk` re-run returns `{ count: 0, items: [] }`. — ✅ PASSED (all 4 suites / 60 tests green; re-run spot-checked: bulk + single → `{ count: 0, items: [] }`, 0 duplicate keys, total rows unchanged)

## Phase 2: Core Implementation — API Auto-Generation Routes

### T2.1 [api] `packages/api/src/routes/aportes-definicion.ts` POST — server UUID + assignment + generation (D14/D15/D18/D19)

- [x] **D14**: `POST /` always sets `id = crypto.randomUUID()`; a client-supplied `id` in the body is IGNORED (never validated, never rejected, never stored). **Remove the duplicate-id 400 check.**
- [x] **D18**: validate optional `socioIds` — each id MUST reference an existing socio, else `400 { error: "socioIds contains an invalid socio" }` **before any insert** (no definition, no assignments, no records). Non-array `socioIds` → 400.
- [x] **D15**: wrap insert + assign + generate in a **single `db.transaction()`**:
  1. validate body with the existing `validarAporte` (unchanged validations: nombre, monto >= 0, recurrencia, window, modalidadPago, `aplicaGrupoId` exists) plus `socioIds` (D18);
  2. insert the definition with the server UUID;
  3. insert `socio_aportes` rows for every `socioId` (direct assignment);
  4. resolve the **target set** = `socioIds` ∪ current members of `aplicaGrupoId`'s group (primary membership `socios.grupoPrimarioId = g` OR additional membership `socio_grupos.grupoId = g`), deduplicated by socioId;
  5. load target socios (`id, estadoId, grupoPrimarioId`) + their additional groups; filter to those whose estado `permite(..., 'aportes')` (bulk-exclusion: non-permitted keep the assignment, generate 0 records, response stays `201` — never 409, never 400);
  6. call the shared dedup `generarAportes(tx, permitidos, [newDef], directos, grupos, gestion = new Date().getFullYear())` with **no `mes`** (D12) — direct assignees hold the def via the just-inserted `socio_aportes` map; group-only members hold it via `socioHoldsAporte` (empty direct map).
- [x] Response `201 { definiciones, generados: { count, items } }` where `definiciones` is the **full definitions list** (catalog derivable; store replace-list pattern) and `generados` reports only newly inserted rows.
- [x] `PUT /:id` stays **field-edit only** (D19): same `validarAporte`, no `socioIds`, no assignment changes, no generation; body `id` still ignored. `DELETE /:id` keeps the 409 guard (D10).
- **Depends on**: T1.2 (response types), T1.3 (generator + helpers), T1.4.
- **Verification**: `pnpm typecheck`; spec scenarios (see T4.1 for the automated suite): "a nadie" → `generados.count: 0`; body `id` ignored → server UUID in `definiciones`; `socioIds` direct generation with per-month count; `socioIds` + `aplicaGrupoId` union deduped on overlap; unknown `socioId` → 400 with nothing created; non-permitted → 201 + assignment kept + 0 records; group-scoped → records for CURRENT members at assignment + NO `socio_aportes` rows. — ✅ PASSED (`aporte-definicion.test.ts` 25 tests green; typecheck green)

### T2.2 [api] `packages/api/src/routes/socios.ts` POST/PUT — generation in the same transaction (D16)

- [x] `POST /`: inside the existing `db.transaction()` (after inserting `socios` + `socio_grupos` + `socio_aportes`), run the dedup generator over the union of:
  - (a) direct assignments — `definicionesPorIds(final aporteIds)` where final `aporteIds` = the declared set, and
  - (b) group-scoped definitions of the final membership set — `definicionesDeGrupos(grupoPrimarioId ∪ grupoAdicionalIds)` (D20),
  - deduplicated by definition id; `gestion = new Date().getFullYear()`, no `mes`.
- [x] `PUT /:id`: compute the **"final" sets in memory before the transaction** — `aporteIds` = declared ?? preserved existing `socio_aportes`; `grupoAdicionalIds` = declared ?? preserved `socio_grupos`; `grupoPrimarioId` = declared ?? preserved. Run the same dedup generator inside the existing persistence transaction over the final sets. Re-save with no changes → `count: 0` (idempotent); adding an aporte/membership → only missing records; **removals never delete already-generated records**.
- [x] Both responses: standard `armarSocio` shape **plus** `generados: { count }` (only newly inserted rows).
- [x] If the socio's final `estadoId` does not permit `aportes`: keep the assignment/membership, generate **0** records, **no 409** (bulk-exclusion exception, D9/D16).
- [x] `baja`/`DELETE` unchanged (no generation). `validarAporteIds`/`validarGrupos` unchanged.
- **Depends on**: T1.3 (generator + `definicionesDeGrupos`/`definicionesPorIds`), T1.2 (`SocioConGeneracion`).
- **Verification**: `pnpm typecheck`; spec scenarios (T4.1): POST with `aporteIds` generates records + `generados.count`; POST without → `aporteIds: []`; non-permitted → 0 records, no 409; PUT atomic replace without deleting records; PUT adding an aporte generates ONLY missing; re-save idempotent (`count: 0`); membership-time generation for future members; membership removal → no record deletion. — ✅ PASSED (`socios-aportes.test.ts` 22 tests green; typecheck green)

## Phase 3: Integration — Store and UI

### T3.1 [web] `apps/web/src/stores/app.store.ts` — new payloads and generated-count feedback

- [x] `addAporte(data)`: POST to `/aportes-definicion` with the new payload (no `id`; `socioIds`/`aplicaGrupoId`); parse `CrearDefinicionResponse` — store `definiciones` (replace the list) and **return `generados`** (`GeneracionResult`) so the caller can toast the count. Replace the `AporteBulkResult` alias usage with core `GeneracionResult`.
- [x] `createSocio`/`updateSocio`: return `SocioConGeneracion` (typed) and call `fetchAporteRegistros()` after a successful save so newly generated cobros appear immediately.
- [x] `createAportesBulk`/`createAportesBulkAll` kept as-is (API retention D17; typed with `GeneracionResult`).
- **Depends on**: T1.2 (types), T2.1/T2.2 (response shapes).
- **Verification**: `pnpm typecheck` (web) passes; store compiles against the new response shapes. — ✅ PASSED (commit `124753d`; web typecheck green; `AporteBulkResult` fully removed)

### T3.2 [web] `apps/web/src/routes/aportes.tsx` — unified Crear form (D21/D22)

- [x] Merge the definition form and the "Generar Cobros" section into **ONE unified form** in the Crear tab: existing definition fields (nombre, monto, recurrencia, inicio/fin, modalidadPago, activo) + an **"Asignar a"** section — radio group of three exclusive modes (D21):
  - **"a nadie"** (default): payload has neither `socioIds` nor `aplicaGrupoId`;
  - **"a socios"**: multiselect of socios whose estado permits `aportes` (reuse the existing `permitidos` filter) → `socioIds`;
  - **"a un grupo"**: single group select → `aplicaGrupoId`.
- [x] **Remove** the standalone "Generar Cobros" section: `generarForm`, `allSocios` state, `selectedSocioIds`/`selectedDefiniciones` watches, `toggleDefinicion`/`toggleSocio`, `handleGenerar`, and the section JSX (definition checkboxes, socio checkboxes, gestión/mes inputs, "Generar Cobros" button). `createAportesBulk`/`createAportesBulkAll` calls go with it.
- [x] **No `id` input** in the create form (server-generated UUID, D14); when editing, the id may be shown read-only.
- [x] **Live cobro-count hint** before submit: client-side estimate of months (from `recurrencia` ∩ window, current gestión) × target socios, for the current gestión; note that dedup may reduce the actual count.
- [x] After submit: on success show the **generated-count toast** "Se generaron N cobro(s)" (local inline toast, D22 — component state + fixed-position banner, auto-dismiss ~3s, `role="status"`/`aria-live="polite"`, no new dependency), close the modal, and call `fetchAporteRegistros()` so the cobro list refreshes.
- [x] "Pagar" tab, definition list, edit (PUT field-edit only), and delete (409 guard) remain unchanged.
- **Depends on**: T3.1.
- **Verification**: `pnpm typecheck` + `pnpm build` (web); manual dev-server smoke: create with each assignment mode, toast shows the generated count, cobro list updates, no "Generar Cobros" section, no id input, ~360px wrapping. — ✅ PASSED (commit `3f12f88`; web typecheck + `vite build` green; dev-server smoke N/A — SPA render requires a browser, typecheck/build cover imports+types)

### T3.3 [web] `apps/web/src/routes/socios.tsx` — save toast with generated count

- [x] In `onSubmit`, read `generados.count` from the create/update response (`SocioConGeneracion`) and show the inline toast "Se generaron N cobro(s)" (same D22 pattern as T3.2).
- [x] Multiselect + chips (direct + inherited) unchanged; cobro list refresh handled by the store (T3.1).
- **Depends on**: T3.1.
- **Verification**: `pnpm typecheck`; manual smoke: saving a socio with aportes/memberships shows the count toast and the cobro list updates. — ✅ PASSED (commit `289a850`; web typecheck green; smoke N/A — see T3.2)

## Phase 4: Testing — Suite Reworks + Cross-Path Dedup

### T4.1 [test] `packages/api/test/helpers.ts` + rework the 4 suites

- [x] **`helpers.ts`**: `crearDefinicion` now returns the **created definition** (server UUID) so suites stop hardcoding ids — return `{ definiciones, generados }`-aware shape (find the new definition in `definiciones`). Note: `crearSocio` now triggers auto-generation (D16) — tests must target gestions/definitions whose records were not already materialized (prefer explicit past gestions, e.g. 2025, given the current year is 2026).
- [x] **`aporte-definicion.test.ts`**: rework POST scenarios — remove the duplicate-id 400 test; add server-UUID + ignored client `id` (assert no definition with the client slug exists and the returned `definiciones` contains a UUID); `socioIds` assignment with per-month generation counts; union direct ∪ group deduped (`generados.count === 3`); "a nadie" → `generados.count === 0` + `aplicaGrupoId` null; unknown `socioId` → 400 with nothing created; non-permitted → 201 + `socio_aportes` row kept + 0 records; group-scoped → records for CURRENT members at assignment + NO `socio_aportes` rows; response shape `{ definiciones, generados }`. Keep PUT field-edit-only scenarios (id immutability, 404) and DELETE guard scenarios — fix the DELETE-guard test's raw row-count assertion to account for auto-generated records (assert `n >= 1` or filter by gestion).
- [x] **`socios-aportes.test.ts`**: response includes `generados.count`; socio-save generation scenarios (POST with `aporteIds` generates records; POST without → `[]`); **invert** the "future member inherits without materialization / NO records by membership" assertion — records SHALL be generated at membership time (assert `aportes` rows exist for the group-scoped definition); PUT atomic replace never deletes records; PUT adding an aporte generates only missing (count reflects only new); re-save idempotent (`generados.count === 0`); non-permitted estado → assignment kept + 0 records; read-only inherited chips + direct-dedup scenarios unchanged.
- [x] **`aportes-generacion.test.ts`**: use server-generated definition ids (via the updated helper) instead of hardcoded slugs; ensure each test targets a `gestion`/definition whose records were **not** auto-generated at socio creation (e.g. explicit past gestions like 2025, or definitions whose window excludes the current year); add a single-endpoint **re-run dedup** scenario (`{ count: 0, items: [] }`, no duplicate rows). Keep all 400/404/409 enforcement scenarios.
- [x] **`aportes-bulk-all-pagos.test.ts`**: same id/gestion handling; add **bulk and bulk/all re-run dedup-safe** scenarios (`{ count: 0, items: [] }` after a first successful run); `/pagos` suite unchanged (ingreso, excludes anulado, empty, 404).
- **Depends on**: T2.1, T2.2 (behavior), T1.1 (index applies via `migrarDb`).
- **Verification**: `pnpm test` (api) — all 5 suites green, including the new assertions; no cross-test pollution (`limpiarDatos()` already clears `aportes`/`socio_aportes`). — ✅ PASSED (4 reworked suites + 74 total tests green; full `pnpm typecheck` 13/13 green)

### T4.2 [test] New `packages/api/test/aporte-dedup.test.ts` — cross-path dedup invariant matrix

- [x] Definition creation with `socioIds` generates records; **re-saving the socio** with the same `aporteIds` adds none (row count unchanged, `generados.count === 0`); **membership re-assertion** (PUT with same groups) adds none; **bulk re-run** for the already-materialized `(socio, aporte, mes, gestion)` returns `{ count: 0, items: [] }`.
- [x] "a nadie" creation → 0 records; the definition **later assigned via the socio form** → records appear exactly once.
- [x] Membership-time path: socio joins a group with a scoped definition → records generated once; re-asserting membership → no duplicates; joining again after leave/re-join → no duplicates (removal never deletes, but re-entry does not duplicate).
- [x] Assert with raw SQL dedup groups: `SELECT socio_id, aporte_id, mes, gestion, COUNT(*) FROM aportes WHERE aporte_id IS NOT NULL GROUP BY 1,2,3,4 HAVING COUNT(*) > 1` is empty across the whole matrix.
- **Depends on**: T2.1, T2.2, T4.1 (helper shape).
- **Verification**: `pnpm test` (api) — `aporte-dedup.test.ts` green; every cross-path combination leaves a unique `(socio, aporte, mes, gestion)`. — ✅ PASSED (8 new tests green; full api suite 82/82; no generator fix needed — the D13 invariant held on every path)

## Phase 5: Verification

### T5.1 [all] Final verification gate

- [x] Full test run: `pnpm test` at the repo root (all workspaces; api suites incl. `aporte-dedup.test.ts` green).
- [x] Typecheck across packages: `pnpm typecheck` (core, db, api, web — or `pnpm nx run-many -t typecheck` per repo convention).
- [x] DB migrate smoke: `pnpm db:migrate` (workdir `packages/db`) against the real `otb.db` applies `0006_*` cleanly (219 records, 0 with `aporte_id IS NOT NULL` → no conflict); confirm `aporte_dedup_unico` exists.
- [x] Web build: `pnpm build` (web) compiles; manual smoke of the unified form, "Pagar" tab, definition list/edit/delete, and ~360px layout.
- **Depends on**: all prior tasks.
- **Verification**: exit code 0 for every command above; `git status` shows only the intended files. — ✅ PASSED (api 82/82 — 74 baseline + 8 dedup; typecheck 13/13; web `vite build` green; real `otb.db` migrate idempotent, index present, 219 rows / 0 lineage → no conflict)

---

## Scenario Coverage Traceability

| Spec scenario | Task(s) |
|---|---|
| List returns full catalog | T1.2 (types), T4.1 (kept GET test) |
| Create without assignment (a nadie) → 0 records | T2.1, T4.1, T4.2 |
| Create with client-supplied id → ignored, server UUID | T2.1 (D14), T4.1 |
| Create with socioIds → direct generation (count 4) | T2.1, T4.1 |
| Create with socioIds + aplicaGrupoId → union deduped (count 3) | T2.1, T4.1 |
| Non-permitted socio → assignment kept, 0 records, 201 | T2.1, T4.1 |
| Unknown socioId → 400, nothing created | T2.1 (D18), T4.1 |
| Validation 400s (nombre, monto, negative, recurrencia, modalidad, window, aplicaGrupoId) | T2.1 (kept `validarAporte`), T4.1 (kept tests) |
| Group-scoped → current members generate at assignment, no `socio_aportes` rows | T2.1, T4.1 |
| PUT field-edit only; PUT id not renamed; PUT 404 | T2.1 (D19), T4.1 (kept) |
| DELETE unused 200 / in-use 409 / nonexistent 404 | T2.1 (guard kept), T4.1 |
| Group Application: future member generates at membership | T2.2 (D16), T4.1 (inverted), T4.2 |
| Group Application: removing member stops application, records never deleted | T2.2, T4.1 (inverted), T4.2 |
| Auto-generation trigger: definition creation with assignment | T2.1, T4.1 |
| Auto-generation trigger: socio save with assignments | T2.2, T4.1 |
| Auto-generation trigger: membership-time generation | T2.2, T4.1 |
| Non-permitted excluded from auto-generation, no 409 | T2.1, T2.2, T4.1 |
| Dedup: re-running creation-with-assignment never duplicates | T1.3 (generator), T1.1 (index), T4.2 |
| Dedup: socio re-save idempotent | T2.2, T4.2 |
| Dedup: manual bulk re-run → `{ count: 0, items: [] }` | T1.4, T4.1 (bulk suite), T4.2 |
| Dedup: single endpoint re-run → `{ count: 0, items: [] }` | T1.4, T4.1 (generacion suite), T4.2 |
| Dedup: membership re-assertion does not duplicate | T2.2, T4.2 |
| Socio POST multiselect generates records; POST without → `aporteIds: []`; 400s (unknown/inactive/non-array) | T2.2, T4.1 (kept + new) |
| Socio PUT atomic replace without deleting records; PUT preserve; PUT add generates only missing; full replace | T2.2, T4.1 |
| Read-only inherited chips (primary/secondary/both, dedup, read-only) | T4.1 (kept — read path unchanged) |
| Inverted: future member inherits AND receives records at membership | T2.2, T4.1 (inverted) |

---

## Review Workload Forecast

**Estimated changed lines** (authored additions + deletions; generated goldens excluded from the authored count but shipped in the PR):

| File | Action | Est. changed lines (add+del) |
|------|--------|-----------------------------|
| `packages/db/src/schema/aportes.ts` | Modify | ~8 |
| `packages/db/drizzle/0006_*.sql` + `meta/_journal.json` + `0006_snapshot.json` | Create (generated) | ~60 (**excluded** from authored count; included in snapshot identity) |
| `packages/core/src/index.ts` | Modify | ~30 |
| `packages/api/src/lib/aportes.ts` | Modify | ~165 (of which ~110 is a mechanical move from routes/aportes.ts) |
| `packages/api/src/routes/aportes.ts` | Modify | ~125 (−110 move-out, ~15 import/dedup wiring) |
| `packages/api/src/routes/aportes-definicion.ts` | Modify | ~110 |
| `packages/api/src/routes/socios.ts` | Modify | ~115 |
| `apps/web/src/stores/app.store.ts` | Modify | ~40 |
| `apps/web/src/routes/aportes.tsx` | Modify | ~260 (−90 removed "Generar Cobros", +170 unified form) |
| `apps/web/src/routes/socios.tsx` | Modify | ~20 |
| `packages/api/test/helpers.ts` | Modify | ~25 |
| `packages/api/test/aporte-definicion.test.ts` | Modify | ~130 |
| `packages/api/test/socios-aportes.test.ts` | Modify | ~130 |
| `packages/api/test/aportes-generacion.test.ts` | Modify | ~90 |
| `packages/api/test/aportes-bulk-all-pagos.test.ts` | Modify | ~90 |
| `packages/api/test/aporte-dedup.test.ts` | Create | ~240 |
| **Total authored** | | **≈ 1,578** (call it **1,550–1,600**) |

Notes on the estimate: the generator move (T1.3+T1.4) inflates the count because it is a pure relocation (~220 lines of the total); test churn (T4.1+T4.2) is the single largest contributor (~705). The migration + journal + snapshot are drizzle-generated goldens — excluded from the authored threshold but must be committed with T1.1 and verified (in-memory `migrarDb` applies `0006_*` automatically; real DB has 219 records / 0 non-null `aporte_id` → clean create).

- **400-line budget risk: High** (≈1,578 authored lines, ≈4× the 400 threshold).
- **Chained PRs recommended: Yes** (4 slices, each independently verifiable and mergeable).
- **Decision needed before apply: Yes** (ask-on-risk delivery strategy; Slice B sits at the edge of the 800-line review budget and may need an accepted exception or a reorder decision).

**Recommended slice boundaries** (each slice is independently verifiable and mergeable; commit-by-work-unit inside each):

1. **Slice A — Foundation (T1.1–T1.4): ~330 authored.** Schema index + core types + shared dedup generator + routes/aportes.ts on shared helpers. *Verify:* `pnpm typecheck` + full api vitest run (existing suites pass unchanged — dedup is a strengthening no current test re-runs). *Mergeable:* endpoints work, migration additive, no UI/behavior change.
2. **Slice B — Auto-generation API + full test rework (T2.1, T2.2, T4.1): ~820 authored.** POST definition semantics + socio-save generation + helpers/suite reworks. This slice MUST land as one PR: the POST response/id change breaks all four suites simultaneously (they hardcode definition ids), so the test rework cannot be split out without a red build. *Verify:* `pnpm typecheck` + full api vitest run (all suites green on the new semantics). ⚠️ This slice exceeds the 400-line rule of thumb and sits at the 800-line review budget — the chained-PR decision (above) is where the team accepts this or adjusts the review budget. Internally commit by work unit: (T2.1 + helpers + aporte-definicion suite) → (T2.2 + socios-aportes/generacion/bulk reworks).
3. **Slice C — Store + UI (T3.1–T3.3): ~320 authored.** Store payload/response + unified Crear form + socio save toast. *Verify:* `pnpm typecheck` + web build + manual dev smoke (unified form, toast, no "Generar Cobros", ~360px). *Mergeable:* UI points at the new API (Slice B already merged).
4. **Slice D — Cross-path dedup suite + final verification (T4.2, T5.1): ~240 authored.** New dedup matrix + full gate. *Verify:* `pnpm test`, `pnpm typecheck` across packages, `pnpm db:migrate` smoke against the real DB. *Mergeable:* last slice, full green.
