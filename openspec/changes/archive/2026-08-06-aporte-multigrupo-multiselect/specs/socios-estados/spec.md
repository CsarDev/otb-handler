# Delta for Socios Estados

> **Delta** from `openspec/specs/socios-estados/spec.md` (aporte-multigrupo-multiselect): read-time inheritance and membership-time generation now resolve group-scoped definitions through the NEW M:N join table `aportes_definicion_grupos` (definitions apply to SEVERAL groups; `aplicaGrupoId` is gone). `aportesInherited` applies def-dedup (R2): ONE chip per definition, `AporteInherited` shape UNCHANGED `{ id, nombre, grupoId, grupoNombre }`, `grupoId` = the FIRST matching group in stable order (primary first, then additional groups by membership rowid) — so a definition applying via several of the socio's groups renders a single readable chip. Membership-time generation and socio-save generation (archived D16) are UNCHANGED in behavior — only the group-resolution source changes (join table instead of the single FK). The socio form replaces pill toggles with the shared searchable MultiSelect for `aporteIds` AND `grupoAdicionalIds`, with the primary group excluded from additional options (`excludeValues` invariant preserved).

> ⚠️ **Supersedes archived behavior (verify must re-check):** the archived "Inherits from both primary and secondary groups" scenario (chip per definition × single source group) is reworked — with M:N, ONE definition can match several groups at once and MUST render a single deduped chip (R2). Single-group scenarios keep their semantics through the join table.

## MODIFIED Requirements

### Requirement: Socio Model — aporteIds Multiselect (Many-to-Many)

The system MUST store socio↔aporte assignments in the join table `socio_aportes` (composite PK, pattern `socio_grupos`). The socio `POST`/`PUT` SHALL accept `aporteIds: string[]` (ONE OR MORE). Each id MUST reference an existing ACTIVE definition else the request is rejected. A socio created without `aporteIds` SHALL have NO direct assignments (there is no default-type fallback). `PUT` with `aporteIds` SHALL replace the assignment set atomically in the same transaction; `PUT` without `aporteIds` SHALL preserve the existing assignments. In the SAME transaction that persists the final assignment/membership set, the system MUST GENERATE the socio's cobro records automatically (per each assigned definition's `recurrencia` ∩ `inicio`/`fin` window, current gestión) for the direct `aporteIds` AND for the group-scoped definitions of the final membership set (primary + additional groups) — the latter resolved through the join table `aportes_definicion_grupos` (membership-time and socio-save generation, archived D16, otherwise UNCHANGED). New assignments SHALL generate only MISSING records (idempotent via the dedup invariant); removed assignments/memberships SHALL NEVER delete already-generated records; a socio whose estado does NOT permit `aportes` SHALL keep its assignment but generate 0 records (bulk-exclusion — the socio save SHALL NOT return 409). The socio form SHALL use the shared searchable MultiSelect (chips with ×, filter-as-you-type) for BOTH `aporteIds` and `grupoAdicionalIds`, replacing the pill toggles; the additional-groups MultiSelect SHALL exclude the socio's primary group from its options (`excludeValues=[grupoPrimarioId]`, preserving the "primary ∉ additional" invariant).
(Previously: group-scoped generation resolved through the single `aplicaGrupoId` FK; the socio form used pill toggles for `aporteIds`/`grupoAdicionalIds`.)

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
(Previously: inheritance matched the single `aplicaGrupoId` FK; a definition could not match several groups at once, so no def-dedup ordering rule existed.)

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
