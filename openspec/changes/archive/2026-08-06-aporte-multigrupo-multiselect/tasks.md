# Tasks: Multi-Group Aporte Assignment + Searchable MultiSelect (aporte-multigrupo-multiselect)

Implementation order follows the design's rollout order: **schema/migration → core types → lib helpers → API routes → MultiSelect component → route/store integration → tests → final verification**. Each task is a reviewable work unit (work-unit-commits): tests and helpers stay with the behavior they verify, and the generated migration files (journal + snapshot) land with the schema change. The design's "no interim state" constraint (the UI and routes flip together with the `aplica_grupo_id` DROP COLUMN) means the backend slice must land as one atomic unit — see the Review Workload Forecast for the chained-PR boundaries and the required decision.

**Task index** (maps the 13 planned work units to `T<phase>.<n>` tasks):

| Task | Scope | Summary |
|------|-------|---------|
| T1.1 | [db] | Migration `0007` (join table + backfill + DROP `aplica_grupo_id`) + Drizzle model `aportes-definicion-grupos.ts` + `schema.ts` export + column removal (D23) |
| T1.2 | [core] | Type deltas: `Aporte.grupoIds`, `AporteInput.grupoIds?`, `AporteInherited` unchanged, `CrearDefinicionResponse` reused for PUT (D24) |
| T2.1 | [api] | `lib/aportes.ts`: `socioHoldsAporte` set-intersection, `definicionesDeGrupos` join query, `grupoIdsPorDefinicion` + `hidratarGrupoIds` wired into every `Aporte`-returning path (D25) |
| T2.2 | [api] | `routes/aportes-definicion.ts`: `grupoIds` validation, POST union target across ALL groups, PUT replace/preserve + `{ definiciones, generados }`, GET catalog hydration, DELETE join cleanup (D26/D27/D28) |
| T2.3 | [api] | `routes/socios.ts`: `aportesInheritedPorSocio` via join table with def-dedup + stable ordering (D29) |
| T2.4 | [api] | `routes/grupos.ts`: DELETE guard 409 via `aportes_definicion_grupos` (D30, orphan-FK fix) |
| T3.1 | [ui] | Hand-rolled `MultiSelect` component `packages/ui/src/components/multi-select.tsx` + index export (D31) |
| T3.2 | [web] | `routes/aportes.tsx`: two MultiSelects on create AND edit, badges per group, edit toast (D32) |
| T3.3 | [web] | `routes/socios.tsx`: MultiSelect for `aporteIds` + `grupoAdicionalIds` with `excludeValues` (D32) |
| T3.4 | [web] | `stores/app.store.ts`: `updateAporte` payload/response `{ definiciones, generados }`; `addAporte` field rename |
| T4.1 | [test] | `helpers.ts` seed → join table + mechanical `aplicaGrupoId` → `grupoIds` rework of the 5 suites |
| T4.2 | [test] | NEW coverage: multi-group POST union, PUT replace/preserve, PUT missing-only, groups DELETE 409, hydration, join cleanup, chip def-dedup |
| T5.1 | [all] | Final verification: full test run, typecheck, web build, real-DB migrate smoke |

---

## Phase 1: Foundation — Schema, Migration, Core Types

### T1.1 [db] Migration `0007` + Drizzle join model `aportes-definicion-grupos.ts` (D23)

- [x] Create `packages/db/src/schema/aportes-definicion-grupos.ts` (NEW) mirroring `packages/db/src/schema/socio-grupos.ts` exactly: `aportesDefinicionGrupos = sqliteTable('aportes_definicion_grupos', { definitionId: text('definition_id').notNull().references(() => aportesDefinicion.id), grupoId: text('grupo_id').notNull().references(() => grupos.id) }, (t) => ({ pk: primaryKey({ columns: [t.definitionId, t.grupoId] }) }))` — composite PK, both FKs, `ON DELETE no action` (codebase pattern).
- [x] Remove the `aplicaGrupoId` column from `packages/db/src/schema/aportes-definicion.ts` (`aplicaGrupoId: text('aplica_grupo_id').references(() => grupos.id)`), remove the now-unused `grupos` import, and drop the `aplica_grupo_id` clause from the header comment.
- [x] Add `export * from './schema/aportes-definicion-grupos';` to `packages/db/src/schema.ts` (after the `aportes-definicion` export).
- [x] Generate the migration with `pnpm db:generate` (workdir `packages/db`): creates `packages/db/drizzle/0007_*.sql` and keeps `meta/_journal.json` + `0007_snapshot.json` in sync. Commit all three generated files.
- [x] Insert the backfill statement MANUALLY between the drizzle-emitted CREATE TABLE and the DROP COLUMN (drizzle-kit does not emit data backfills): `INSERT OR IGNORE INTO \`aportes_definicion_grupos\` (definition_id, grupo_id) SELECT id, aplica_grupo_id FROM \`aportes_definicion\` WHERE aplica_grupo_id IS NOT NULL;` — idempotent via the composite PK (`INSERT OR IGNORE`), same pattern as 0005.
- [x] Confirm the final `0007_*.sql` is additive-first ordered: **CREATE join table → backfill → `ALTER TABLE \`aportes_definicion\` DROP COLUMN \`aplica_grupo_id\`` LAST** (pattern proven in 0005 which dropped FK column `tipo_aporte_id` with `foreign_keys=ON`).
- [x] Pre-check against the real DB (`packages/db/otb.db`) before landing: 5 definitions, 1 with `aplica_grupo_id` set (test def → group `51e17ab9-…` "Manzano A", exists — no orphan) → the backfill produces exactly **1 join row**; the 4 seeded definitions stay global (no rows). Confirm `aplica_grupo_id` no longer exists after applying.
- [x] Verify the test helper picks it up: `migrarDb()` in `packages/api/test/helpers.ts` applies every `*.sql` sorted, so `0007_*` auto-applies in the in-memory DB — run one api test file to confirm no migration error (column removed everywhere).
- **Depends on**: none.
- **Verification**: `pnpm db:generate` runs clean; `0007_*` + journal + snapshot created; real-DB `pnpm db:migrate` applies cleanly with 1 backfilled join row and no orphan; in-memory `migrarDb()` applies `0007_*`; re-running the backfill statement inserts nothing (spec scenario "Re-running the backfill does not duplicate join rows").

