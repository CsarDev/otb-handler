# Socios Estados — Configurable Socio States, Action Permissions and Baja con Motivo

## Capability

`socios-estados` (NEW — no existing main spec)

> **Delta** from `openspec/changes/aporte-multigrupo-multiselect` (archived 2026-08-06): read-time inheritance and membership-time generation now resolve group-scoped definitions through the NEW M:N join table `aportes_definicion_grupos` (definitions apply to SEVERAL groups; `aplicaGrupoId` is gone). `aportesInherited` applies def-dedup (R2): ONE chip per definition, `AporteInherited` shape UNCHANGED `{ id, nombre, grupoId, grupoNombre }`, `grupoId` = the FIRST matching group in stable order (primary first, then additional groups by membership rowid) — so a definition applying via several of the socio's groups renders a single readable chip. Membership-time generation and socio-save generation (archived D16) are UNCHANGED in behavior — only the group-resolution source changes (join table instead of the single FK). The socio form replaces pill toggles with the shared searchable MultiSelect for `aporteIds` AND `grupoAdicionalIds`, with the primary group excluded from additional options (`excludeValues` invariant preserved).

## Description

Replaces the hardcoded `estado` enum (`activo|inactivo|suspendido`) with a configurable catalog of socio states. Each catalog state (`estados_socio`) defines a display name, a hex `color`, lifecycle flags (`esActivo`, `esBaja`, `esDefecto`, `orden`) and the set of actions the socio may participate in, resolved through an M:N mapping `estado_acciones` against an action catalog (`acciones_socio`) keyed by stable `clave` values (`asistencia`, `aportes`, `pagos`, `multas`, `anulaciones`, `reportes`, `dashboard`). A shared helper `socioPermite(socio, accionClave)` resolves permissions and every socio-associated route MUST use it, rejecting disallowed operations with 409. Baja becomes explicit: `POST /api/socios/:id/baja` requires a `motivo`, sets the `esBaja` catalog state and stamps `motivoBaja`/`fechaBaja`; `DELETE /api/socios/:id` remains a soft delete mapped to the `esBaja` state.

## Endpoints / Components

| Location | Type | Description |
|----------|------|-------------|
| `packages/db/src/schema/estados-socio.ts` | New | `estados_socio` (id, nombre, color, esActivo, esBaja, esDefecto, orden) |
| `packages/db/src/schema/acciones-socio.ts` | New | `acciones_socio` (id, clave unique, nombre, descripcion nullable, orden) |
| `packages/db/src/schema/estado-acciones.ts` | New | `estado_acciones` (estadoId+accionId composite PK) |
| `packages/db/src/schema/socios.ts` | Modified | Drop `estado` enum; add `estadoId` FK, `motivoBaja`, `fechaBaja` |
| `packages/db/src/seed.ts` | Modified | Seed 7 actions, 4 estados, M:N mapping; backfill `estadoId` |
| `packages/api/src/routes/estados-socio.ts` | New | CRUD + `PUT /:id/acciones` inline toggle |
| `packages/api/src/routes/acciones-socio.ts` | New | CRUD (409 when referenced) |
| `packages/api/src/routes/socios.ts` | Modified | Validate `estadoId`, `POST /:id/baja`, soft delete → esBaja, `?grupoId=` filter, joined estado fields |
| `packages/api/src/index.ts` | Modified | Mount `/api/estados-socio`, `/api/acciones-socio` |
| `packages/core/src/index.ts` | Modified | `Socio.estado` → `estadoId`; new `EstadoSocio`, `AccionSocio` types |
| `apps/web/src/routes/config.tsx` | Modified | "Estados de Socio" card (list + inline toggles + form) and "Acciones" card |
| `apps/web/src/routes/socios.tsx` | Modified | Estado select with colored dot, estado badge tinted, baja flow with motivo |
| `apps/web/src/stores/app.store.ts` | Modified | `estadosSocio`/`accionesSocio` state + actions |

