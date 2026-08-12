# Aporte Definitions — Dynamic Aporte Definitions with Many-to-Many Assignment

## Capability

`aporte-definitions` (NEW — replaces the obsolete `aporte-types` capability)

## Description

Reworks the `tipos_aporte` catalog into `aportes_definicion`: the aporte is now the dynamic DEFINITION itself, no longer a single-amount catalog row. Each definition carries an internal text `id` (e.g. `ap-mensual`), `nombre` (e.g. "Cuota Social Mensual"), `monto` (Bs), `recurrencia` (`mensual|anual|unico|extraordinario`), `inicio`/`fin` (vigencia window), `modalidadPago` (`cuotas|parciales|pago_unico`), an optional `aplicaGrupoId` FK to `grupos` (group application resolved dynamically at read/generation time, NOT materialized), and `activo`. Assignment to socios is many-to-many through the new join `socio_aportes` (same pattern as `socio_grupos`). CRUD is exposed by the reworked definition router (formerly `tipos-aporte`); `DELETE` returns 409 when the definition has generated records (`aportes.aporteId`) or assignments (`socio_aportes`). The definition CRUD UI lives in the "Aportes" section's existing create tab — NOT in Configuración (user clarification).

## Endpoints / Components

| Location | Type | Description |
|----------|------|-------------|
| `packages/db/src/schema/aportes-definicion.ts` | Rework (was `tipos-aporte.ts`) | `aportes_definicion` (id, nombre, monto, recurrencia, inicio, fin, modalidadPago, aplicaGrupoId FK, activo) |
| `packages/db/src/schema/socio-aportes.ts` | New | `socio_aportes` join (socioId+aporteId composite PK, pattern `socio_grupos`) |
| `packages/db/src/schema/aportes.ts` | Modified | Gains `aporteId` FK → `aportes_definicion.id` (records = APORTE_REGISTRO / cobro) |
| `packages/db/src/schema/socios.ts` | Modified | DROP `tipoAporteId` and legacy `aporteBase` |
| `packages/db/src/schema.ts` | Modified | Export new/reworked tables |
| `packages/db/src/seed.ts` | Modified | Seed default definitions (e.g. `ap-mensual` "Cuota Social Mensual") |
| `packages/core/src/index.ts` | Modified | `Aporte` (definition), `AporteInput`, `SocioAporte` join type |
| `packages/api/src/routes/tipos-aporte.ts` | Rework | Definition CRUD (renamed path) with 409 delete guard |
| `packages/api/src/index.ts` | Modified | Mount reworked definition router |
| `apps/web/src/routes/aportes.tsx` | Modified | Definition form + list/edit in the existing create tab |
| `apps/web/src/stores/app.store.ts` | Modified | `aportes` (definitions) state + CRUD actions, loaded in `fetchConfig` |

## Requirements

### Requirement: Definition CRUD — Aportes

The system MUST expose full CRUD on `aportes_definicion` via the definition router (renamed from `/api/tipos-aporte`): `GET /` (full list), `POST /`, `PUT /:id`, `DELETE /:id`. `POST` MUST validate `nombre`, `monto` (number >= 0), `recurrencia` (one of `mensual|anual|unico|extraordinario`), `inicio`/`fin` (valid window: `fin` >= `inicio` when both provided), `modalidadPago` (one of `cuotas|parciales|pago_unico`), `aplicaGrupoId` (MUST reference an existing group when provided) and `activo` (0/1, default 1). A definition without `aplicaGrupoId` SHALL be global (applies to no group). `PUT /:id` MUST NOT allow changing the definition `id`.

#### Scenario: List returns the full catalog of definitions

- GIVEN seeded definitions exist, including `ap-mensual` "Cuota Social Mensual"
- WHEN GET /api/aportes-definicion
- THEN the response SHALL be a 200 array with all definitions including `id`, `nombre`, `monto`, `recurrencia`, `inicio`, `fin`, `modalidadPago`, `aplicaGrupoId` and `activo`

#### Scenario: Create a full definition

- GIVEN no definition "Cuota Social Mensual" exists
- WHEN POST /api/aportes-definicion with `{ id: "ap-mensual", nombre: "Cuota Social Mensual", monto: 50, recurrencia: "mensual", inicio: "2025-01-01", fin: "2025-12-31", modalidadPago: "cuotas", activo: 1 }`
- THEN the response SHALL be 201 with the full definitions list
- AND the new definition SHALL have monto=50, recurrencia="mensual" and activo=1
- AND aplicaGrupoId SHALL be null (global definition)

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

#### Scenario: Create with a nonexistent aplicaGrupoId is rejected

- WHEN POST /api/aportes-definicion with `{ nombre: "X", monto: 50, recurrencia: "mensual", aplicaGrupoId: "fake-group" }`
- THEN the response SHALL be 400 with `{ "error": "aplicaGrupoId is invalid" }`

#### Scenario: Create a group-scoped definition

- GIVEN group "g1" exists
- WHEN POST /api/aportes-definicion with `{ nombre: "Fondo Grupo A", monto: 10, recurrencia: "mensual", aplicaGrupoId: "g1", activo: 1 }`
- THEN the response SHALL be 201
- AND the definition SHALL have aplicaGrupoId="g1"

#### Scenario: Update editable fields

- GIVEN a definition with id="ap-mensual", nombre="Cuota Social Mensual", monto=50
- WHEN PUT /api/aportes-definicion/ap-mensual with `{ nombre: "Cuota Social Mensual", monto: 60, fin: "2026-12-31" }`
- THEN the response SHALL be 200 with the full definitions list
- AND monto SHALL be 60 and fin SHALL be "2026-12-31"