### T1.2 [core] Type deltas in `packages/core/src/index.ts` (D24)

- [x] `Aporte.aplicaGrupoId: string | null` → `grupoIds: string[]` with comment "M:N vía `aportes_definicion_grupos`; `[]` = global".
- [x] `AporteInput.aplicaGrupoId?: string | null` → `grupoIds?: string[]` with comment "ausente/`[]` = global; cada id DEBE existir (400 si no)". Keep `socioIds?: string[]` unchanged (D18).
- [x] Leave `AporteInherited` (`{ id, nombre, grupoId, grupoNombre }`) and `Socio` UNCHANGED — def-dedup happens in resolution (D29), not in the type.
- [x] Leave `CrearDefinicionResponse = { definiciones: Aporte[]; generados: GeneracionResult }` unchanged — it is REUSED for the `200` PUT response (same shape as POST minus the status code).
- **Depends on**: none (rollout order: after T1.1 so the schema compiles, but type-wise independent).
- **Verification**: `pnpm typecheck` (core) passes; no consumer outside the change breaks at this point (routes use their own local `ValoresAporte` until T2.2; web compiles until T3.x — see forecast coupling note).

## Phase 2: Core Implementation — API Lib + Routes

### T2.1 [api] `packages/api/src/lib/aportes.ts` — set-intersection predicate, join query, batch hydration (D25)

- [x] Rewrite `socioHoldsAporte(socio, def, grupos)` — signature becomes `(socio: { aporteIds: string[] | undefined; grupoPrimarioId: string | null }, def: { id: string; grupoIds: string[] }, grupos: string[])`: direct assignment check unchanged (`socio.aporteIds?.includes(def.id)` → true); `if (def.grupoIds.length === 0) return false` (global → never "held" by group); build a `Set` of the socio's groups (primary + `grupos` adicionales) and return `def.grupoIds.some((g) => gruposDelSocio.has(g))` (set-intersection).
- [x] Rewrite `definicionesDeGrupos(grupoIds: string[]): Aporte[]` as a join query through the new table: `if (grupoIds.length === 0) return []`; `db.select({ def: schema.aportesDefinicion }).from(schema.aportesDefinicionGrupos).innerJoin(schema.aportesDefinicion, eq(schema.aportesDefinicionGrupos.definitionId, schema.aportesDefinicion.id)).where(and(inArray(schema.aportesDefinicionGrupos.grupoId, grupoIds), eq(schema.aportesDefinicion.activo, 1))).all()`; dedup by definition id via a `Map` (a def listed under several requested groups returns once).
- [x] Add NEW batch helper `grupoIdsPorDefinicion(ids: string[]): Map<string, string[]>`: single `inArray(definitionId, ids)` select of `(definitionId, grupoId)` over the join table, assembled into a `Map` (no N+1, mirrors `gruposAdicionalesPorSocio`).
- [x] Add internal `function hidratarGrupoIds(defs: Aporte[]): Aporte[]` — the SINGLE hydration source: `defs.map((d) => ({ ...d, grupoIds: mapa.get(d.id) ?? [] }))` via `grupoIdsPorDefinicion`.
- [x] Wire `hidratarGrupoIds` into EVERY `Aporte`-returning path: `aporteDefPorId`, `aporteDefActivoDefault`, `definicionesPorIds`, and `definicionesDeGrupos` — enforced invariant: "every returned `Aporte` carries `grupoIds` (never `undefined`)". This is critical: an unhydrated def would have `grupoIds === undefined`, `length === 0`, and group-scoped generation would silently stop working.
- [x] Leave `generarAportes`, `mesesDefinicion`, `mesesParaDefinicion`, `aportesDirectosPorSocio`, `gruposAdicionalesPorSocio`, `validarGestionMes`, `validarDefinicionesActivas` UNCHANGED (D13 dedup verbatim).
- **Depends on**: T1.1 (join table + schema export), T1.2 (`Aporte.grupoIds`).
- **Verification**: `pnpm typecheck` (api) passes; hydration invariant holds — `aporteDefPorId`, `definicionesPorIds`, `definicionesDeGrupos` all return defs with `grupoIds: string[]`; no behavior change yet (routes still use their local `ValoresAporte` until T2.2).

