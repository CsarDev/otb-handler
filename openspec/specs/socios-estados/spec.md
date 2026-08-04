# Socios Estados — Configurable Socio States, Action Permissions and Baja con Motivo

## Capability

`socios-estados` (NEW — no existing main spec)

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
