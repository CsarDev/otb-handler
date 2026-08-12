# Delta for Grupos

> **Delta** from `openspec/specs/grupos/spec.md` (aporte-multigrupo-multiselect): the groups DELETE guard gains a THIRD reference check — `aportes_definicion_grupos.grupoId` → 409. This fixes the orphan-FK gap that exists today: the archived single-column `aplica_grupo_id` reference was NOT guarded, so a definition could pin a group that was then deleted, leaving an orphan FK. With the M:N join table `aportes_definicion_grupos` as the single source of truth for definition↔group application, deleting a group referenced by any definition's join row MUST be rejected. Existing socio membership guards (primary FK + `socio_grupos` join) are UNCHANGED.

> ⚠️ **Fixes archived gap (verify must re-check):** the archived grupos spec guarded deletion only against socio membership (primary or additional). Group-scoped definition references were unguarded — now they are. This is additive: no archived scenario changes behavior, only a new guard branch and a new scenario are added.

## MODIFIED Requirements

### Requirement: Group CRUD

The system MUST expose full CRUD on `grupos` via the groups router (`/api/grupos`): `GET /`, `POST /`, `PUT /:id`, `DELETE /:id`. `POST` MUST validate `nombre` (non-empty string; descripcion optional/nullable). `PUT /:id` MUST update the group's editable fields. `DELETE /:id` MUST be guarded by 409 when the group is referenced by: (a) at least one socio's `grupoPrimarioId` (primary membership), (b) at least one `socio_grupos` join row (additional membership), OR (c) at least one `aportes_definicion_grupos` join row (a definition's group application). The group SHALL remain in the catalog on any 409.
(Previously: the delete guard checked only socio membership — primary FK and `socio_grupos` — leaving definition references (`aplica_grupo_id` at the time) unguarded; the guard now also covers the definition join table `aportes_definicion_grupos`.)

#### Scenario: Create a group

- WHEN POST /api/grupos with { nombre: "Manzano A", descripcion: "Bloque 1" }
- THEN the response SHALL be 201 with the full grupos list
- AND the group SHALL have descripcion="Bloque 1"

#### Scenario: Create a group without nombre is rejected

- WHEN POST /api/grupos with { descripcion: "x" }
- THEN the response SHALL be 400
- AND the error SHALL be { "error": "nombre is required" }

#### Scenario: Create a group without descripcion defaults to null

- WHEN POST /api/grupos with { nombre: "Manzano B" }
- THEN the group SHALL be created with descripcion=null

#### Scenario: Update a group

- GIVEN a group "Manzano A"
- WHEN PUT /api/grupos/<id> with { nombre: "Manzano A Norte" }
- THEN the response SHALL be 200 with the full grupos list
- AND the group SHALL be renamed

#### Scenario: Update a nonexistent group returns 404

- WHEN PUT /api/grupos/fake-id with { nombre: "x" }
- THEN the response SHALL be 404

#### Scenario: Delete a group with socios is rejected

- GIVEN a group that is the primary group of at least one socio
- WHEN DELETE /api/grupos/<id>
- THEN the response SHALL be 409
- AND the error SHALL indicate the group has associated socios

#### Scenario: Delete a group used only as additional is rejected

- GIVEN a group referenced only by a socio_grupos join row
- WHEN DELETE /api/grupos/<id>
- THEN the response SHALL be 409

#### Scenario: Delete a group referenced by an aporte definition join row is rejected

- GIVEN a definition whose `grupoIds` includes "g1" (a row exists in `aportes_definicion_grupos` referencing g1)
- AND no socio references g1 (no primary nor additional membership)
- WHEN DELETE /api/grupos/g1
- THEN the response SHALL be 409
- AND the error SHALL indicate the group is referenced by an aporte definition
- AND the group SHALL remain in the catalog (orphan-FK gap fixed)

#### Scenario: Delete an unused group succeeds

- GIVEN a group with no primary nor additional membership AND no `aportes_definicion_grupos` rows
- WHEN DELETE /api/grupos/<id>
- THEN the response SHALL be 200 with the full grupos list
- AND the group SHALL no longer exist

#### Scenario: Delete a nonexistent group returns 404

- WHEN DELETE /api/grupos/fake-id
- THEN the response SHALL be 404