### T2.2 [api] `packages/api/src/routes/aportes-definicion.ts` — POST union, PUT semantics, GET hydration, DELETE cleanup (D26/D27/D28)

- [x] **`ValoresAporte`**: `aplicaGrupoId: string | null` → `grupoIds: string[]`.
- [x] **`validarAporte`**: replace the `aplicaGrupoId` block with `grupoIds` validation — absent/`null`/`[]` → `[]` (global); non-array → `400 { error: 'grupoIds must be an array' }`; each id MUST exist in `grupos` (batch `inArray` check) else `400 { error: 'grupoIds contains an invalid group' }` BEFORE any insert (D18 pattern). Remove the old `'aplicaGrupoId is invalid'` branch.
- [x] **POST (D26)**: keep the existing transaction (insert definition with server UUID D14; insert `socio_aportes` for `socioIds`); ADD step 3 — insert `aportes_definicion_grupos` rows for every `grupoId`; replace the single-group target-set block with a loop over ALL `grupoIds`: `target = Set(socioIds)` ∪ for each `gid ∈ grupoIds`: `socios.grupoPrimarioId = gid` ∪ `socio_grupos.grupoId = gid` — deduplicated by socio (overlap across groups and direct assignment generates once); bulk-exclusion filter unchanged (non-permitted keep assignment, 0 records, `201` never `409`); `directos` map = `socioIds → [id]`; `defNueva: Aporte = { id, ...values, grupoIds }` (hydrated from the join state) and call the shared D13 `generarAportes`.
- [x] **POST/PUT response**: `definiciones` becomes the FULL catalog hydrated with BOTH `grupoIds` and `socioIds` (see GET below) — `201 { definiciones, generados: { count, items } }`.
- [x] **PUT (D27 — SUPERSEDES D19)**: mirror the socios PUT. Compute finals BEFORE the transaction: `finalSocioIds = body.socioIds !== undefined ? validated(body.socioIds) : current socio_aportes ids for :id`; `finalGrupoIds = body.grupoIds !== undefined ? validated(body.grupoIds) : current join ids for :id` (preserve-when-omitted). One `db.transaction()`: (1) update the scalar fields (validated via `validarAporte`; body `id` ignored, D14); (2) if `socioIds` declared → `tx.delete(socio_aportes).where(aporteId = id)` then insert `finalSocioIds` (atomic replace); (3) if `grupoIds` declared → `tx.delete(aportes_definicion_grupos).where(definitionId = id)` then insert `finalGrupoIds`; (4) target set = `finalSocioIds` ∪ current members of ALL `finalGrupoIds` (deduped); (5) filter permitted; `defNueva = { ...updated, grupoIds: finalGrupoIds }` (hydrated from the FINAL join state so `socioHoldsAporte` evaluates correctly); (6) run D13 `generarAportes` → generates ONLY MISSING records; removals NEVER delete generated records (the `aportes` table is only ever inserted to); (7) respond `200 { definiciones, generados }` (was `Aporte[]`).
- [x] **GET / (D28)**: hydrate EVERY definition — `defs` → `grupoIdsPorDefinicion(ids)` (1 batch query) + `socioIdsPorDefinicion(ids)` (sibling batch helper over `socio_aportes`, `aporteId → socioId[]` — add it next to `grupoIdsPorDefinicion` in `lib/aportes.ts` or local to the route); return `{ ...d, grupoIds: map.get(d.id) ?? [], socioIds: map.get(d.id) ?? [] }` per def — required for faithful edit pre-fill.
- [x] **DELETE /:id (D28)**: 409 guard UNCHANGED (D10: `socio_aportes.aporteId` reference OR `aportes.aporte_id` reference — join rows are definition-owned metadata and do NOT trigger 409); wrap the delete in one `db.transaction()`: `tx.delete(aportes_definicion_grupos).where(definitionId = id)` THEN `tx.delete(aportes_definicion).where(id)` (with `foreign_keys=ON` and `ON DELETE no action`, deleting the parent with join rows would throw); response = full definitions list.
- **Depends on**: T1.1 (join table), T1.2 (types), T2.1 (helpers).
- **Verification**: `pnpm typecheck`; spec scenarios (automated in T4.1/T4.2): POST `grupoIds: [g1, g2]` → deduped union `generados.count === 3` (s3 in both groups → ONE record); `grupoIds` + `socioIds` union deduped on overlap; unknown `grupoId` → 400 with nothing created; non-array → 400; absent/`[]` → global; PUT replace-when-declared (both sets replaced, old rows removed, already-generated records REMAIN); PUT preserve-when-omitted (`{ monto: 80 }` keeps sets, re-save no-op `count: 0`); PUT adding a group generates ONLY missing; PUT id immutability; PUT 404; GET catalog carries `grupoIds` + `socioIds` per def; DELETE with join rows → 200 with join rows gone (no FK violation); DELETE with assignments/records → 409 unchanged.