## Requirements

### Requirement: Catalog CRUD — Estados

#### Scenario: Create a state with action ids in one shot

- GIVEN no estado named "voluntario" exists
- WHEN POST /api/estados-socio with { nombre: "voluntario", color: "#3b82f6", esActivo: 1, accionIds: ["<asistencia-id>", "<reportes-id>"] }
- THEN the response SHALL be 201 with the full estados list
- AND the new estado SHALL have color="#3b82f6", esActivo=1, esDefecto=0
- AND the M:N mapping SHALL contain exactly the 2 given accionIds

#### Scenario: Create a state without accionIds defaults to ALL actions

- GIVEN the actions catalog has 7 seeded actions
- WHEN POST /api/estados-socio with { nombre: "nuevo", color: "#22c55e" } (no accionIds)
- THEN the new estado SHALL be linked to all 7 actions
- AND color SHALL default to "#22c55e"
- AND orden SHALL default to the next integer after the current max

#### Scenario: Create a state with invalid color is rejected

- WHEN POST /api/estados-socio with { nombre: "x", color: "verde" }
- THEN the response SHALL be 400
- AND the error SHALL be { "error": "color must be a valid hex value" }

#### Scenario: Create a state without nombre is rejected

- WHEN POST /api/estados-socio with { color: "#22c55e" }
- THEN the response SHALL be 400
- AND the error SHALL be { "error": "nombre is required" }

#### Scenario: Inline toggle replaces the action set atomically

- GIVEN estado "activo" is linked to all 7 actions
- WHEN PUT /api/estados-socio/<activo-id>/acciones with { accionIds: ["<reportes-id>"] }
- THEN the M:N set for "activo" SHALL contain exactly ["<reportes-id>"]
- AND the response SHALL be 200 with the full estados list

#### Scenario: Inline toggle with unknown action id is rejected

- WHEN PUT /api/estados-socio/<activo-id>/acciones with { accionIds: ["fake-accion"] }
- THEN the response SHALL be 400
- AND the mapping SHALL remain unchanged

#### Scenario: Update a state preserves its socios

- GIVEN "activo" has socios assigned
- WHEN PUT /api/estados-socio/<activo-id> with { color: "#16a34a", orden: 1 }
- THEN the response SHALL be 200 with the full estados list
- AND the existing socios SHALL keep estadoId="<activo-id>"

#### Scenario: Delete a state in use by socios is rejected

- GIVEN socios reference estado "activo"
- WHEN DELETE /api/estados-socio/<activo-id>
- THEN the response SHALL be 409
- AND the error SHALL indicate the state is in use

#### Scenario: Delete an unused state succeeds

- GIVEN no socio references estado "obsoleto"
- WHEN DELETE /api/estados-socio/<obsoleto-id>
- THEN the response SHALL be 200 with the full estados list
- AND the estado SHALL no longer exist

#### Scenario: Only one esDefecto and one esBaja state may exist

- GIVEN "activo" already has esDefecto=1
- WHEN PUT /api/estados-socio/<otro-id> with { esDefecto: 1 }
- THEN the response SHALL be 400
- AND the error SHALL indicate a single esDefecto state is allowed
- GIVEN "dado_de_baja" already has esBaja=1
- WHEN PUT /api/estados-socio/<otro-id> with { esBaja: 1 }
- THEN the response SHALL be 400

### Requirement: Catalog CRUD — Acciones

#### Scenario: Admin adds a new action with clave and nombre

- WHEN POST /api/acciones-socio with { clave: "carnet", nombre: "Carnet", descripcion: "..." }
- THEN the response SHALL be 201 with the full actions list
- AND the new action SHALL be available for assignment in estado toggles

#### Scenario: Duplicate action clave is rejected

- GIVEN an action with clave="asistencia" exists
- WHEN POST /api/acciones-socio with { clave: "asistencia", nombre: "X" }
- THEN the response SHALL be 409
- AND the error SHALL indicate the clave already exists

