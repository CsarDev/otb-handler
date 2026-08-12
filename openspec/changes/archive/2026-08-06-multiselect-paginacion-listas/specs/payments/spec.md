# Delta for Payments

> **Delta** from `openspec/specs/payments/spec.md` (multiselect-paginacion-listas, WS1): multas batch creation gains OPTIONAL group expansion. `POST /api/multas/bulk` accepts `grupoIds?: string[]`; the target set becomes the deduped UNION of the direct `socioIds` and the CURRENT members (primario OR adicional membership, `gruposAdicionalesPorSocio` pattern) of ALL `grupoIds`, then the existing `permite(...,'multas')` filter is applied and ONE multa per socio is materialized through the existing bulk loop. Semantics are POINT-IN-TIME: the fine charges the members at creation — a socio joining a group LATER is NOT retrocharged, and NO M:N `multa_grupos` tracking exists. Absent `grupoIds` the endpoint behaves EXACTLY as today (backward compatible). The web create form replaces the checkbox scrollbox with the searchable MultiSelect (socios AND grupos), and the raw `fetch('/api/multas/bulk')` moves into the store as `createMultasBulk`. No schema change, no migration, no DELETE-guard change.

> **Scenario status tags**: scenarios tagged `(IMPLEMENTED — regression)` verify pre-existing behavior that MUST be preserved; untagged scenarios are NEW and are the verify targets of this change.

## ADDED Requirements

### Requirement: Multas Bulk — Grupo Expansion (`grupoIds`)

