# Grupos — Configurable Groups with Primary/Additional Membership

## Capability

`grupos` (NEW — no existing main spec)

## Description

Introduces configurable groups (`grupos`) managed from Configuración, cloned from the activity-types pattern. Each socio has ONE primary group (`grupoPrimarioId` FK on `socios`, Option B) and any number of additional groups through the M:N join `socio_grupos` (socioId+grupoId composite PK). The invariant "primary ∉ additional" is enforced at the API layer on every socio write. Groups are deletable only when no socio references them (409 guard, checked on both primary and additional membership). Group filtering (`?grupoId=`) is available on the socio list, asistencia, aportes, multas and reportes.

## Endpoints / Components

| Location | Type | Description |
|----------|------|-------------|
| `packages/db/src/schema/grupos.ts` | New | `grupos` (id, nombre notNull, descripcion nullable) |
| `packages/db/src/schema/socio-grupos.ts` | New | `socio_grupos` (socioId+grupoId composite PK) |
| `packages/db/src/schema/socios.ts` | Modified | Add `grupoPrimarioId` FK |
| `packages/api/src/routes/grupos.ts` | New | CRUD clone of tipos-actividad + 409 delete-guard |
| `packages/api/src/routes/socios.ts` | Modified | Validate `grupoPrimarioId`/`grupoAdicionalIds`, invariant check, `?grupoId=` filter, joined `grupos` field |
| `packages/api/src/index.ts` | Modified | Mount `/api/grupos` |
| `packages/core/src/index.ts` | Modified | `Socio.grupoPrimarioId`, `Socio.grupos`; new `Grupo` type |
| `apps/web/src/routes/config.tsx` | Modified | "Grupos" CRUD cards (clone Tipos de Actividad block) |
| `apps/web/src/routes/socios.tsx` | Modified | Primary select + additional multi-select, group chips, group filter |
| `apps/web/src/stores/app.store.ts` | Modified | `grupos` state + actions |

## Requirements

### Requirement: Group CRUD

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

#### Scenario: Delete an unused group succeeds

- GIVEN a group with no primary nor additional membership
- WHEN DELETE /api/grupos/<id>
- THEN the response SHALL be 200 with the full grupos list
- AND the group SHALL no longer exist

#### Scenario: Delete a nonexistent group returns 404

- WHEN DELETE /api/grupos/fake-id
- THEN the response SHALL be 404

### Requirement: Socio ↔ Group Association

#### Scenario: Create socio with primary and additional groups

- GIVEN groups "g1" and "g2" exist
- WHEN POST /api/socios with { nombre: "Juan", apellidoPaterno: "Perez", grupoPrimarioId: "g1", grupoAdicionalIds: ["g2"] }
- THEN the socio SHALL be created with grupoPrimarioId="g1"
- AND socio_grupos SHALL contain (socioId, g2)
- AND the response SHALL include grupos=[{ id: "g2", nombre: ... }]

#### Scenario: Socio with no groups is valid

- WHEN POST /api/socios with { nombre: "Ana", apellidoPaterno: "Lopez" }
- THEN the socio SHALL be created
- AND grupoPrimarioId SHALL be null
- AND grupos SHALL be []

#### Scenario: Primary group cannot be among additional groups (invariant)

- WHEN POST /api/socios with { nombre: "J", apellidoPaterno: "P", grupoPrimarioId: "g1", grupoAdicionalIds: ["g1"] }
- THEN the response SHALL be 400
- AND the error SHALL indicate the primary group cannot be additional

#### Scenario: Unknown group ids are rejected on socio write

- WHEN POST /api/socios with { nombre: "J", apellidoPaterno: "P", grupoPrimarioId: "fake" }
- THEN the response SHALL be 400
- AND the error SHALL be { "error": "grupoPrimarioId is invalid" }
- WHEN PUT /api/socios/<id> with { grupoAdicionalIds: ["fake"] }
- THEN the response SHALL be 400
- AND the error SHALL be { "error": "grupoAdicionalIds contains an invalid group" }

#### Scenario: PUT replaces additional groups atomically

- GIVEN a socio with additional groups ["g1", "g2"]
- WHEN PUT /api/socios/<id> with { grupoAdicionalIds: ["g3"] }
- THEN socio_grupos SHALL contain exactly (socioId, g3)
- AND rows for g1 and g2 SHALL be removed in the same transaction
- AND grupoPrimarioId SHALL be preserved

#### Scenario: Invariant is enforced on update too

- GIVEN a socio with grupoPrimarioId="g1"
- WHEN PUT /api/socios/<id> with { grupoAdicionalIds: ["g1"] }
- THEN the response SHALL be 400

### Requirement: Group Filtering

#### Scenario: GET /api/socios?grupoId= returns members of a group

- GIVEN socios "s1" (primary=g1), "s2" (additional=g1 via join) and "s3" (no groups)
- WHEN GET /api/socios?grupoId=g1
- THEN the response SHALL include s1 and s2
- AND the response SHALL NOT include s3

#### Scenario: GET /api/socios?grupoId= combines with search

- WHEN GET /api/socios?grupoId=g1&search=juan
- THEN only socios of g1 matching "juan" SHALL be returned

#### Scenario: GET /api/socios?grupoId= with unknown group returns empty list

- WHEN GET /api/socios?grupoId=fake
- THEN the response SHALL be 200 with []

#### Scenario: GET /api/socios returns estado and group data per socio

- GIVEN a socio with estado "activo" and additional group "g2"
- WHEN GET /api/socios
- THEN each socio SHALL include estadoId, estadoNombre, estadoColor, esActivo, grupoPrimarioId and grupos (array of { id, nombre })

## Frontend Spec

- Config gains a "Grupos" card cloned from the Tipos de Actividad block: list with Editar/Eliminar, inline create form (`nombre` + optional `descripcion`); Eliminar shows a friendly 409 error when the group has socios
- Socio form: primary-group select + additional multi-select
- Socio list: group filter dropdown; ficha (detail section/modal) shows the primary group and group chips (wrapping at ~360px)
- Asistencia/aportes/multas/reportes pages expose the same group filter

## Validation

| Field | Rule |
|-------|------|
| `nombre` (grupo) | MUST be a non-empty string |
| `descripcion` (grupo) | Optional; nullable |
| `grupoPrimarioId` (socio) | MUST reference an existing group when provided |
| `grupoAdicionalIds` (socio) | MUST be an array of existing group ids when provided |
| Invariant | `grupoPrimarioId` MUST NOT appear in `grupoAdicionalIds` (SHALL be enforced on POST and PUT) |
| Additional set | MUST be replaced atomically on PUT (transaction) |

## Error States

| HTTP | Condition | Body |
|------|-----------|------|
| 400 | nombre missing, unknown group id, primary∈additional invariant violated | `{ "error": "..." }` |
| 404 | Group/socio not found | `{ "error": "Not found" }` |
| 409 | Group referenced by socios (primary or additional) | `{ "error": "Cannot delete: group has associated socios" }` |
| 500 | Internal DB error | `{ "error": "Internal server error" }` |