#### Scenario: Delete an action referenced by a state is rejected

- GIVEN the "activo" state references the "asistencia" action
- WHEN DELETE /api/acciones-socio/<asistencia-id>
- THEN the response SHALL be 409

### Requirement: Migración — enum → estadoId FK

#### Scenario: Existing enum values map to seeded catalog states

- GIVEN socios with estado values 'activo', 'inactivo' and 'suspendido'
- WHEN the migration runs
- THEN 'activo' SHALL map to the seeded "activo" state (esActivo=1)
- AND 'suspendido' SHALL map to the seeded "suspendido" state
- AND 'inactivo' SHALL map to the seeded "inactivo" state (its own catalog row)
- AND the `estado` column SHALL be dropped only after the backfill succeeds

#### Scenario: Seeded catalog guarantees baseline lifecycle

- GIVEN a fresh seed
- THEN acciones_socio SHALL contain exactly: asistencia, aportes, pagos, multas, anulaciones, reportes, dashboard (7 rows, stable claves)
- AND estados_socio SHALL contain exactly 4 rows:
  - activo (#22c55e, all actions, esActivo+esDefecto)
  - suspendido (#f59e0b, only reportes)
  - inactivo (#9ca3af gray, no actions, esBaja=0)
  - dado_de_baja (#ef4444, no actions, esBaja=1)

### Requirement: Socio CRUD and Baja

#### Scenario: POST socio without estadoId assigns the esDefecto state

- GIVEN "activo" has esDefecto=1
- WHEN POST /api/socios with { nombre: "Juan", apellidoPaterno: "Perez" }
- THEN the socio SHALL have estadoId="<activo-id>"

#### Scenario: POST socio with unknown estadoId is rejected

- WHEN POST /api/socios with { nombre: "J", apellidoPaterno: "P", estadoId: "fake" }
- THEN the response SHALL be 400
- AND the error SHALL be { "error": "estadoId is invalid" }

#### Scenario: No esDefecto state configured blocks socio creation

- GIVEN no estado has esDefecto=1
- WHEN POST /api/socios without estadoId
- THEN the response SHALL be 400
- AND the error SHALL indicate no default state is configured

#### Scenario: Baja with motivo sets the esBaja state and stamps dates

- GIVEN a socio with estadoId="<activo-id>"
- WHEN POST /api/socios/<id>/baja with { motivo: "Renuncia voluntaria" }
- THEN the response SHALL be 200 with the updated socio
- AND estadoId SHALL be "<dado-de-baja-id>"
- AND motivoBaja SHALL be "Renuncia voluntaria"
- AND fechaBaja SHALL be today's date (ISO)

#### Scenario: Baja without motivo is rejected

- WHEN POST /api/socios/<id>/baja with {}
- THEN the response SHALL be 400
- AND the error SHALL be { "error": "motivo is required" }

#### Scenario: Baja of an already-baja socio is rejected

- GIVEN a socio already in the esBaja state
- WHEN POST /api/socios/<id>/baja with { motivo: "otra vez" }
- THEN the response SHALL be 400

#### Scenario: Baja of a nonexistent socio returns 404

- WHEN POST /api/socios/fake-id/baja with { motivo: "x" }
- THEN the response SHALL be 404

#### Scenario: No esBaja state configured blocks baja

- GIVEN no estado has esBaja=1
- WHEN POST /api/socios/<id>/baja with { motivo: "x" }
- THEN the response SHALL be 400
- AND the error SHALL indicate no baja state is configured

#### Scenario: DELETE remains a soft delete mapped to esBaja

- GIVEN an existing socio
- WHEN DELETE /api/socios/<id>
- THEN the response SHALL be 204
- AND the socio SHALL still exist with estadoId="<dado-de-baja-id>"
- AND motivoBaja SHALL remain null

### Requirement: Action Enforcement

#### Scenario: socioPermite resolves the M:N action set from the estado

- GIVEN a socio with estado "activo" (permits all actions)
- WHEN socioPermite(socio, "asistencia") is evaluated
- THEN it SHALL return true
- GIVEN a socio with estado "suspendido" (permits only reportes)
- WHEN socioPermite(socio, "asistencia") is evaluated
- THEN it SHALL return false
- GIVEN a socio with estado "dado_de_baja" (permits none)
- WHEN socioPermite(socio, "reportes") is evaluated
- THEN it SHALL return false

#### Scenario: Routes reject disallowed socios with 409 and a friendly message

- GIVEN a socio whose estado does not permit "aportes"
- WHEN a socio-associated route for "aportes" is invoked with that socio
- THEN the response SHALL be 409
- AND the error SHALL be friendly, e.g. `{ "error": "El socio no puede realizar esta acción en su estado actual" }`

### Requirement: Socio Model — aporteIds Multiselect (Many-to-Many)

The system MUST store socio↔aporte assignments in the join table `socio_aportes` (composite PK, pattern `socio_grupos`). The socio `POST`/`PUT` SHALL accept `aporteIds: string[]` (ONE OR MORE). Each id MUST reference an existing ACTIVE definition else the request is rejected. A socio created without `aporteIds` SHALL have NO direct assignments (there is no default-type fallback). `PUT` with `aporteIds` SHALL replace the assignment set atomically in the same transaction; `PUT` without `aporteIds` SHALL preserve the existing assignments. In the SAME transaction that persists the final assignment/membership set, the system MUST GENERATE the socio's cobro records automatically (per each assigned definition's `recurrencia` ∩ `inicio`/`fin` window, current gestión) for the direct `aporteIds` AND for the group-scoped definitions of the final membership set (primary + additional groups) — the latter resolved through the join table `aportes_definicion_grupos` (membership-time and socio-save generation, archived D16, otherwise UNCHANGED). New assignments SHALL generate only MISSING records (idempotent via the dedup invariant); removed assignments/memberships SHALL NEVER delete already-generated records; a socio whose estado does NOT permit `aportes` SHALL keep its assignment but generate 0 records (bulk-exclusion — the socio save SHALL NOT return 409). The socio form SHALL use the shared searchable MultiSelect (chips with ×, filter-as-you-type) for BOTH `aporteIds` and `grupoAdicionalIds`, replacing the pill toggles; the additional-groups MultiSelect SHALL exclude the socio's primary group from its options (`excludeValues=[grupoPrimarioId]`, preserving the "primary ∉ additional" invariant).

#### Scenario: POST socio with a multiselect of aportes generates records for each assignment

- GIVEN definitions "ap-mensual" and "ap-extra" exist and are active
- AND "ap-mensual" has a vigencia window covering the current gestión
- WHEN POST /api/socios with `{ nombre: "Juan", apellidoPaterno: "Perez", aporteIds: ["ap-mensual", "ap-extra"] }`
- THEN `socio_aportes` SHALL contain (socioId, ap-mensual) and (socioId, ap-extra)
- AND the response SHALL include `aporteIds: ["ap-mensual", "ap-extra"]`
- AND cobro records SHALL be generated for the new socio for each assigned definition (per recurrence ∩ window, current gestión)

#### Scenario: POST socio without aporteIds has no direct assignments

- WHEN POST /api/socios with `{ nombre: "Ana", apellidoPaterno: "Lopez" }`
- THEN the socio SHALL be created
- AND the response SHALL include `aporteIds: []`
- AND NO `socio_aportes` row SHALL exist for that socio

#### Scenario: POST with an unknown aporte id is rejected

- WHEN POST /api/socios with `{ nombre: "J", apellidoPaterno: "P", aporteIds: ["fake-aporte"] }`
- THEN the response SHALL be 400
- AND the error SHALL be `{ "error": "aporteIds contains an invalid aporte" }`
- AND the socio SHALL NOT be created

#### Scenario: POST with an inactive aporte id is rejected

- GIVEN definition "ap-inactivo" exists with activo=0
- WHEN POST /api/socios with `{ nombre: "J", apellidoPaterno: "P", aporteIds: ["ap-inactivo"] }`
- THEN the response SHALL be 400
- AND the error SHALL indicate an inactive aporte is not assignable

#### Scenario: POST with a non-array aporteIds is rejected

- WHEN POST /api/socios with `{ nombre: "J", apellidoPaterno: "P", aporteIds: "ap-mensual" }`
- THEN the response SHALL be 400
- AND the error SHALL be `{ "error": "aporteIds must be an array" }`

#### Scenario: POST socio whose estado does not permit aportes keeps the assignment but generates 0 records

- GIVEN a socio with an estado that does NOT permit "aportes"
- WHEN POST /api/socios with `{ nombre: "J", apellidoPaterno: "P", aporteIds: ["ap-mensual"] }`
- THEN the response SHALL be 201 (NO 409)
- AND `socio_aportes` SHALL contain the assignment
- AND 0 cobro records SHALL be generated

#### Scenario: PUT replaces the assignment set atomically without deleting generated records

- GIVEN a socio assigned to ["ap-mensual", "ap-extra"] with generated records for both
- WHEN PUT /api/socios/<id> with `{ aporteIds: ["ap-mensual"] }`
- THEN `socio_aportes` SHALL contain exactly (socioId, ap-mensual)
- AND the row for ap-extra SHALL be removed in the same transaction
- AND the response SHALL include `aporteIds: ["ap-mensual"]`
- AND the already-generated records for ap-extra SHALL REMAIN (removal never deletes records)

#### Scenario: PUT without aporteIds preserves existing assignments (idempotent re-save)

- GIVEN a socio assigned to ["ap-mensual"] with records already generated
- WHEN PUT /api/socios/<id> with `{ telefono: "123" }`
- THEN `socio_aportes` SHALL still contain (socioId, ap-mensual)
- AND `aporteIds` SHALL remain ["ap-mensual"]
- AND NO new/duplicate cobro records SHALL be created (re-save is a no-op for existing months)

#### Scenario: PUT adding a new aporte generates only the missing records

- GIVEN a socio assigned to ["ap-mensual"] with records already generated
- WHEN PUT /api/socios/<id> with `{ aporteIds: ["ap-mensual", "ap-anual"] }`
- THEN records for the already-assigned ap-mensual SHALL NOT be duplicated
- AND records for ap-anual SHALL be generated (current gestión)
- AND the response SHALL report a generated count reflecting only the new records

#### Scenario: Full replace of a socio keeps the multiselect intact

- GIVEN a socio with direct assignments ["ap-mensual", "ap-anual"]
- WHEN replace is performed (PUT with the full socio payload including `aporteIds: ["ap-mensual", "ap-anual"]`)
- THEN the response SHALL include `aporteIds: ["ap-mensual", "ap-anual"]`
- AND both `socio_aportes` rows SHALL persist
- AND no duplicate cobro records SHALL be created for the already-generated months

#### Scenario: Socio save generates records for group-scoped definitions of the final membership set through the join table

- GIVEN definition "d-g1" has `grupoIds: ["g1"]` and definition "d-g2" has `grupoIds: ["g2"]`
- WHEN POST /api/socios with `{ nombre: "Juan", apellidoPaterno: "Perez", grupoPrimarioId: "g1", grupoAdicionalIds: ["g2"] }` (no aporteIds)
- THEN cobro records SHALL be generated for (socioId, d-g1) AND (socioId, d-g2) for the current gestión (both resolved through `aportes_definicion_grupos` at membership time)
- AND NO `socio_aportes` rows SHALL exist for either (inherited, not materialized)

#### Scenario: The additional-groups MultiSelect excludes the primary group

- GIVEN a socio with `grupoPrimarioId="g1"` being edited in the socio form
- WHEN the additional-groups MultiSelect (`grupoAdicionalIds`) opens
- THEN g1 SHALL NOT appear among the selectable options (`excludeValues=[grupoPrimarioId]` — "primary ∉ additional" invariant preserved)
- AND the `aporteIds` MultiSelect SHALL list the ACTIVE definitions as options (inactive definitions not assignable)

### Requirement: Group Inheritance — Read-Only Inherited Aportes (Dynamic)

The system MUST resolve, at READ time, the set of aporte definitions inherited from the socio's group memberships: any definition whose `grupoIds` intersects the socio's `grupoPrimarioId` OR its additional groups, resolved through the join table `aportes_definicion_grupos`. Inherited definitions SHALL be exposed as read-only chips on the socio shape (`aportesInherited: Array<{ id, nombre, grupoId, grupoNombre }>`) — distinct from the editable `aporteIds`, NOT writable, with NO materialized `socio_aportes` rows (the join is never materialized for inherited definitions). Def-dedup (R2): a definition applying via SEVERAL of the socio's groups SHALL appear EXACTLY ONCE in `aportesInherited`, with `grupoId` = the FIRST matching group in stable order — the primary group first, then additional groups by membership rowid. Record generation SHALL be event-driven: a FUTURE member added to a group SHALL receive its cobro records AT MEMBERSHIP TIME; removing a member SHALL stop future inheritance (unless a direct assignment exists) and SHALL NEVER delete already-generated records.

#### Scenario: Inherits from the primary group

- GIVEN definition "ap-grupo" has `grupoIds: ["g1"]`
- AND socio "s1" has grupoPrimarioId="g1" and no direct assignment
- WHEN GET /api/socios/s1
- THEN the response SHALL include `aportesInherited: [{ id: "ap-grupo", nombre: "...", grupoId: "g1", grupoNombre: "..." }]`
- AND `aporteIds` SHALL be [] (no direct assignment)

#### Scenario: Inherits from a secondary group

- GIVEN definition "ap-g2" has `grupoIds: ["g2"]`
- AND socio "s1" is an additional member of g2 (via `socio_grupos`) and has no direct assignment
- WHEN GET /api/socios/s1
- THEN the response SHALL include ap-g2 in `aportesInherited` with grupoId="g2"

#### Scenario: Inherits from both primary and secondary groups (two definitions)

- GIVEN definition "ap-g1" has `grupoIds: ["g1"]` and definition "ap-g2" has `grupoIds: ["g2"]`
- AND socio "s1" has grupoPrimarioId="g1" and is an additional member of g2
- WHEN GET /api/socios/s1
- THEN `aportesInherited` SHALL contain both ap-g1 and ap-g2, each with its source group id

#### Scenario: Def-dedup — a multi-group definition renders ONE chip with the primary group

- GIVEN definition "ap-multi" has `grupoIds: ["g1", "g2"]`
- AND socio "s1" has grupoPrimarioId="g1" AND is an additional member of g2 (no direct assignment)
- WHEN GET /api/socios/s1
- THEN `aportesInherited` SHALL contain ap-multi EXACTLY ONCE (no chip per (definition × group) pair)
- AND the chip SHALL carry `grupoId: "g1"` (primary group wins the stable order)

#### Scenario: Def-dedup — with no primary match the earliest additional membership wins

- GIVEN definition "ap-multi" has `grupoIds: ["g2", "g3"]`
- AND socio "s1" has NO primary group and is an additional member of g2 (rowid 1) and g3 (rowid 2)
- WHEN GET /api/socios/s1
- THEN `aportesInherited` SHALL contain ap-multi EXACTLY ONCE
- AND the chip SHALL carry `grupoId: "g2"` (first additional group by membership rowid)

#### Scenario: A future member inherits automatically and receives records at membership time

- GIVEN definition "ap-g1" has `grupoIds: ["g1"]`
- WHEN a NEW socio "s1" is created and assigned grupoPrimarioId="g1" (no aporteIds)
- THEN GET /api/socios/s1 SHALL include ap-g1 in `aportesInherited`
- AND NO `socio_aportes` row SHALL exist for (s1, ap-g1)
- AND cobro records for (s1, ap-g1, current gestión) SHALL be generated at membership time

#### Scenario: Removing a member stops inheritance unless directly assigned, without deleting records

- GIVEN socio "s1" is an additional member of g2 (definition ap-g2 has `grupoIds: ["g2"]`) with no direct assignment
- AND records for (s1, ap-g2) were generated at membership time
- WHEN PUT /api/socios/s1 with `{ grupoAdicionalIds: [] }` (leaving g2)
- THEN GET /api/socios/s1 SHALL NOT include ap-g2 in `aportesInherited`
- AND the previously generated records for (s1, ap-g2) SHALL REMAIN
- GIVEN socio "s2" is a member of g2 AND directly assigned ap-g2 via `aporteIds`
- WHEN s2 leaves g2
- THEN ap-g2 SHALL still appear in `aporteIds` (direct assignment preserved)

#### Scenario: Direct assignment deduplicates the inherited chip

- GIVEN definition "ap-g1" has `grupoIds: ["g1"]` and socio "s1" is BOTH a member of g1 AND directly assigned ap-g1
- WHEN GET /api/socios/s1
- THEN ap-g1 SHALL appear once in `aporteIds` (direct)
- AND ap-g1 SHALL NOT be duplicated in `aportesInherited`

#### Scenario: Inherited chips are read-only

- GIVEN socio "s1" inherits ap-g1 via its primary group
- WHEN the socio form is edited and saved WITHOUT modifying `aporteIds`
- THEN `aporteIds` SHALL remain the socio's direct assignments
- AND the inherited ap-g1 SHALL NOT be removable via `aporteIds`

## Frontend Spec

- Config gains an "Estados de Socio" card: list rows show a color dot + nombre; **inline action toggles** (one switch per estado×acción, instant save via `PUT /:id/acciones`); create/edit form with `nombre`, a color picker and action checkboxes with **all actions pre-ticked by default**
- Config gains an "Acciones" card: add new actions with `clave` + `nombre`; duplicate `clave` shows a warning
- Socio form: estado select whose options show a colored dot; baja is explicit with a required `motivo` textarea
- Socio list/ficha: estado badge tinted with the estado's `color` everywhere in the app
- UI hides/disables socios whose estado blocks the current module action
- Responsive at ~360px: wrapping chips, stacked cards

## Validation

| Field | Rule |
|-------|------|
| `nombre` (estado/acción) | MUST be a non-empty string |
| `color` (estado) | MUST be a valid hex value; defaults to `#22c55e` |
| `esActivo`/`esBaja`/`esDefecto` | MUST be 0 or 1 when provided; defaults to 0 |
| `esDefecto`/`esBaja` | At most ONE estado each may be flagged (SHALL enforce) |
| `accionIds` (POST estado) | Optional; defaults to ALL actions when omitted |
| `clave` (acción) | MUST be non-empty and unique |
| `motivo` (baja) | MUST be a non-empty string |
| `estadoId` (socio POST/PUT) | MUST reference an existing estado when provided |
| `orden` | Optional integer |

## Error States

| HTTP | Condition | Body |
|------|-----------|------|
| 400 | Missing/invalid field, invalid color, duplicate esDefecto/esBaja, no default/baja state, motivo missing, invalid estadoId | `{ "error": "..." }` |
| 404 | Estado/acción/socio not found | `{ "error": "Not found" }` / `{ "error": "Estado not found" }` |
| 409 | Estado in use by socios, duplicate action clave, action referenced by a state, socio action not permitted | `{ "error": "..." }` |
| 500 | Internal DB error | `{ "error": "Internal server error" }` |