### T2.3 [api] `packages/api/src/routes/socios.ts` — `aportesInheritedPorSocio` via join + def-dedup stable order (D29)

- [x] `gruposPorSocio` membresias query gains `.orderBy(sql\`rowid\`)` so additional groups are returned in deterministic insertion order (the order the client sent in POST) — needed for the stable attribution order.
- [x] Rewrite `aportesInheritedPorSocio`: per socio build the group id list in STABLE order — `[grupoPrimarioId]` first, then additional groups from `gruposPorSocio` (rowid order); ONE batch query over the join table: `SELECT definition_id, grupo_id FROM aportes_definicion_grupos WHERE grupo_id IN (socioGroupIds)` + one batch for definition names + one for group names (3 queries total, no N+1).
- [x] Apply def-dedup: iterate the socio's groups in stable order; for each group, for each join row of that group, add the definition to the result map ONLY if not already present (`if (!set.has(d.id)) set.set(d.id, { id, nombre, grupoId, grupoNombre })`) — the FIRST matching group in stable order wins (primary group first, else earliest additional membership by rowid).
- [x] Keep `armarSocio`'s existing direct-assignment dedup unchanged (`inherited.filter((i) => !directos.has(i.id))`); `AporteInherited` shape unchanged; `definicionesFinales` unchanged (it consumes the hydrated defs from T2.1).
- [x] `POST`/`PUT` socio generation logic unchanged (D16) — the group-scoped half now resolves through the join table via the rewritten `definicionesDeGrupos`.
- **Depends on**: T1.1, T2.1 (join query + hydrated defs).
- **Verification**: `pnpm typecheck`; spec scenarios (automated in T4.2): def-dedup — definition with `grupoIds: ["g1", "g2"]`, socio primary in g1 + additional in g2 → EXACTLY ONE chip with `grupoId: "g1"`; no-primary match → earliest additional membership by rowid wins; direct-assignment dedup and read-only chips unchanged.

### T2.4 [api] `packages/api/src/routes/grupos.ts` — DELETE guard via join table (D30)

- [x] Add a THIRD reference check in `grupos.delete('/:id')` BEFORE the existing `primario`/`adicional` checks: `SELECT definition_id FROM aportes_definicion_grupos WHERE grupo_id = :id` → if found return `409 { error: 'Cannot delete: group is referenced by an aporte definition' }`.
- [x] Leave the existing primary-membership and `socio_grupos` checks and the `200` success path unchanged (the guard is additive; the group stays in the catalog on any 409).
- **Depends on**: T1.1 (join table).
- **Verification**: `pnpm typecheck`; spec scenario "Delete a group referenced by an aporte definition join row is rejected" (automated in T4.2): definition with `grupoIds` including g1, no socio references g1 → `DELETE /api/grupos/g1` → 409 with the definition-specific message; unused group → 200.

## Phase 3: UI — Component + Integration

### T3.1 [ui] `packages/ui/src/components/multi-select.tsx` — hand-rolled searchable MultiSelect (D31)

- [x] Create `packages/ui/src/components/multi-select.tsx` (NEW): hand-rolled, ZERO new dependencies (lucide-react `X` already in `@otb/ui`).
- [x] Export the contract: `export type MultiSelectOption = { value: string; label: string };` and `export type MultiSelectProps = { options: MultiSelectOption[]; selected: string[]; onChange: (values: string[]) => void; placeholder?: string; searchPlaceholder?: string; emptyLabel?: string; disabled?: boolean; excludeValues?: string[] };` and `export const MultiSelect: React.FC<MultiSelectProps>`.
- [x] **Filter-as-you-type**: case-insensitive substring match over `label`; the dropdown lists only REMAINING options — those not in `selected` and not in `excludeValues`; typing resets the active index.
- [x] **Chips**: selected values render as removable chips, each with a lucide `X` button (removes via `onChange`); `flex flex-wrap` for ~360px.
- [x] **Dropdown**: absolutely positioned INSIDE the control (relative wrapper, `absolute z-10`) — deliberately NOT teleported so it stacks correctly inside the hand-rolled `z-50` modal.
- [x] **Keyboard**: `↑`/`↓` move the highlighted option (`aria-activedescendant`), `Enter` toggles selection of the highlighted option (or opens the dropdown when closed), `Escape` closes; focus returns to the filter input on close.
- [x] **ARIA**: container `role="combobox"` with `aria-expanded` + `aria-controls`; filter input `aria-autocomplete="list"` + `aria-activedescendant`; dropdown `role="listbox"` with `id`; each option `role="option"` with `aria-selected`; no-match shows `emptyLabel` with `role="status"`.
- [x] **Styling**: reuse `Input`-aligned classes (`border-gray-300 rounded-md text-sm focus-visible:ring-blue-600`); chips in the blue pill style already used in `socios.tsx` (`border-blue-200 bg-blue-50 text-blue-700`); `disabled` mirrors `Input` (`disabled:cursor-not-allowed disabled:opacity-50`).
- [x] Export `MultiSelect` from `packages/ui/src/index.ts`.
- **Depends on**: none (fully independent new file — the cleanest standalone slice).
- **Verification**: `pnpm typecheck` (ui) + `pnpm build` (ui) pass; export resolves; component compiles against the props contract (consumers land in T3.2/T3.3).

