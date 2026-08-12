# Aporte Definitions — Dynamic Aporte Definitions with Many-to-Many Assignment

## Capability

`aporte-definitions` (NEW — replaces the obsolete `aporte-types` capability)

> **Delta** from `openspec/changes/aporte-multigrupo-multiselect` (archived 2026-08-06): group application becomes M:N — `Aporte.aplicaGrupoId: string | null` is replaced by `Aporte.grupoIds: string[]` (empty array = global), persisted in the NEW join table `aportes_definicion_grupos (definition_id, grupo_id)`; migration `0007` backfills the old single-group assignments (`INSERT OR IGNORE`) and then DROPs the `aplica_grupo_id` column (single source of truth). `POST` accepts `grupoIds?: string[]` (each id MUST exist else 400; absent/`[]` = global) and the resolved target set becomes the deduped UNION of the direct `socioIds` and the CURRENT members (primary OR additional) of ALL `grupoIds`; the D13 dedup generator is UNCHANGED. `PUT /:id` accepts `socioIds?`/`grupoIds?` with replace-when-declared / preserve-when-omitted semantics (supersedes the archived D19 field-edit-only clause), generates only MISSING records, NEVER deletes generated records, and responds `{ definiciones, generados }` (was `Aporte[]`). `GET /` hydrates `grupoIds` AND `socioIds` per definition (batch, no N+1) for edit pre-fill. `DELETE /:id` removes the definition's join rows in the SAME transaction before deleting the definition (409 guard unchanged). "Asignar a" becomes a searchable MultiSelect (chips with ×, filter-as-you-type) for Socios AND Grupos on create AND edit; the definition list renders one Badge per assigned group.

## Description

Reworks the `tipos_aporte` catalog into `aportes_definicion`: the aporte is now the dynamic DEFINITION itself, no longer a single-amount catalog row. Each definition carries a server-generated `id` (UUID; seeded slugs such as `ap-mensual` remain as the stable internal ids of the seeded definition rows but are never client-supplied), `nombre` (e.g. "Cuota Social Mensual"), `monto` (Bs), `recurrencia` (`mensual|anual|unico|extraordinario`), `inicio`/`fin` (vigencia window), `modalidadPago` (`cuotas|parciales|pago_unico`), `activo`, and M:N group application via `grupoIds` — resolved dynamically through the join table `aportes_definicion_grupos` (the `socio_aportes` join is never materialized for group members, but cobro records ARE generated at assignment for current members and at membership time for future members). Assignment to socios is many-to-many through the join `socio_aportes` (same pattern as `socio_grupos`). Creation is a single unified step: `POST /api/aportes-definicion` defines the aporte AND assigns it to socios (`socioIds`), to groups (`grupoIds`), or to nobody, generating cobro records immediately for the resolved target set (current gestión) and responding `201 { definiciones, generados }`. CRUD is exposed by the reworked definition router (formerly `tipos-aporte`); `DELETE` returns 409 when the definition has generated records (`aportes.aporteId`) or assignments (`socio_aportes`) — group join rows are definition-owned metadata removed in the same transaction and do NOT trigger 409. The unified definition + assignment UI lives in the "Aportes" section's existing create tab — NOT in Configuración (user clarification).

## Endpoints / Components