#### Scenario: PUT with an id field does not change the definition id

- GIVEN a definition with id="ap-mensual"
- WHEN PUT /api/aportes-definicion/ap-mensual with `{ id: "ap-otro", monto: 70 }`
- THEN the response SHALL be 200
- AND the definition SHALL keep id="ap-mensual"
- AND no definition with id="ap-otro" SHALL exist

#### Scenario: Update a nonexistent definition returns 404

- WHEN PUT /api/aportes-definicion/fake-id with `{ nombre: "X" }`
- THEN the response SHALL be 404

#### Scenario: Delete an unused definition succeeds

- GIVEN a definition with no assignments and no generated records
- WHEN DELETE /api/aportes-definicion/<id>
- THEN the response SHALL be 200 with the full definitions list
- AND the definition SHALL no longer exist

#### Scenario: Delete a nonexistent definition returns 404

- WHEN DELETE /api/aportes-definicion/fake-id
- THEN the response SHALL be 404

### Requirement: DELETE Guard — 409 with Records or Assignments

The system MUST reject `DELETE /:id` with 409 when the definition has either generated aporte records (`aportes.aporteId`) or socio assignments (`socio_aportes.aporteId`), mirroring the `tipos-actividad`/`grupos` guard pattern. The definition SHALL remain in the catalog.

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

### Requirement: Group Application — aplicaGrupoId (Dynamic, NOT Materialized)

The system MUST treat `aplicaGrupoId` as a dynamic scoping rule: the definition applies to ALL current AND FUTURE members of the referenced group (primary or additional membership). Resolution SHALL happen at read/generation time — setting `aplicaGrupoId` MUST NOT create `socio_aportes` rows for group members and MUST NOT pre-generate aporte records.

#### Scenario: Group-scoped definition applies to current members at resolution time

- GIVEN definition "d-grupo" has aplicaGrupoId="g1"
- AND socios "s1" and "s2" are members of g1 (primary or additional)
- WHEN the inherited aportes of s1/s2 are resolved
- THEN both s1 and s2 SHALL resolve "d-grupo" as an applicable definition
- AND NO `socio_aportes` row SHALL exist for (s1, d-grupo) nor (s2, d-grupo)

#### Scenario: Group-scoped definition applies to future members automatically

- GIVEN definition "d-grupo" has aplicaGrupoId="g1"
- WHEN a NEW socio "s3" is created and added to g1 (no direct assignment)
- THEN s3 SHALL resolve "d-grupo" as an applicable definition without any materialized propagation step

#### Scenario: Removing a member stops the group application

- GIVEN socio "s3" is a member of g1 and definition "d-grupo" has aplicaGrupoId="g1"
- WHEN s3 is removed from g1 (and has no direct assignment to d-grupo)
- THEN s3 SHALL no longer resolve "d-grupo"

### Requirement: Seed of Default Definitions

The system MUST seed at least one default definition, `ap-mensual` ("Cuota Social Mensual"), with `recurrencia='mensual'`, `activo=1` and a vigencia window covering the seed gestion.

#### Scenario: Fresh seed contains the default definition

- GIVEN a fresh seed
- THEN `aportes_definicion` SHALL contain a definition with id="ap-mensual", nombre="Cuota Social Mensual", recurrencia="mensual" and activo=1

## Frontend Spec

- The definition CRUD UI lives in the "Aportes" section's existing **create tab** (`apps/web/src/routes/aportes.tsx`): definition list/edit plus the definition form with `nombre`, `monto` (Bs), `recurrencia`, `inicio`/`fin`, `modalidadPago`, optional `aplicaGrupoId` and `activo` toggle — NOT in Configuración (`config.tsx` receives NO aporte CRUD)
- Deleting an in-use definition shows the friendly 409 error message
- Definition rows show `nombre`, `monto`, `recurrencia`, vigencia window and an `activo` badge; group-scoped definitions show the target group
- The multiselect of definitions for the socio form uses ACTIVE definitions as options (inactive definitions are not assignable)
- Responsive at ~360px: wrapping chips, stacked cards

## Validation

| Field | Rule |
|-------|------|
| `id` | Internal text slug, e.g. `ap-mensual`; immutable after creation (PUT MUST NOT change it) |
| `nombre` (POST/PUT) | MUST be a non-empty string |
| `monto` (POST/PUT) | MUST be a number >= 0 |
| `recurrencia` | MUST be one of `mensual\|anual\|unico\|extraordinario` |
| `inicio`/`fin` | Optional window; when both provided `fin` MUST be >= `inicio` |
| `modalidadPago` | MUST be one of `cuotas\|parciales\|pago_unico` |
| `aplicaGrupoId` | MUST reference an existing group when provided; null = global definition |
| `activo` | MUST be 0 or 1 when provided; defaults to 1 |

## Error States

| HTTP | Condition | Body |
|------|-----------|------|
| 400 | Missing/invalid nombre, monto, recurrencia, modalidadPago, inverted window, unknown aplicaGrupoId | `{ "error": "... is required" }` / `{ "error": "... is invalid" }` |
| 404 | Definition not found (PUT/DELETE) | `{ "error": "Aporte definition not found" }` |
| 409 | Definition in use by assignments or generated records on DELETE | `{ "error": "No se puede eliminar: hay socios o registros usando este aporte" }` |
| 500 | Internal DB error | `{ "error": "Internal server error" }` |