### T3.2 [web] `apps/web/src/routes/aportes.tsx` — MultiSelects on create AND edit (D32, SUPERSEDES D21)

- [x] Replace the "Asignar a" radio/checkbox/single-`<select>` block (D21 exclusive modes) with TWO MultiSelects: a **Socios** MultiSelect (options = the existing `permitidos` filter — socios whose estado permits `aportes`, unchanged) and a **Grupos** MultiSelect (options = `grupos`).
- [x] Component state replaces the radio mode: `selectedSocioIds: string[]` + `selectedGrupoIds: string[]`; `openDefinicionEdit` pre-fills them from `a.socioIds`/`a.grupoIds` (requires the T2.2 GET hydration); `openDefinicionCreate` resets both to `[]`.
- [x] Drop `aplicaGrupoId` from the definition form's zod schema.
- [x] Submit ALWAYS declares both arrays (replace semantics; `[]` = cleared/global): create AND edit payloads both carry `socioIds` + `grupoIds`.
- [x] Edit submit: the PUT returns `generados` → show the D22 toast "Se generaron N cobro(s)" and call `fetchAporteRegistros()` to refresh the cobro list (same flow as create).
- [x] Definition list row: render ONE Badge per assigned group instead of the single "Grupo:" badge, with a `+N` overflow badge when the count exceeds 3 (first 2 + `+N`).
- [x] Keep the live cobro-count hint, updated to compute the deduped union of members across ALL selected groups ∪ selected socios.
- **Depends on**: T2.2 (PUT semantics + GET hydration), T3.1 (component), T3.4 (store response shape).
- **Verification**: `pnpm typecheck` (web) + `pnpm build` (web); manual dev-server smoke: create + edit with both MultiSelects pre-filled, filter-as-you-type, chips + ×, ~360px wrap, dropdown inside the modal, per-group badges + `+N`, edit toast + cobro list refresh.

### T3.3 [web] `apps/web/src/routes/socios.tsx` — MultiSelect for `aporteIds` + `grupoAdicionalIds` (D32)

- [x] Replace the `aporteIds` pill toggles with a MultiSelect whose options = `selectAportesActivos(aportes)` (active definitions only — inactive not assignable).
- [x] Replace the `grupoAdicionalIds` pill toggles with a MultiSelect whose options = `grupos` with `excludeValues={[form.watch('grupoPrimarioId')]}` — preserves the "primary ∉ additional" invariant (the existing `handlePrimaryChange` cleanup stays as defense-in-depth).
- [x] Wire `onChange` handlers into the existing zod form fields (`aporteIds`, `grupoAdicionalIds`) so the saved payload is unchanged.
- **Depends on**: T3.1 (component).
- **Verification**: `pnpm typecheck` (web); manual smoke: opening `grupoAdicionalIds` never lists the primary group; `aporteIds` lists only active definitions; save round-trips the arrays.

### T3.4 [web] `apps/web/src/stores/app.store.ts` — `updateAporte` payload/response (D32)

- [x] Change the `updateAporte` interface to `(id: string, data: Partial<AporteInput>) => Promise<GeneracionResult>`: parse the new `{ definiciones, generados }` PUT response, `set({ aportes: definiciones })`, and RETURN `generados` so the caller can toast the count.
- [x] `addAporte` unchanged apart from the `grupoIds` field name passing through (any payload construction that referenced `aplicaGrupoId` renames to `grupoIds`).
- **Depends on**: T1.2 (types), T2.2 (response shape).
- **Verification**: `pnpm typecheck` (web) passes; store compiles against `CrearDefinicionResponse` reused for PUT.

## Phase 4: Testing — Helpers + Suite Reworks + New Coverage

### T4.1 [test] `packages/api/test/helpers.ts` + rework the 5 suites (mechanical `aplicaGrupoId` → `grupoIds`)

- [x] **`helpers.ts`**: `limpiarDatos()` also `DELETE FROM aportes_definicion_grupos`; the seed INSERT into `aportes_definicion` drops the `aplica_grupo_id` column; `crearDefinicion` overrides switch from `aplicaGrupoId: g1` to `grupoIds: [g1]` (helpers return the hydrated def, so assertions move from `def.aplicaGrupoId` to `def.grupoIds`).
- [x] **`aporte-definicion.test.ts`**: mechanical rework; `'aplicaGrupoId is invalid'` test becomes `'grupoIds contains an invalid group'`; add raw-SQL migration asserts for 0007 (join table created; backfill moved the `aplica_grupo_id` rows; re-running the backfill inserts nothing; column dropped; seeded defs global with no join rows).
- [x] **`socios-aportes.test.ts`**: mechanical rework of group-scoped fixtures to the join shape (join fixtures via the `grupoIds` override); single-group inheritance scenarios keep their semantics through the join table.
- [x] **`aporte-dedup.test.ts`**: mechanical rework; keep the cross-path raw-SQL dedup matrix (`SELECT socio_id, aporte_id, mes, gestion, COUNT(*) ... GROUP BY 1,2,3,4 HAVING COUNT(*) > 1` is empty) now flowing through the join table.
- [x] **`aportes-generacion.test.ts`**: mechanical rework of any group fixtures to `grupoIds` (generation tests keep targeting explicit past gestions so manual endpoints still have rows to create — unchanged from the archived change).
- [x] **`aportes-bulk-all-pagos.test.ts`**: mechanical rework if group fixtures are used; endpoints retained as-is (D17).
- **Depends on**: T1.1 (join table + migration), T2.2/T2.3/T2.4 (new behavior).
- **Verification**: `pnpm test` (api) — all 5 suites green on the M:N shape; `limpiarDatos()` leaves no join rows between tests (no cross-test pollution).