| Location | Type | Description |
|----------|------|-------------|
| `packages/db/src/schema/aportes-definicion.ts` | Rework (was `tipos-aporte.ts`) | `aportes_definicion` (id, nombre, monto, recurrencia, inicio, fin, modalidadPago, activo — group application moved to the join table) |
| `packages/db/src/schema/aportes-definicion-grupos.ts` | New | `aportes_definicion_grupos` join (definitionId+grupoId composite PK, pattern `socio_grupos`) |
| `packages/db/drizzle/0007_*.sql` + `meta/_journal.json` + `0007_snapshot.json` | New (generated) | Migration 0007: CREATE join table → backfill `aplica_grupo_id` rows → DROP COLUMN |
| `packages/db/src/schema/socio-aportes.ts` | New | `socio_aportes` join (socioId+aporteId composite PK, pattern `socio_grupos`) |
| `packages/db/src/schema/aportes.ts` | Modified | Gains `aporteId` FK → `aportes_definicion.id` (records = APORTE_REGISTRO / cobro) |
| `packages/db/src/schema/socios.ts` | Modified | DROP `tipoAporteId` and legacy `aporteBase` |
| `packages/db/src/schema.ts` | Modified | Export new/reworked tables |
| `packages/db/src/seed.ts` | Modified | Seed default definitions (e.g. `ap-mensual` "Cuota Social Mensual") |
| `packages/core/src/index.ts` | Modified | `Aporte` (definition) with `grupoIds`, `AporteInput`, `SocioAporte` join type |
| `packages/api/src/routes/aportes-definicion.ts` | Rework | Definition CRUD (renamed path) with 409 delete guard, M:N `grupoIds` assignment, PUT replace/preserve semantics |
| `packages/api/src/routes/socios.ts` | Modified | `aportesInherited` def-dedup through the join table |
| `packages/api/src/routes/grupos.ts` | Modified | DELETE 409 guard via `aportes_definicion_grupos` (orphan-FK fix) |
| `packages/api/src/index.ts` | Modified | Mount reworked definition router |
| `packages/ui/src/components/multi-select.tsx` | New | Hand-rolled searchable MultiSelect (chips with ×, filter-as-you-type, keyboard, ARIA, zero new deps) |
| `packages/ui/src/index.ts` | Modified | Export `MultiSelect` |
| `apps/web/src/routes/aportes.tsx` | Modified | Two MultiSelects (Socios + Grupos) on create AND edit; per-group badges |
| `apps/web/src/routes/socios.tsx` | Modified | MultiSelect for `aporteIds`/`grupoAdicionalIds` with `excludeValues` |
| `apps/web/src/stores/app.store.ts` | Modified | `aportes` (definitions) state + CRUD actions; `updateAporte` returns `GeneracionResult` |

## Requirements

### Requirement: Definition CRUD — Aportes

The system MUST expose full CRUD on `aportes_definicion` via the definition router (formerly `/api/tipos-aporte`): `GET /` (full list), `POST /`, `PUT /:id`, `DELETE /:id`. `POST` MUST validate `nombre`, `monto` (number >= 0), `recurrencia` (one of `mensual|anual|unico|extraordinario`), `inicio`/`fin` (valid window: `fin` >= `inicio` when both provided), `modalidadPago` (one of `cuotas|parciales|pago_unico`), `grupoIds` (OPTIONAL array; each id MUST reference an existing group else the request is rejected with 400; absent or `[]` = global), `socioIds` (OPTIONAL array; each id MUST reference an existing socio else the request is rejected) and `activo` (0/1, default 1). The definition `id` SHALL be generated by the server (UUID); a client-supplied `id` in the POST body SHALL be IGNORED. `POST` with an assignment (`socioIds` and/or `grupoIds`) SHALL create the definition and GENERATE cobro records in the same transaction for the resolved target set — the deduped UNION of the direct `socioIds` and the CURRENT members (primary OR additional membership) of ALL `grupoIds`, deduplicated by socio — scoped to socios whose estado permits `aportes`, for the current gestión, one record per month of the definition's `recurrencia` ∩ `inicio`/`fin` window — and SHALL respond `201 { definiciones, generados: { count, items } }`. `POST` with neither `socioIds` nor `grupoIds` (assigned "a nadie") SHALL create the definition with NO generated records. A definition with empty `grupoIds` SHALL be global (applies to no group). `PUT /:id` MUST NOT allow changing the definition `id`; PUT MUST accept `socioIds?` and `grupoIds?` with replace-when-declared / preserve-when-omitted semantics (mirroring the socios PUT): a declared `socioIds` SHALL atomically replace the definition's `socio_aportes` rows in the same transaction; a declared `grupoIds` SHALL atomically replace the definition's `aportes_definicion_grupos` rows; an omitted field SHALL preserve the current assignment. PUT SHALL run the dedup generator on the final target set (declared/omitted combined), generating only MISSING records, SHALL NEVER delete already-generated records when an assignment is removed, and SHALL respond `200 { definiciones, generados: { count, items } }`. `GET /` SHALL return each definition hydrated with `grupoIds` AND `socioIds` (batch queries — no N+1) for faithful edit pre-fill. `DELETE /:id` SHALL delete the definition's `aportes_definicion_grupos` join rows inside the same transaction before deleting the definition.