`POST /api/multas/bulk` MUST accept an OPTIONAL `grupoIds?: string[]` in addition to the existing `socioIds`, `concepto`, `monto`, `actividadId?`, `fecha?`. When `grupoIds` is present, the system MUST resolve the target set as the deduped UNION of the direct `socioIds` and the CURRENT members (primario OR adicional membership) of ALL `grupoIds`. Each `grupoId` MUST reference an existing group, else the request SHALL be rejected with 400 and no multa created. The resolved set SHALL be permission-filtered with the existing `permite(...,'multas')` rule (non-permitted socios excluded, same as today's direct-socio bulk). The system MUST materialize ONE multa per remaining socio via the existing bulk transaction loop and respond `201 { count, items }`. Semantics are POINT-IN-TIME: only CURRENT members at creation are charged; a socio joining a group LATER SHALL NOT be retrocharged; no `multa_grupos` relationship SHALL be persisted. When `grupoIds` is ABSENT, the endpoint SHALL behave exactly as today (`socioIds` remains required).

#### Scenario: Bulk with grupoIds creates one multa per current member — NEW

- GIVEN group "g1" exists with current members "s1" (primary) and "s2" (additional via `socio_grupos`)
- AND s1 and s2 have estados that permit "multas"
- WHEN POST /api/multas/bulk with { grupoIds: ["g1"], concepto: "Falta injustificada", monto: 50 }
- THEN the response SHALL be 201 with { count: 2, items }
- AND exactly one multa SHALL be created for s1 AND one for s2, both with concepto="Falta injustificada" and monto=50

#### Scenario: A socio in a selected grupo AND in direct socioIds is charged once — NEW

- GIVEN group "g1" has current member "s1" AND the body also lists "s1" in socioIds
- WHEN POST /api/multas/bulk with { socioIds: ["s1", "s2"], grupoIds: ["g1"], concepto: "x", monto: 10 }
- THEN the response SHALL be 201 with { count: 2 }
- AND exactly ONE multa SHALL exist for s1 (dedup on the union — no double charge)

#### Scenario: A group with zero members contributes no multas — NEW

- GIVEN group "g-empty" exists with NO current members
- WHEN POST /api/multas/bulk with { socioIds: ["s2"], grupoIds: ["g-empty"], concepto: "x", monto: 10 }
- THEN the response SHALL be 201 with { count: 1 }
- AND only the multa for s2 SHALL be created

#### Scenario: Group members whose estado does not permit "multas" are excluded — NEW

- GIVEN group "g1" has current members "s1" (permits "multas") and "s3" (does NOT permit "multas")
- WHEN POST /api/multas/bulk with { grupoIds: ["g1"], concepto: "x", monto: 10 }
- THEN the response SHALL be 201 with { count: 1 }
- AND a multa SHALL exist only for s1

#### Scenario: A socio joining the group after creation is NOT retrocharged — NEW

- GIVEN POST /api/multas/bulk with { grupoIds: ["g1"] } created multas for the then-current members
- WHEN socio "s9" is later added to g1 (membership change after creation)
- THEN NO multa SHALL be created for s9 from that earlier bulk call
- AND NO `multa_grupos` row SHALL exist (point-in-time semantics, no M:N tracking)

#### Scenario: Unknown grupoId is rejected — NEW

- WHEN POST /api/multas/bulk with { socioIds: ["s1"], grupoIds: ["fake-group"], concepto: "x", monto: 10 }
- THEN the response SHALL be 400
- AND no multa SHALL be created

#### Scenario: Bulk without grupoIds behaves exactly as today — IMPLEMENTED (regression)

- GIVEN socios "s1" (permits "multas") and "s2" (does NOT permit "multas")
- WHEN POST /api/multas/bulk with { socioIds: ["s1", "s2"], concepto: "Falta", monto: 30 }
- THEN the response SHALL be 201 with { count: 1 }
- AND a multa SHALL exist only for s1 (unchanged exclusion behavior)

#### Scenario: Group path where all members are excluded returns the existing 400 — NEW

- GIVEN group "g1" whose members' estados do NOT permit "multas"
- WHEN POST /api/multas/bulk with { grupoIds: ["g1"], concepto: "x", monto: 10 }
- THEN the response SHALL be 400 with { "error": "Ningún socio puede participar en esta acción en su estado actual" }

### Requirement: Multas Create Form — Searchable MultiSelect (socios + grupos)

The multas create form (`apps/web/src/routes/multas.tsx`) MUST replace the checkbox scrollbox with the searchable MultiSelect component for Socios, and MUST add a second searchable MultiSelect for Grupos. Both selectors SHALL support filter-as-you-type (case-insensitive substring) and selected chips with a remove action, per the D32 pattern in `@otb/ui`. The Grupos selector SHALL be OPTIONAL and combinable with the direct socios selection (the effective charge set is the union, matching the API). The form SHALL display copy clarifying that a group charge applies to the CURRENT members of the group at creation time.

#### Scenario: Create form renders MultiSelects instead of the checkbox scrollbox — NEW

- GIVEN the multas create form on /multas
- WHEN the form is rendered
- THEN a searchable MultiSelect for Socios SHALL render (no checkbox scrollbox)
- AND a second searchable MultiSelect for Grupos SHALL render

#### Scenario: Filter-as-you-type narrows the socio and grupo options — NEW

- GIVEN a Socios MultiSelect with options "Juan Perez" and "Maria Lopez"
- WHEN the user types "mar" in the filter input
- THEN only "Maria Lopez" SHALL remain visible in the dropdown

#### Scenario: Selecting a grupo shows that its current members will be charged — NEW

- GIVEN the user selects group "g1" in the Grupos MultiSelect
- WHEN the form state updates
- THEN the form SHALL show copy indicating the fine applies to the current members of g1 (e.g. "se aplicará a todos los socios del grupo")
- AND the effective target count SHALL reflect the union of the selected socios and the current members of the selected groups

#### Scenario: A socio selected directly AND via a grupo appears once in the charge set — NEW

- GIVEN socio "s1" is selected in the Socios MultiSelect AND "s1" is a current member of a selected grupo
- WHEN the form is submitted
- THEN the payload SHALL resolve s1 exactly once in the target set (dedup)

### Requirement: Multas Bulk — Store Action (`createMultasBulk`)

The web store (`apps/web/src/stores/app.store.ts`) MUST expose a `createMultasBulk(payload)` action that calls `POST /api/multas/bulk` and handles the response, replacing the raw `fetch('/api/multas/bulk')` in `multas.tsx`. The action SHALL follow the existing `createAportesBulk` pattern: it SHALL accept `{ socioIds?, grupoIds?, concepto, monto, actividadId? }`, refresh the multas list on success, and surface 400/409 errors as friendly messages (consistent with store error handling).

#### Scenario: Submitting the create form calls the store action, not a raw fetch — NEW

- GIVEN the multas create form
- WHEN the user submits the form with socios/grupos, concepto and monto
- THEN the submission SHALL invoke the `createMultasBulk` store action
- AND NO raw `fetch('/api/multas/bulk')` SHALL be called from the route component

#### Scenario: Store action surfaces API errors as friendly messages — NEW

- GIVEN the API responds 400 (e.g. "Ningún socio puede participar en esta acción en su estado actual")
- WHEN `createMultasBulk` is invoked
- THEN the action SHALL surface the API error message to the UI (no unhandled rejection)