### T4.2 [test] NEW coverage — multi-group, PUT semantics, guard, hydration, cleanup, def-dedup

- [x] **Multi-group POST union dedup**: `grupoIds: ["g1", "g2"]` where s3 is a member of BOTH → `aportes_definicion_grupos` contains both rows, records generated exactly once per socio, `generados.count === 3`; `grupoIds` + `socioIds` union deduped on overlap (spec scenario "Create with socioIds and grupoIds resolves the union").
- [x] **PUT replace-when-declared**: definition with `socioIds: ["s1","s2"]` + `grupoIds: ["g1"]` → PUT `{ socioIds: ["s3"], grupoIds: ["g2"] }` → `socio_aportes` exactly (s3), join exactly (g2), records generated for s3 + g2 members, ALREADY-generated records for s1/s2/g1 members REMAIN (spec scenario "PUT replaces a declared assignment set atomically").
- [x] **PUT preserve-when-omitted**: PUT `{ monto: 80 }` (no assignment fields) → both sets intact, re-save no-op `generados.count === 0` (spec scenario "PUT without an assignment field preserves it").
- [x] **PUT missing-only generation**: PUT `{ grupoIds: ["g1", "g2"] }` → g1 members' records NOT duplicated, g2 members' records generated, count reflects only the new records (spec scenario "PUT adding a new group generates only the missing records").
- [x] **Groups DELETE 409 via join**: group referenced ONLY by an `aportes_definicion_grupos` row (no socios) → 409 with `'Cannot delete: group is referenced by an aporte definition'`, group remains in the catalog; unused group → 200 (spec grupos scenario "Delete a group referenced by an aporte definition join row is rejected").
- [x] **Catalog hydration**: GET `/api/aportes-definicion` → every def carries `grupoIds` + `socioIds`; "d-g1" → `{ grupoIds: ["g1"], socioIds: ["s1"] }`; `ap-mensual` → `{ grupoIds: [] }` (spec scenario "List returns the full catalog of definitions with hydration").
- [x] **Definition DELETE join cleanup**: definition with join rows but no assignments/records → 200, definition gone, NO `aportes_definicion_grupos` row references it (no FK violation) (spec scenario "Delete a definition with group join rows cleans them in the same transaction").
- [x] **Chip def-dedup**: definition with `grupoIds: ["g1", "g2"]`, socio primary in g1 + additional in g2 → `aportesInherited` contains it EXACTLY ONCE with `grupoId: "g1"`; with NO primary match → earliest additional membership by `socio_grupos` rowid wins (spec socios scenarios "Def-dedup — a multi-group definition renders ONE chip" + "with no primary match the earliest additional membership wins").
- **Depends on**: T2.2, T2.3, T2.4 (behavior), T4.1 (helper shape).
- **Verification**: `pnpm test` (api) — all new scenarios green; full api suite (baseline + new) green.

## Phase 5: Verification

### T5.1 [all] Final verification gate

- [x] Full test run: `pnpm test` at the repo root (all workspaces; api suites incl. the reworked 5 + new coverage green).
- [x] Typecheck across packages: `pnpm typecheck` (core, db, api, ui, web — or `pnpm nx run-many -t typecheck` per repo convention).
- [x] Web build: `pnpm build` (web) compiles (MultiSelect imports resolve from `@otb/ui`).
- [x] Real-DB migrate smoke: `pnpm db:migrate` (workdir `packages/db`) against the real `otb.db` applies `0007_*` cleanly; confirm exactly 1 backfilled join row (the "test" definition → "Manzano A"), `aplica_grupo_id` column gone, seeded definitions global.
- [ ] Manual dev-server smoke (if harness available): MultiSelect in the definition modal (create + edit pre-fill, filter, chips + ×, keyboard, ~360px, dropdown inside z-50 modal); per-group badges + `+N`; socios form MultiSelects with `excludeValues`; edit toast + cobro list refresh.
- **Depends on**: all prior tasks.
- **Verification**: exit code 0 for every command above; `git status` shows only the intended files; no `aplicaGrupoId`/`aplica_grupo_id` references remain anywhere in `packages/*` or `apps/*`.

---

## Scenario Coverage Traceability