#### Scenario: List returns the full catalog of definitions with hydration

- GIVEN seeded definitions exist, including `ap-mensual` "Cuota Social Mensual", and a definition "d-g1" with `grupoIds: ["g1"]` and `socioIds: ["s1"]`
- WHEN GET /api/aportes-definicion
- THEN the response SHALL be a 200 array with all definitions including `id`, `nombre`, `monto`, `recurrencia`, `inicio`, `fin`, `modalidadPago`, `activo`, `grupoIds` and `socioIds`
- AND "d-g1" SHALL carry `grupoIds: ["g1"]` and `socioIds: ["s1"]`
- AND `ap-mensual` SHALL carry `grupoIds: []`

#### Scenario: Create a definition without assignment (a nadie)

- GIVEN no definition "Cuota Social Mensual" exists
- WHEN POST /api/aportes-definicion with `{ nombre: "Cuota Social Mensual", monto: 50, recurrencia: "mensual", inicio: "2025-01-01", fin: "2025-12-31", modalidadPago: "cuotas", activo: 1 }`
- THEN the response SHALL be 201 with `{ definiciones, generados }`
- AND the new definition SHALL have monto=50, recurrencia="mensual" and activo=1
- AND `grupoIds` SHALL be [] (global definition)
- AND `generados.count` SHALL be 0 (no assignment — "a nadie", no records yet)

#### Scenario: Create with a client-supplied id ignores it and generates a server UUID

- WHEN POST /api/aportes-definicion with `{ id: "ap-custom-slug", nombre: "X", monto: 50, recurrencia: "mensual" }`
- THEN the response SHALL be 201
- AND no definition with id="ap-custom-slug" SHALL exist
- AND the returned `definiciones` SHALL contain the new definition with a server-generated UUID `id`

#### Scenario: Create with socioIds assignment generates records for the direct socios

- GIVEN socios "s1" and "s2" exist with estados that permit "aportes"
- WHEN POST /api/aportes-definicion with `{ nombre: "Fondo Deportes", monto: 20, recurrencia: "mensual", inicio: "2025-03-01", fin: "2025-04-30", modalidadPago: "cuotas", socioIds: ["s1", "s2"] }`
- THEN the response SHALL be 201 with `{ definiciones, generados }`
- AND `socio_aportes` SHALL contain (s1, <new-id>) and (s2, <new-id>)
- AND cobro records SHALL be generated for s1 and s2 for the current gestión with mes=3 and mes=4 (per recurrence ∩ window) and monto=20 each
- AND `generados.count` SHALL equal 4

#### Scenario: Create with socioIds and grupoIds resolves the union of direct socios and current group members

- GIVEN group "g1" exists with current members "s1" and "s3"
- AND socios "s1", "s3" and the directly-assigned "s2" have estados that permit "aportes"
- WHEN POST /api/aportes-definicion with `{ nombre: "Fondo Mixto", monto: 10, recurrencia: "unico", grupoIds: ["g1"], socioIds: ["s2"] }`
- THEN the response SHALL be 201
- AND `aportes_definicion_grupos` SHALL contain (<new-id>, g1)
- AND cobro records SHALL be generated exactly once for s1, s2 and s3 (union of direct ∪ group members, deduplicated on overlap)
- AND `generados.count` SHALL equal 3

#### Scenario: Create with multiple grupoIds generates records for the deduped union of members across all groups

