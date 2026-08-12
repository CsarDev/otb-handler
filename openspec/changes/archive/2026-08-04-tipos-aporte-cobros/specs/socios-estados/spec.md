# Delta for Socios Estados

> Delta over `openspec/specs/socios-estados/spec.md`. The socio model drops the single-FK `tipoAporteId` (and the derived `aporteBase`) and switches to a many-to-many multiselect, `aporteIds`, over aporte DEFINITIONS (join `socio_aportes`, pattern `socio_grupos`). The socio read shape exposes direct assignments PLUS read-only inherited aportes resolved dynamically from group membership (primary + secondary groups via `aplicaGrupoId`), including FUTURE members — no materialized propagation, no pre-generated records. `POST /api/socios` no longer assigns a default type; a socio with no `aporteIds` has no direct assignments. Existing estados/estadoId/baja/soft-delete behavior is unchanged.

## ADDED Requirements

### Requirement: Socio Model — aporteIds Multiselect (Many-to-Many)

The system MUST store socio↔aporte assignments in the join table `socio_aportes` (composite PK, pattern `socio_grupos`). The socio `POST`/`PUT` SHALL accept `aporteIds: string[]` (ONE OR MORE). Each id MUST reference an existing ACTIVE definition else the request is rejected. A socio created without `aporteIds` SHALL have NO direct assignments (there is no default-type fallback). `PUT` with `aporteIds` SHALL replace the assignment set atomically in the same transaction; `PUT` without `aporteIds` SHALL preserve the existing assignments.

#### Scenario: POST socio with a multiselect of aportes

- GIVEN definitions "ap-mensual" and "ap-extra" exist and are active
- WHEN POST /api/socios with `{ nombre: "Juan", apellidoPaterno: "Perez", aporteIds: ["ap-mensual", "ap-extra"] }`
- THEN `socio_aportes` SHALL contain (socioId, ap-mensual) and (socioId, ap-extra)
- AND the response SHALL include `aporteIds: ["ap-mensual", "ap-extra"]`

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

#### Scenario: PUT replaces the assignment set atomically

- GIVEN a socio assigned to ["ap-mensual", "ap-extra"]
- WHEN PUT /api/socios/<id> with `{ aporteIds: ["ap-mensual"] }`
- THEN `socio_aportes` SHALL contain exactly (socioId, ap-mensual)
- AND the row for ap-extra SHALL be removed in the same transaction
- AND the response SHALL include `aporteIds: ["ap-mensual"]`

#### Scenario: PUT without aporteIds preserves existing assignments

- GIVEN a socio assigned to ["ap-mensual"]
- WHEN PUT /api/socios/<id> with `{ telefono: "123" }`
- THEN `socio_aportes` SHALL still contain (socioId, ap-mensual)
- AND `aporteIds` SHALL remain ["ap-mensual"]

#### Scenario: Full replace of a socio keeps the multiselect intact

- GIVEN a socio with direct assignments ["ap-mensual", "ap-anual"]
- WHEN replace is performed (PUT with the full socio payload including `aporteIds: ["ap-mensual", "ap-anual"]`)
- THEN the response SHALL include `aporteIds: ["ap-mensual", "ap-anual"]`
- AND both `socio_aportes` rows SHALL persist

### Requirement: Group Inheritance — Read-Only Inherited Aportes (Dynamic)

The system MUST resolve, at READ time, the set of aporte definitions inherited from the socio's group memberships: any definition whose `aplicaGrupoId` equals the socio's `grupoPrimarioId` OR one of its additional groups. Inherited definitions SHALL be exposed as read-only chips on the socio shape (`aportesInherited: Array<{ id, nombre, grupoId, grupoNombre }>`) — distinct from the editable `aporteIds`, NOT writable, with NO materialized `socio_aportes` rows and NO pre-generated records. Resolution SHALL be dynamic: a FUTURE member added to the group inherits automatically, and removing a member stops inheritance unless a direct assignment exists.

#### Scenario: Inherits from the primary group

- GIVEN definition "ap-grupo" has aplicaGrupoId="g1"
- AND socio "s1" has grupoPrimarioId="g1" and no direct assignment
- WHEN GET /api/socios/s1
- THEN the response SHALL include `aportesInherited: [{ id: "ap-grupo", nombre: "...", grupoId: "g1", grupoNombre: "..." }]`
- AND `aporteIds` SHALL be [] (no direct assignment)

#### Scenario: Inherits from a secondary group

- GIVEN definition "ap-g2" has aplicaGrupoId="g2"
- AND socio "s1" is an additional member of g2 (via `socio_grupos`) and has no direct assignment
- WHEN GET /api/socios/s1
- THEN the response SHALL include ap-g2 in `aportesInherited` with grupoId="g2"

#### Scenario: Inherits from both primary and secondary groups

- GIVEN definition "ap-g1" has aplicaGrupoId="g1" and definition "ap-g2" has aplicaGrupoId="g2"
- AND socio "s1" has grupoPrimarioId="g1" and is an additional member of g2
- WHEN GET /api/socios/s1
- THEN `aportesInherited` SHALL contain both ap-g1 and ap-g2, each with its source group id