| Spec scenario | Task(s) |
|---|---|
| **aporte-definitions** | |
| Migration 0007 backfills single-group assignments and drops the column | T1.1, T4.1 |
| Re-running the backfill does not duplicate join rows | T1.1, T4.1 |
| Edit mode pre-fills current assignments into the MultiSelects | T2.2 (D28 hydration), T3.2 |
| Filter-as-you-type narrows the dropdown options | T3.1, T3.2 |
| Removing all group chips saves the definition as global | T2.2 (PUT `[]`), T3.2 |
| The definition list renders one badge per assigned group | T3.2 |
| List returns the full catalog of definitions with hydration | T2.2 (D28), T4.2 |
| Create without assignment (a nadie) → 0 records, `grupoIds: []` | T2.2, T4.1 |
| Create with a client-supplied id ignores it, server UUID | T2.2 (D14 kept), T4.1 |
| Create with socioIds assignment generates records (count 4) | T2.2, T4.1 |
| Create with socioIds + grupoIds → union deduped on overlap (count 3) | T2.2 (D26), T4.2 |
| Create with multiple grupoIds → deduped union (s3 once, count 3) | T2.2 (D26), T4.2 |
| Create assigned to a non-permitted socio → 201, assignment kept, 0 records | T2.2 (bulk-exclusion), T4.1 |
| Create with unknown socioId → 400, nothing created | T2.2 (D18 kept), T4.1 |
| Create with unknown grupoId → 400, nothing created | T2.2 (validarGrupoIds), T4.1 |
| Validation 400s (nombre, monto, negative, recurrencia, modalidad, window, non-array grupoIds) | T2.2, T4.1 |
| Create a group-scoped definition generates for CURRENT members, no `socio_aportes` rows | T2.2, T4.1 |
| Update editable fields via PUT | T2.2, T4.1 |
| PUT with an id field does not change the definition id | T2.2 (D14 kept), T4.1 |
| PUT replaces a declared assignment set atomically, records REMAIN | T2.2 (D27), T4.2 |
| PUT without an assignment field preserves it (re-save no-op) | T2.2 (D27), T4.2 |
| PUT adding a new group generates only the missing records | T2.2 (D27), T4.2 |
| Update a nonexistent definition → 404 | T2.2, T4.1 |
| Delete an unused definition → 200 | T2.2, T4.1 |
| Delete a definition with group join rows cleans them in the same transaction | T2.2 (D28), T4.2 |
| Delete a nonexistent definition → 404 | T2.2, T4.1 |
| Delete a definition with assignments → 409 | T2.2 (guard kept), T4.1 |
| Delete a definition with generated records → 409 | T2.2 (guard kept), T4.1 |
| Delete a definition referenced only by an inactive status → 200 | T2.2, T4.1 |
| Fresh seed contains `ap-mensual` as global (`grupoIds: []`) | T1.1 (seed unchanged), T4.1 |
| Group Application: current members resolve + records at assignment | T2.1 (D25), T2.2, T4.1 |
| Group Application: future members inherit + generate at membership | T2.1 (D25), T2.3 (definicionesFinales), T4.1 |
| Removing a member stops application without deleting records | T2.3, T4.1 |
| A multi-group definition resolves once per socio with the first matching group | T2.3 (D29), T4.2 |
| **socios-estados** | |
| POST socio with a multiselect of aportes generates records per assignment | T2.3 (definicionesFinales), T4.1 |
| POST socio without aporteIds → no direct assignments | T2.3 (kept), T4.1 |
| POST with unknown/inactive/non-array aporte id → 400 | T2.3 (kept validators), T4.1 |
| POST socio whose estado does not permit aportes → 201, assignment kept, 0 records | T2.3 (kept bulk-exclusion), T4.1 |
| PUT replaces the assignment set atomically without deleting records | T2.3 (kept socios PUT), T4.1 |
| PUT without aporteIds preserves existing assignments (idempotent re-save) | T2.3 (kept), T4.1 |
| PUT adding a new aporte generates only the missing records | T2.3 (kept), T4.1 |
| Full replace of a socio keeps the multiselect intact | T2.3 (kept), T4.1 |
| Socio save generates records for group-scoped defs of the final membership through the join table | T2.1 (definicionesDeGrupos join), T2.3, T4.1 |
| The additional-groups MultiSelect excludes the primary group | T3.3 (`excludeValues`) |
| Inherits from the primary group | T2.3 (D29), T4.1 |
| Inherits from a secondary group | T2.3 (D29), T4.1 |
| Inherits from both primary and secondary groups (two definitions) | T2.3 (D29), T4.1 |
| Def-dedup — multi-group definition renders ONE chip with the primary group | T2.3 (D29), T4.2 |
| Def-dedup — with no primary match the earliest additional membership wins | T2.3 (D29 rowid order), T4.2 |
| A future member inherits automatically and receives records at membership time | T2.3 (kept), T4.1 |
| Removing a member stops inheritance unless directly assigned, without deleting records | T2.3 (kept), T4.1 |
| Direct assignment deduplicates the inherited chip | T2.3 (armarSocio kept), T4.1 |
| Inherited chips are read-only | T3.3 (form), T4.1 |
| **grupos** | |
| Create/Update a group; 400 without nombre; 404 updates | Unchanged behavior — re-verified T4.1 kept tests, T5.1 |
| Delete a group with socios → 409 | T2.4 (guard kept), T4.1 |
| Delete a group used only as additional → 409 | T2.4 (guard kept), T4.1 |
| Delete a group referenced by an aporte definition join row → 409 (orphan-FK gap fixed) | T2.4 (D30), T4.2 |
| Delete an unused group → 200 | T2.4 (guard kept), T4.1 |
| Delete a nonexistent group → 404 | Unchanged — re-verified T5.1 |