- GIVEN groups "g1" and "g2" exist; g1 has current members "s1" and "s3"; g2 has current members "s2" and "s3"
- AND socios "s1", "s2" and "s3" have estados that permit "aportes"
- WHEN POST /api/aportes-definicion with `{ nombre: "Fondo Multi Grupo", monto: 10, recurrencia: "unico", grupoIds: ["g1", "g2"] }`
- THEN the response SHALL be 201
- AND `aportes_definicion_grupos` SHALL contain (<new-id>, g1) and (<new-id>, g2)
- AND cobro records SHALL be generated exactly once for s1, s2 and s3 (union of the members of ALL grupoIds, deduplicated by socio — s3 belongs to both groups but gets ONE record)
- AND `generados.count` SHALL equal 3

#### Scenario: Create assigned to a socio whose estado does not permit aportes keeps the assignment but generates 0 records

- GIVEN socio "s2" has an estado that does NOT permit "aportes"
- WHEN POST /api/aportes-definicion with `{ nombre: "Fondo", monto: 10, recurrencia: "unico", socioIds: ["s2"] }`
- THEN the response SHALL be 201 (NO 409)
- AND `socio_aportes` SHALL contain (s2, <new-id>) (assignment preserved)
- AND `generados.count` SHALL be 0 (s2 excluded — bulk-exclusion pattern)

#### Scenario: Create with an unknown socioId is rejected

- WHEN POST /api/aportes-definicion with `{ nombre: "X", monto: 50, recurrencia: "mensual", socioIds: ["fake-socio"] }`
- THEN the response SHALL be 400
- AND no definition SHALL be created

#### Scenario: Create with an unknown grupoId is rejected

- WHEN POST /api/aportes-definicion with `{ nombre: "X", monto: 50, recurrencia: "mensual", grupoIds: ["fake-group"] }`
- THEN the response SHALL be 400
- AND no definition SHALL be created

#### Scenario: Create without nombre is rejected

- WHEN POST /api/aportes-definicion with `{ monto: 50 }`
- THEN the response SHALL be 400 with `{ "error": "nombre is required" }`

#### Scenario: Create without monto is rejected

- WHEN POST /api/aportes-definicion with `{ nombre: "X", recurrencia: "mensual" }`
- THEN the response SHALL be 400 with an error indicating monto is required

#### Scenario: Create with a negative monto is rejected

- WHEN POST /api/aportes-definicion with `{ nombre: "X", monto: -1, recurrencia: "mensual" }`
- THEN the response SHALL be 400 with an error indicating monto must be non-negative

#### Scenario: Create with an invalid recurrencia is rejected

- WHEN POST /api/aportes-definicion with `{ nombre: "X", monto: 50, recurrencia: "semanal" }`
- THEN the response SHALL be 400 with an error indicating recurrencia is invalid

#### Scenario: Create with an invalid modalidadPago is rejected

- WHEN POST /api/aportes-definicion with `{ nombre: "X", monto: 50, recurrencia: "mensual", modalidadPago: "efectivo" }`
- THEN the response SHALL be 400 with an error indicating modalidadPago is invalid

#### Scenario: Create with an inverted vigencia window is rejected

- WHEN POST /api/aportes-definicion with `{ nombre: "X", monto: 50, recurrencia: "mensual", inicio: "2025-12-31", fin: "2025-01-01" }`
- THEN the response SHALL be 400 with an error indicating the window is invalid

#### Scenario: Create a group-scoped definition generates records for current members at assignment

- GIVEN group "g1" exists
- AND socios "s1" and "s2" are current members of g1 with estados that permit "aportes"
- WHEN POST /api/aportes-definicion with `{ nombre: "Fondo Grupo A", monto: 10, recurrencia: "mensual", grupoIds: ["g1"], activo: 1 }`
- THEN the response SHALL be 201 with `{ definiciones, generados }`
- AND the definition SHALL have `grupoIds: ["g1"]`
- AND cobro records SHALL be generated for s1 and s2 (current members at assignment) for the current gestión
- AND NO `socio_aportes` row SHALL exist for (s1, <new-id>) nor (s2, <new-id>) (the join stays dynamic)

#### Scenario: Update editable fields

- GIVEN a definition with id="ap-mensual", nombre="Cuota Social Mensual", monto=50
- WHEN PUT /api/aportes-definicion/ap-mensual with `{ nombre: "Cuota Social Mensual", monto: 60, fin: "2026-12-31" }`
- THEN the response SHALL be 200 with `{ definiciones, generados }`
- AND monto SHALL be 60 and fin SHALL be "2026-12-31"