#### Scenario: A future member inherits automatically without materialization

- GIVEN definition "ap-g1" has aplicaGrupoId="g1"
- WHEN a NEW socio "s1" is created and assigned grupoPrimarioId="g1" (no aporteIds)
- THEN GET /api/socios/s1 SHALL include ap-g1 in `aportesInherited`
- AND NO `socio_aportes` row SHALL exist for (s1, ap-g1)
- AND NO aporte record SHALL be generated by membership alone

#### Scenario: Removing a member stops inheritance unless directly assigned

- GIVEN socio "s1" is an additional member of g2 (definition ap-g2 has aplicaGrupoId="g2") with no direct assignment
- WHEN PUT /api/socios/s1 with `{ grupoAdicionalIds: [] }` (leaving g2)
- THEN GET /api/socios/s1 SHALL NOT include ap-g2 in `aportesInherited`
- GIVEN socio "s2" is a member of g2 AND directly assigned ap-g2 via `aporteIds`
- WHEN s2 leaves g2
- THEN ap-g2 SHALL still appear in `aporteIds` (direct assignment preserved)

#### Scenario: Direct assignment deduplicates the inherited chip

- GIVEN definition "ap-g1" has aplicaGrupoId="g1" and socio "s1" is BOTH a member of g1 AND directly assigned ap-g1
- WHEN GET /api/socios/s1
- THEN ap-g1 SHALL appear once in `aporteIds` (direct)
- AND ap-g1 SHALL NOT be duplicated in `aportesInherited`

#### Scenario: Inherited chips are read-only

- GIVEN socio "s1" inherits ap-g1 via its primary group
- WHEN the socio form is edited and saved WITHOUT modifying `aporteIds`
- THEN `aporteIds` SHALL remain the socio's direct assignments
- AND the inherited ap-g1 SHALL NOT be removable via `aporteIds`

## MODIFIED Requirements

### Requirement: Socio Read Shape — Drop tipoAporteId/aporteBase (Previously: derived from the assigned type)

The system MUST remove `tipoAporteId`, `tipoAporteNombre` and the derived `aporteBase` from the socio response shape. The previously-derived amount (from the single-FK type) SHALL NOT be exposed; amounts now exist only on aporte definitions. The migration SHALL drop `socios.tipo_aporte_id` and the legacy `socios.aporte_base` column using an additive-then-drop strategy (definitions + `socio_aportes` + `aportes.aporte_id` first; DROP only after verification). Generation never rewrites existing records retroactively — existing records are preserved as-is.

#### Scenario: Socio response no longer exposes tipoAporteId or aporteBase

- GIVEN a socio formerly mapped from a `tipoAporteId`
- WHEN GET /api/socios
- THEN the socio SHALL NOT include `tipoAporteId`, `tipoAporteNombre` or `aporteBase`
- AND the socio SHALL include `aporteIds: string[]` and `aportesInherited: [...]`

#### Scenario: PUT with a legacy `aporteBase` or `tipoAporteId` has no effect

- GIVEN an existing socio
- WHEN PUT /api/socios/<id> with `{ aporteBase: 999 }`
- THEN the response SHALL NOT reflect 999
- AND the socio fields SHALL remain unchanged (legacy fields are no longer writable)

#### Scenario: Migration drops type/base columns after additive step

- GIVEN `aportes_definicion`, `socio_aportes` and `aportes.aporte_id` exist
- WHEN the migration DROP step runs after verification
- THEN `socios.tipo_aporte_id` and `socios.aporte_base` SHALL be dropped
- AND existing aporte records SHALL remain unchanged

## REMOVED Requirements

### Requirement: Socio Model — tipoAporteId Replaces aporteBase as Source of Truth

(Reason: The single-FK `tipoAporteId` model is replaced by the corrected many-to-many multiselect model. A socio can now hold MULTIPLE aporte definitions (`aporteIds`) and the amount lives on each definition, not on the socio.)

### Requirement: Migration — Backfill de Socios Existentes a un Tipo

(Reason: In the corrected model there is no default-type backfill; a legacy socio without assignments is presented with `aporteIds: []` (group inheritance may still apply). No retroactive rewriting of type-derived amounts is performed.)

## Validation

| Field | Rule |
|-------|------|
| `aporteIds` (socio POST/PUT) | MUST be an array of existing ACTIVE definition ids when provided; omitted/PUT-preserved otherwise |
| Assignment set (PUT) | MUST be replaced atomically when `aporteIds` is provided (transaction, pattern `grupoAdicionalIds`) |
| `aportesInherited` | Read-only, resolved dynamically from group membership (`aplicaGrupoId`); never materialized |
| Direct vs inherited | Direct (`aporteIds`, editable) and inherited (`aportesInherited`, read-only) MUST be distinct, with no duplication |

## Error States

| HTTP | Condition | Body |
|------|-----------|------|
| 400 | `aporteIds` invalid id / inactive id / not an array | `{ "error": "aporteIds contains an invalid aporte" }` / `{ "error": "aporteIds must be an array" }` |
| 404 | Socio not found | `{ "error": "Not found" }` |
| — | No new transactional errors for the additive-then-drop migration (idempotent) | — |