---

## Review Workload Forecast

**Estimated changed lines** (authored additions + deletions; generated goldens excluded from the authored count but shipped in the PR):

| File | Action | Est. changed lines (add+del) |
|------|--------|-----------------------------|
| `packages/db/src/schema/aportes-definicion-grupos.ts` | Create | ~22 |
| `packages/db/src/schema/aportes-definicion.ts` | Modify | ~10 (column + import removed, comment) |
| `packages/db/src/schema.ts` | Modify | ~1 |
| `packages/db/drizzle/0007_*.sql` + `meta/_journal.json` + `0007_snapshot.json` | Create (generated) | ~90 (**excluded** from authored count; included in snapshot identity) |
| `packages/core/src/index.ts` | Modify | ~12 |
| `packages/api/src/lib/aportes.ts` | Modify | ~85 |
| `packages/api/src/routes/aportes-definicion.ts` | Modify | ~180 |
| `packages/api/src/routes/socios.ts` | Modify | ~65 |
| `packages/api/src/routes/grupos.ts` | Modify | ~10 |
| `packages/ui/src/components/multi-select.tsx` | Create | ~230 |
| `packages/ui/src/index.ts` | Modify | ~1 |
| `apps/web/src/routes/aportes.tsx` | Modify | ~220 |
| `apps/web/src/routes/socios.tsx` | Modify | ~55 |
| `apps/web/src/stores/app.store.ts` | Modify | ~25 |
| `packages/api/test/helpers.ts` | Modify | ~30 |
| `packages/api/test/aporte-definicion.test.ts` | Modify | ~150 |
| `packages/api/test/socios-aportes.test.ts` | Modify | ~110 |
| `packages/api/test/aporte-dedup.test.ts` | Modify | ~50 |
| `packages/api/test/aportes-generacion.test.ts` | Modify | ~35 |
| `packages/api/test/aportes-bulk-all-pagos.test.ts` | Modify | ~15 |
| **Total authored** | | **≈ 1,306** (call it **1,250–1,400**) |

Notes on the estimate: test churn (T4.1+T4.2) is the largest single contributor (~390); the UI component + web route work (T3.1–T3.3) is next (~505); the backend flip (T1.1–T2.4) is ~375. The migration + journal + snapshot are drizzle-generated goldens — excluded from the authored threshold but must be committed with T1.1 and verified (in-memory `migrarDb` applies `0007_*` automatically; real DB backfills exactly 1 row — the "test" definition → "Manzano A" — then drops the column).

- **400-line budget risk: High** (≈1,306 authored lines, ≈3.3× the 400 threshold).
- **Chained PRs recommended: Yes** (3 slices; see boundaries below).
- **Decision needed before apply: Yes** — the design's "no interim state" constraint (D23's `DROP COLUMN aplica_grupo_id` couples the migration to the API routes AND to the API test suites, since the suites seed that column; the core-type change couples the web app, which references `aplicaGrupoId` in `aportes.tsx`/`app.store.ts`) means the backend flip cannot be split from its tests, and Slice B sits at the edge of the 800-line review budget. The team must accept the stacked merge order (B merged immediately before C) or record an accepted `size:exception` for Slice B.

**Recommended slice boundaries** (each slice is a coherent review unit; commit-by-work-unit inside each; slices B and C are STACKED — B must merge immediately before C to respect "no interim state"):

1. **Slice A — MultiSelect component (T3.1): ~230 authored.** New `multi-select.tsx` + index export; zero coupling to schema/types/routes. *Verify:* `pnpm typecheck` + `pnpm build` (ui). *Mergeable:* yes, standalone — the export is additive and unused until Slice C.
2. **Slice B — Backend M:N flip (T1.1, T1.2, T2.1, T2.2, T2.3, T2.4, T4.1, T4.2): ~775 authored.** Migration 0007 (DROP COLUMN) + core types + lib helpers + all three API routes + helpers/suite reworks + new coverage. This MUST land as one PR: the moment `aplica_grupo_id` drops, every suite that seeds it breaks simultaneously, so the test rework cannot be split out without a red build. *Verify:* `pnpm typecheck` (core/db/api) + full api vitest run. ⚠️ This slice sits at the edge of the 800-line review budget — the chained-PR decision above is where the team accepts it or adjusts the review budget. Internally commit by work unit: (T1.1+T1.2 schema/types + helpers/migration asserts) → (T2.1+T2.2 + aporte-definicion suite) → (T2.3 + socios-aportes suite) → (T2.4 + groups guard scenario) → (T4.2 new coverage).
3. **Slice C — Web integration + final verification (T3.2, T3.3, T3.4, T5.1): ~315 authored.** Store payload/response + both route flips + final gate. *Verify:* `pnpm typecheck`, web `vite build`, `pnpm test` full run, real-DB `pnpm db:migrate` smoke. *Mergeable:* last slice — merged immediately after B (stacked) so main never sits with a web build that still references the removed `aplicaGrupoId`.