#### Scenario: PUT with an id field does not change the definition id

- GIVEN a definition with id="ap-mensual"
- WHEN PUT /api/aportes-definicion/ap-mensual with `{ id: "ap-otro", monto: 70 }`
- THEN the response SHALL be 200
- AND the definition SHALL keep id="ap-mensual"
- AND no definition with id="ap-otro" SHALL exist

#### Scenario: PUT replaces a declared assignment set atomically (replace-when-declared)

- GIVEN a definition with `socioIds: ["s1", "s2"]` and `grupoIds: ["g1"]`, and records already generated for the current set
- WHEN PUT /api/aportes-definicion/<id> with `{ socioIds: ["s3"], grupoIds: ["g2"] }`
- THEN `socio_aportes` SHALL contain exactly (s3, <id>) in the same transaction (s1/s2 rows removed)
- AND `aportes_definicion_grupos` SHALL contain exactly (<id>, g2) in the same transaction (g1 row removed)
- AND cobro records SHALL be generated for s3 and the current members of g2 (per recurrence ∩ window, current gestión)
- AND the already-generated records for s1, s2 and g1 members SHALL REMAIN (removals never delete records)
- AND the response SHALL be 200 with `{ definiciones, generados }`

#### Scenario: PUT without an assignment field preserves it (preserve-when-omitted)

- GIVEN a definition with `grupoIds: ["g1"]` and `socioIds: ["s1"]`
- WHEN PUT /api/aportes-definicion/<id> with `{ monto: 80 }` (no socioIds, no grupoIds)
- THEN `aportes_definicion_grupos` SHALL still contain (<id>, g1)
- AND `socio_aportes` SHALL still contain (s1, <id>)
- AND NO new/duplicate cobro records SHALL be created (re-save is a no-op for existing months)

#### Scenario: PUT adding a new group generates only the missing records

- GIVEN a definition with `grupoIds: ["g1"]` whose members already have records
- WHEN PUT /api/aportes-definicion/<id> with `{ grupoIds: ["g1", "g2"] }`
- THEN the records for the already-assigned g1 members SHALL NOT be duplicated
- AND records for the current members of g2 SHALL be generated (current gestión)
- AND the response SHALL report a generated count reflecting only the NEW records

#### Scenario: Update a nonexistent definition returns 404

- WHEN PUT /api/aportes-definicion/fake-id with `{ nombre: "X" }`
- THEN the response SHALL be 404

#### Scenario: Delete an unused definition succeeds

- GIVEN a definition with no assignments, no group join rows and no generated records
- WHEN DELETE /api/aportes-definicion/<id>
- THEN the response SHALL be 200 with the full definitions list
- AND the definition SHALL no longer exist

#### Scenario: Delete a definition with group join rows cleans them in the same transaction

- GIVEN a definition with `grupoIds: ["g1", "g2"]` (join rows exist) but no `socio_aportes` assignments and no generated records
- WHEN DELETE /api/aportes-definicion/<id>
- THEN the response SHALL be 200 (group join rows are FK-owned metadata, NOT a 409 trigger)
- AND the definition SHALL no longer exist
- AND NO `aportes_definicion_grupos` row SHALL reference the deleted definition (removed in the same transaction, no FK violation)

#### Scenario: Delete a nonexistent definition returns 404

- WHEN DELETE /api/aportes-definicion/fake-id
- THEN the response SHALL be 404

### Requirement: DELETE Guard — 409 with Records or Assignments

The system MUST reject `DELETE /:id` with 409 when the definition has either generated aporte records (`aportes.aporteId`) or socio assignments (`socio_aportes.aporteId`), mirroring the `tipos-actividad`/`grupos` guard pattern. The definition SHALL remain in the catalog. Group join rows (`aportes_definicion_grupos`) SHALL NOT trigger the 409 — they are definition-owned metadata removed in the same transaction as the DELETE.

#### Scenario: Delete a definition with assignments is rejected

- GIVEN one or more `socio_aportes` rows reference definition "ap-mensual"
- WHEN DELETE /api/aportes-definicion/ap-mensual
- THEN the response SHALL be 409
- AND the error SHALL indicate the definition is in use (e.g. "No se puede eliminar: hay socios o registros usando este aporte")
- AND the definition SHALL remain in the catalog

#### Scenario: Delete a definition with generated records is rejected

- GIVEN one or more `aportes` rows have aporteId="ap-extra"
- WHEN DELETE /api/aportes-definicion/ap-extra
- THEN the response SHALL be 409
- AND the definition SHALL remain in the catalog

#### Scenario: Delete a definition referenced only by an inactive status succeeds

- GIVEN a definition with activo=0 and no assignments/records
- WHEN DELETE /api/aportes-definicion/<id>
- THEN the response SHALL be 200
- AND the definition SHALL no longer exist

### Requirement: Group Application — grupoIds (M:N, Dynamic, Generation at Assignment/Membership)

The system MUST treat `grupoIds` as a dynamic M:N scoping rule: the definition applies to ALL current AND FUTURE members of ANY of its assigned groups (primary or additional membership), resolved through the join table `aportes_definicion_grupos`. Read-time resolution SHALL stay dynamic — setting `grupoIds` MUST NOT create `socio_aportes` rows for group members (the join is never materialized; inheritance chips stay read-only). Record generation SHALL be event-driven: CURRENT members SHALL receive their cobro records AT ASSIGNMENT (definition creation with `grupoIds`, or socio save that establishes the membership/assignment), and FUTURE members SHALL receive theirs AT MEMBERSHIP time (when the membership is created via socio POST/PUT). A definition assigned to SEVERAL groups SHALL resolve EXACTLY ONCE per socio at read time (def-dedup), attributed to the FIRST matching group in stable order (primary first, then additional groups by membership rowid) (R2). Already-generated records SHALL NEVER be deleted when a member leaves a group.

#### Scenario: Group-scoped definition applies to current members at resolution time and generates records at assignment

- GIVEN definition "d-grupo" has `grupoIds: ["g1"]`
- AND socios "s1" and "s2" are members of g1 (primary or additional)
- WHEN the inherited aportes of s1/s2 are resolved
- THEN both s1 and s2 SHALL resolve "d-grupo" as an applicable definition
- AND NO `socio_aportes` row SHALL exist for (s1, d-grupo) nor (s2, d-grupo)
- AND cobro records for d-grupo SHALL already exist for s1 and s2 (generated at assignment, current gestión)

#### Scenario: Group-scoped definition applies to future members automatically with generation at membership

- GIVEN definition "d-grupo" has `grupoIds: ["g1"]`
- WHEN a NEW socio "s3" is created and added to g1 (no direct assignment)
- THEN s3 SHALL resolve "d-grupo" as an applicable definition without any materialized propagation step
- AND cobro records for d-grupo SHALL be generated for s3 at membership time (per recurrence ∩ window, current gestión)

#### Scenario: Removing a member stops the group application without deleting generated records

- GIVEN socio "s3" is a member of g1 and definition "d-grupo" has `grupoIds: ["g1"]`
- AND cobro records for d-grupo were generated for s3 at membership time
- WHEN s3 is removed from g1 (and has no direct assignment to d-grupo)
- THEN s3 SHALL no longer resolve "d-grupo"
- AND the previously generated cobro records for s3 SHALL remain (NO deletion)

#### Scenario: A multi-group definition resolves once per socio with the first matching group

- GIVEN definition "d-multi" has `grupoIds: ["g1", "g2"]`
- AND socio "s1" has `grupoPrimarioId="g1"` AND is an additional member of g2
- WHEN the inherited aportes of s1 are resolved
- THEN "d-multi" SHALL resolve EXACTLY ONCE for s1 (def-dedup — no chip per (definition × group) pair)
- AND the resolved chip SHALL be attributed to g1 (primary group first in stable order)

### Requirement: Seed of Default Definitions

The system MUST seed at least one default definition, `ap-mensual` ("Cuota Social Mensual"), with `recurrencia='mensual'`, `activo=1`, a vigencia window covering the seed gestion, and `grupoIds: []` (global — seeded definitions SHALL NOT be group-scoped).

#### Scenario: Fresh seed contains the default definition as global

- GIVEN a fresh seed
- THEN `aportes_definicion` SHALL contain a definition with id="ap-mensual", nombre="Cuota Social Mensual", recurrencia="mensual" and activo=1
- AND `ap-mensual` SHALL have `grupoIds: []` (global, no `aportes_definicion_grupos` rows)

### Requirement: M:N Join Table — `aportes_definicion_grupos` and Migration 0007

The system MUST persist the definition↔group application as an M:N relationship in a NEW join table `aportes_definicion_grupos` with a composite primary key `(definition_id, grupo_id)` and FKs to `aportes_definicion(id)` and `grupos(id)`, mirroring the `socio_grupos` pattern exactly. Migration `0007` (next after 0006) MUST be additive-first and SHALL: (1) CREATE the join table; (2) backfill existing single-group assignments with `INSERT OR IGNORE INTO aportes_definicion_grupos (definition_id, grupo_id) SELECT id, aplica_grupo_id FROM aportes_definicion WHERE aplica_grupo_id IS NOT NULL`; (3) `ALTER TABLE aportes_definicion DROP COLUMN aplica_grupo_id` (pattern proven in migration 0005, which dropped FK column `tipo_aporte_id`). After the migration the `aplica_grupo_id` column SHALL NOT exist and the join table SHALL be the single source of truth for group application. Seeded default definitions SHALL remain global (`grupoIds: []`, no join rows).

#### Scenario: Migration 0007 backfills single-group assignments and drops the column

- GIVEN a database where definition "d-grupo" has `aplica_grupo_id="g1"` and definition "d-global" has `aplica_grupo_id IS NULL`
- WHEN migration 0007 runs
- THEN `aportes_definicion_grupos` SHALL contain exactly the row (d-grupo, g1)
- AND the `aplica_grupo_id` column SHALL be dropped from `aportes_definicion`
- AND "d-global" SHALL have NO join rows (remains global)

#### Scenario: Re-running the backfill does not duplicate join rows

- GIVEN migration 0007 has already run and `aportes_definicion_grupos` contains (d-grupo, g1)
- WHEN the backfill statement is executed again
- THEN no duplicate (d-grupo, g1) row SHALL be inserted (`INSERT OR IGNORE`)

### Requirement: Searchable MultiSelect — "Asignar a" on Create and Edit

The system MUST provide a hand-rolled searchable MultiSelect component (`packages/ui/src/components/multi-select.tsx`, exported from the ui index, zero new dependencies — lucide-react already present) with: a filter input (case-insensitive substring over labels, filter-as-you-type), a dropdown listbox of remaining options, selected items as chips with a lucide `X` remove button, keyboard navigation (↑/↓ moves focus, Enter selects, Escape closes), ARIA `listbox`/`option` roles with `aria-selected`, an `emptyLabel` for no matches, `excludeValues` hidden from the options, and props `{ options: {value,label}[], selected: string[], onChange, placeholder?, searchPlaceholder?, emptyLabel?, disabled?, excludeValues? }`. The definition form's "Asignar a" section MUST use the MultiSelect TWICE — a Socios MultiSelect (socios whose estado permits `aportes`, existing `permitidos` filter unchanged) and a Grupos MultiSelect — and MUST be shown on create AND edit; edit SHALL pre-fill socios from the definition's `socioIds` and groups from its `grupoIds`. The definition list SHALL render one Badge per assigned group (or a `+N` overflow badge) instead of a single "Grupo:" badge.

#### Scenario: Edit mode pre-fills current assignments into the MultiSelects

- GIVEN a definition with `grupoIds: ["g1", "g2"]` and `socioIds: ["s1"]`
- WHEN the definition edit form opens
- THEN the Grupos MultiSelect SHALL show chips for g1 and g2
- AND the Socios MultiSelect SHALL show a chip for s1

#### Scenario: Filter-as-you-type narrows the dropdown options

- GIVEN a Grupos MultiSelect with options "Manzano A" and "Manzano B"
- WHEN the user types "B" in the filter input
- THEN only "Manzano B" SHALL remain visible in the dropdown

#### Scenario: Removing all group chips saves the definition as global

- GIVEN a definition form whose Grupos MultiSelect shows chips g1 and g2
- WHEN the user removes both chips and saves
- THEN the definition SHALL persist with `grupoIds: []` (global)

#### Scenario: The definition list renders one badge per assigned group

- GIVEN a definition with `grupoIds: ["g1", "g2"]`
- WHEN the definition list is rendered
- THEN the row SHALL show a badge for g1 AND a badge for g2 (or a `+N` overflow when the badge count exceeds the layout)

## Frontend Spec

- The definition CRUD UI lives in the "Aportes" section's existing **create tab** (`apps/web/src/routes/aportes.tsx`): definition list/edit plus ONE UNIFIED form — definition fields (`nombre`, `monto` (Bs), `recurrencia`, `inicio`/`fin`, `modalidadPago`, `activo` toggle) AND an "Asignar a" section with TWO searchable MultiSelects — a **Socios** MultiSelect (socios whose estado permits `aportes`, existing `permitidos` filter) and a **Grupos** MultiSelect — shown on create AND edit (edit pre-fills from the hydrated `socioIds`/`grupoIds`); submit ALWAYS declares both arrays (`[]` = cleared/global) — NOT in Configuración (`config.tsx` receives NO aporte CRUD). The standalone "Generar Cobros" section is REMOVED (its logic is absorbed by the assignment step); the form has NO `id` input (server-generated UUID, shown read-only when editing); on submit it shows a generated-count toast (POST and PUT) and refreshes the cobro list
- Deleting an in-use definition shows the friendly 409 error message
- Definition rows show `nombre`, `monto`, `recurrencia`, vigencia window, an `activo` badge, and ONE Badge per assigned group (`+N` overflow badge when the count exceeds the layout)
- The multiselect of definitions for the socio form uses ACTIVE definitions as options (inactive definitions are not assignable); the additional-groups MultiSelect excludes the primary group
- Responsive at ~360px: wrapping chips, stacked cards; the MultiSelect dropdown stacks inside the hand-rolled modal

## Validation

| Field | Rule |
|-------|------|
| `id` | Server-generated UUID; a client-supplied `id` in the POST body is IGNORED; immutable (PUT MUST NOT change it) |
| `nombre` (POST/PUT) | MUST be a non-empty string |
| `monto` (POST/PUT) | MUST be a number >= 0 |
| `recurrencia` | MUST be one of `mensual\|anual\|unico\|extraordinario` |
| `inicio`/`fin` | Optional window; when both provided `fin` MUST be >= `inicio` |
| `modalidadPago` | MUST be one of `cuotas\|parciales\|pago_unico` |
| `grupoIds` (POST/PUT, optional) | MUST be an array of existing group ids; absent or `[]` = global; unknown id or non-array → 400 |
| `socioIds` (POST/PUT, optional) | MUST be an array of existing socio ids; unknown id or non-array → 400; absent = preserve on PUT |
| `activo` | MUST be 0 or 1 when provided; defaults to 1 |

## Error States

| HTTP | Condition | Body |
|------|-----------|------|
| 400 | Missing/invalid nombre, monto, recurrencia, modalidadPago, inverted window, unknown/non-array grupoIds, unknown/non-array socioIds | `{ "error": "... is required" }` / `{ "error": "... is invalid" }` / `{ "error": "grupoIds contains an invalid group" }` / `{ "error": "socioIds contains an invalid socio" }` |
| 404 | Definition not found (PUT/DELETE) | `{ "error": "Aporte definition not found" }` |
| 409 | Definition in use by assignments or generated records on DELETE (group join rows are NOT a 409 trigger) | `{ "error": "No se puede eliminar: hay socios o registros usando este aporte" }` |
| 500 | Internal DB error | `{ "error": "Internal server error" }` |
