# Payments — Pagos Atómicos con Transacciones y Enforcement por Acción

## Capability

`payments`

> **Delta** from `openspec/specs/payments/spec.md`: all socio-associated payment operations MUST now respect the state action catalog. Aporte/multa creation, bulk and edit require the `aportes`/`multas` action on the socio's estado; `pagar` requires `pagos`; `anular` requires `anulaciones`. Violations are rejected with 409 (friendly message) or excluded in bulk. The existing atomic-transaction behavior is unchanged.

> **Delta** from `openspec/changes/aporte-cobro-unificado` (archived 2026-08-05): aporte record generation gains TWO additions on top of the retained definition-driven manual endpoints: (1) a NEW AUTO-GENERATION TRIGGER at assignment — definition creation with assignment, socio save with assignments, and membership-time group generation — all flowing through the SAME shared definition-driven generator; (2) a MANDATORY DEDUP INVARIANT — the system MUST never create a duplicate cobro record for the same (socio, aporte, mes, gestion) on ANY path, making the retained single `POST /api/aportes`, `/bulk` and `/bulk/all` endpoints dedup-safe on re-run. `GET /:id/pagos`, pay/anular flows and partial payments are UNCHANGED.

> **Delta** from `openspec/changes/multiselect-paginacion-listas` (archived 2026-08-06): multas batch creation gains OPTIONAL group expansion — `POST /api/multas/bulk` accepts `grupoIds?: string[]`; the target set becomes the deduped UNION of the direct `socioIds` and the CURRENT members (primario OR adicional membership, `gruposAdicionalesPorSocio` pattern) of ALL `grupoIds`, then the existing `permite(...,'multas')` filter is applied and ONE multa per socio is materialized through the existing bulk loop. Semantics are POINT-IN-TIME: the fine charges the members at creation — a socio joining a group LATER is NOT retrocharged, and NO M:N `multa_grupos` tracking exists. Absent `grupoIds` the endpoint behaves EXACTLY as today (backward compatible). The web create form replaces the checkbox scrollbox with the searchable MultiSelect (socios AND grupos), and the raw `fetch('/api/multas/bulk')` moves into the store as `createMultasBulk`. No schema change, no migration, no DELETE-guard change.

## Description

Actualmente tanto `POST /api/aportes/:id/pagar` como `POST /api/multas/:id/pagar` ejecutan la inserción del movimiento y la actualización del estado como operaciones separadas sin transacción. Si la inserción del movimiento falla después de actualizar el estado, se genera inconsistencia de datos. Esta spec requiere envolver ambos endpoints en transacciones atómicas. Además, con el catálogo de estados, toda operación que toca a un socio SHALL validar la acción correspondiente vía `socioPermite(socio, accionClave)` — `aportes` para crear/editar/bulk aportes, `multas` para crear/editar/bulk multas, `pagos` para pagar, `anulaciones` para anular — y rechazar con 409 (o excluir en bulk) a los socios cuyo estado no lo permita.

## Endpoints / Components

| Ubicación | Tipo | Descripción |
|-----------|------|-------------|
| `packages/api/src/routes/aportes.ts` | Modified | POST /:id/pagar envuelto en transacción Drizzle; enforcement `aportes`/`pagos`/`anulaciones`; filtros estado/grupo |
| `packages/api/src/routes/multas.ts` | Modified | POST /:id/pagar envuelto en transacción Drizzle; enforcement `multas`/`pagos`/`anulaciones`; filtros estado/grupo |
| `packages/core/src/index.ts` | Modified | Helper `socioPermite(socio, accionClave)` compartido |

## Requirements

### Requirement: Aportes — Pago Atómico

#### Scenario: Pago exitoso crea movimiento y actualiza aporte en transacción

- GIVEN existe un aporte con id="ap1", estado="pendiente", montoBase=100
- AND el socio del aporte tiene un estado que permite "pagos"
- WHEN se invoca POST /api/aportes/ap1/pagar con body { "monto": 100 }
- THEN la transacción SHALL:
  - Insertar un movimiento con tipo="ingreso", monto=100, referenciaId="ap1"
  - Actualizar aporte: estado="pagado", fechaPago, numeroRecibo
- AND si ambas operaciones son exitosas, SHALL hacer commit
- AND la respuesta SHALL ser 200 con el aporte actualizado

#### Scenario: Pago fallido hace rollback si falla inserción de movimiento

- GIVEN existe un aporte con id="ap1", estado="pendiente"
- WHEN se invoca POST /api/aportes/ap1/pagar
- AND la inserción del movimiento falla (ej: violación de constraint)
- THEN la transacción SHALL hacer rollback
- AND el aporte SHALL mantener estado="pendiente"
- AND NO SHALL existir ningún movimiento nuevo con referenciaId="ap1"

#### Scenario: Pago parcial en aporte (monto < montoBase) mantiene estado pendiente

- GIVEN existe un aporte con id="ap1", montoBase=100, estado="pendiente"
- WHEN se invoca POST /api/aportes/ap1/pagar con body { "monto": 40 }
- THEN la transacción SHALL crear movimiento por 40
- AND el aporte SHALL quedar con estado="pendiente"
- AND la respuesta SHALL ser 200

### Requirement: Multas — Pago Atómico

#### Scenario: Pago de multa exitoso en transacción

- GIVEN existe una multa con id="m1", estado="pendiente", saldoPendiente=100
- AND el socio de la multa tiene un estado que permite "pagos"
- WHEN se invoca POST /api/multas/m1/pagar con body { "monto": 100 }
- THEN la transacción SHALL:
  - Insertar un movimiento con tipo="ingreso", monto=100, referenciaId="m1"
  - Actualizar multa: estado="pagado", saldoPendiente=0, fechaPago
- AND si ambas operaciones son exitosas, SHALL hacer commit

#### Scenario: Rollback en pago de multa si falla inserción

- GIVEN existe una multa con id="m1", saldoPendiente=100
- WHEN se invoca POST /api/multas/m1/pagar
- AND la inserción del movimiento falla
- THEN la transacción SHALL hacer rollback
- AND la multa SHALL mantener saldoPendiente=100 y estado="pendiente"

### Requirement: Transacciones — Comportamiento General

#### Scenario: Transacción usa el mismo objeto db de Drizzle (tx), no db global

- GIVEN el handler de pago
- WHEN se inicia la transacción con db.transaction((tx) => { ... })
- THEN todas las operaciones SHALL usar el objeto tx, no db
- AND SHALL seguir el patrón: tx.insert(...), tx.update(...), tx.delete(...)

#### Scenario: Número de recibo opcional en pago

- GIVEN existe un aporte/multa pendiente
- WHEN se invoca POST /:id/pagar con body { "monto": 100, "numeroRecibo": "R-001" }
- THEN el movimiento SHALL guardar numeroRecibo="R-001"
- AND si no se provee, numeroRecibo SHALL ser null

### Requirement: Enforcement por Acción (Delta)

#### Scenario: Crear aporte de socio sin acción "aportes" se rechaza con 409

- GIVEN un socio cuyo estado NO permite "aportes" (ej: dado_de_baja)
- WHEN se invoca POST /api/aportes con body { socioId: "<ese-socio>", montoBase: 50 }
- THEN la respuesta SHALL ser 409
- AND el error SHALL ser amigable, ej: `{ "error": "El socio no puede realizar esta acción en su estado actual" }`
- AND NO SHALL crearse el aporte

#### Scenario: Actualizar aporte de socio sin acción "aportes" se rechaza con 409

- GIVEN un aporte existente cuyo socio NO permite "aportes"
- WHEN se invoca PUT /api/aportes/<id>
- THEN la respuesta SHALL ser 409

#### Scenario: Bulk de aportes excluye socios no permitidos

- GIVEN el bulk incluye s1 (permite "aportes") y s2 (NO permite "aportes")
- WHEN se invoca POST /api/aportes/bulk con socioIds=[s1, s2]
- THEN la respuesta SHALL ser 201
- AND SHALL crearse aportes solo para s1
- AND s2 SHALL quedar excluido del batch

#### Scenario: Bulk donde todos los socios están excluidos retorna 400

- GIVEN el bulk solo incluye socios cuyo estado NO permite "aportes"
- WHEN se invoca POST /api/aportes/bulk
- THEN la respuesta SHALL ser 400
- AND el error SHALL indicar que ningún socio puede participar

#### Scenario: Pagar un aporte requiere la acción "pagos"

- GIVEN un aporte de un socio cuyo estado permite "aportes" pero NO "pagos"
- WHEN se invoca POST /api/aportes/<id>/pagar
- THEN la respuesta SHALL ser 409
- AND el movimiento NO SHALL insertarse

#### Scenario: Pagar una multa requiere la acción "pagos"

- GIVEN una multa de un socio cuyo estado NO permite "pagos"
- WHEN se invoca POST /api/multas/<id>/pagar
- THEN la respuesta SHALL ser 409

#### Scenario: Crear multa de socio sin acción "multas" se rechaza con 409

- GIVEN un socio cuyo estado NO permite "multas"
- WHEN se invoca POST /api/multas con body { socioId: "<ese-socio>", concepto: "x", monto: 10 }
- THEN la respuesta SHALL ser 409
- AND NO SHALL crearse la multa

#### Scenario: Bulk de multas excluye socios no permitidos

- WHEN se invoca POST /api/multas/bulk con socioIds=[s1(permite), s2(no permite)]
- THEN la respuesta SHALL ser 201 con multas solo para s1

#### Scenario: Anular un aporte requiere la acción "anulaciones"

- GIVEN un aporte de un socio cuyo estado NO permite "anulaciones"
- WHEN se invoca POST /api/aportes/<id>/anular con body { razon: "error" }
- THEN la respuesta SHALL ser 409
- AND el aporte SHALL mantener su estado

#### Scenario: Anular una multa requiere la acción "anulaciones"

- GIVEN una multa de un socio cuyo estado NO permite "anulaciones"
- WHEN se invoca POST /api/multas/<id>/anular con body { razon: "error" }
- THEN la respuesta SHALL ser 409

#### Scenario: Listas de aportes y multas soportan filtros por estado y grupo

- GIVEN existen aportes/multas de socios con distintos estados y grupos
- WHEN se invoca GET /api/aportes?estadoId=<id> y GET /api/multas?grupoId=<id>
- THEN la respuesta SHALL filtrarse por estado del socio o pertenencia a grupo
- AND los filtros SHALL poder combinarse con los filtros existentes (socioId, estado, gestion...)

### Requirement: Auto-Generation at Assignment (New Trigger)

The system MUST generate aporte cobro records automatically — in the same transaction as the assignment — whenever any of these events happens: (a) a definition is created with an assignment (`socioIds` and/or `aplicaGrupoId`); (b) a socio is created or replaced with aporte assignments; (c) a membership is created (socio save adding a group that has group-scoped definitions). Generation SHALL use the SAME shared definition-driven generator as the manual endpoints: record `monto` from the definition, one record per month of the definition's `recurrencia` ∩ `inicio`/`fin` window, for the CURRENT gestión (no `mes` override at creation). Socios whose estado does NOT permit the `aportes` action SHALL be EXCLUDED from auto-generation (assignment preserved, 0 records — bulk-exclusion pattern; the triggering request SHALL NOT return 409).

#### Scenario: Definition creation with assignment generates records for the direct socios

- GIVEN socios "s1" and "s2" exist with estados that permit "aportes"
- AND a definition "d" is created with `socioIds: ["s1", "s2"]`, recurrencia="mensual", inicio="2025-03-01", fin="2025-04-30"
- WHEN the creation transaction commits
- THEN cobro records SHALL exist for (s1, d, mes=3) and (s1, d, mes=4) and the same for s2
- AND each record SHALL have monto = d.monto

#### Scenario: Socio save with aporte assignments generates that person's records

- GIVEN definition "ap-mensual" has recurrencia="mensual" and a vigencia window covering the current gestión
- WHEN POST /api/socios commits the socio with `aporteIds: ["ap-mensual"]`
- THEN cobro records for (s1, ap-mensual, current gestión months) SHALL exist

#### Scenario: Membership-time generation for group-scoped definitions

- GIVEN definition "ap-grupo" has aplicaGrupoId="g1"
- WHEN a socio "s1" is saved with membership in g1 (no direct assignment to ap-grupo)
- THEN cobro records for (s1, ap-grupo, current gestión months) SHALL be generated at membership time

#### Scenario: Non-permitted socio is excluded from auto-generation without 409

- GIVEN socio "s2" has an estado that does NOT permit "aportes"
- WHEN a definition is created with `socioIds: ["s2"]` (or s2 is saved with assignments)
- THEN the request SHALL succeed (NO 409)
- AND s2 SHALL keep its assignment
- AND 0 cobro records SHALL be generated for s2

### Requirement: Mandatory Dedup Invariant

The system MUST NEVER create a duplicate cobro record for the same (socio, aporte, mes, gestion) on ANY generation path: definition creation with assignment, socio create/replace, membership change, and the retained single `POST /api/aportes`, `/bulk` and `/bulk/all` endpoints (which SHALL become dedup-safe). Re-running any generation for an already-materialized (socio, aporte, mes, gestion) SHALL be a no-op for those rows — the shared generator SHALL skip rows that already exist inside the transaction (SELECT-before-INSERT or `INSERT ... ON CONFLICT DO NOTHING` against the optional partial unique index on `aportes(socioId, aporteId, mes, gestion)` where `aporteId IS NOT NULL`).

#### Scenario: Re-running creation-with-assignment never duplicates

- GIVEN a definition "d" created with `socioIds: ["s1"]` already generated records for (s1, d, current gestión)
- WHEN the socio is re-saved with the same assignments (or the same generation path re-runs)
- THEN no additional (s1, d, mes, gestion) rows SHALL be inserted for the months already generated
- AND the number of rows for (s1, d) SHALL remain unchanged

#### Scenario: Socio re-save is idempotent

- GIVEN socio "s1" already has records for (s1, ap-mensual, current gestión) from a previous save
- WHEN PUT /api/socios/s1 is invoked again with the same `aporteIds`
- THEN the response SHALL report 0 newly generated records
- AND no duplicate rows SHALL exist

#### Scenario: Manual bulk re-run is dedup-safe

- GIVEN records for (s1, ap-mensual, gestion 2025) already exist
- WHEN POST /api/aportes/bulk with `{ socioIds: ["s1"], aporteIds: ["ap-mensual"], gestion: 2025 }` is invoked again
- THEN the response SHALL be 201 with `{ count: 0, items: [] }` (only NEW rows are counted)
- AND no duplicate (s1, ap-mensual, mes, 2025) rows SHALL exist

#### Scenario: Single endpoint re-run is dedup-safe

- GIVEN records for (s1, ap-mensual, gestion 2025, mes=1..12) already exist
- WHEN POST /api/aportes with `{ socioId: "s1", aporteId: "ap-mensual", gestion: 2025 }` is invoked again
- THEN the response SHALL be 201 with `{ count: 0, items: [] }`
- AND no duplicate rows SHALL exist

#### Scenario: Membership re-assertion does not duplicate

- GIVEN socio "s1" is a member of g1 and records for (s1, ap-grupo, current gestión) were generated at membership time
- WHEN s1's membership in g1 is re-saved (PUT with the same groups)
- THEN no additional (s1, ap-grupo, mes, gestion) rows SHALL be created

### Requirement: Multas Bulk — Grupo Expansion (`grupoIds`)

`POST /api/multas/bulk` MUST accept an OPTIONAL `grupoIds?: string[]` in addition to the existing `socioIds`, `concepto`, `monto`, `actividadId?`, `fecha?`. When `grupoIds` is present, the system MUST resolve the target set as the deduped UNION of the direct `socioIds` and the CURRENT members (primario OR adicional membership) of ALL `grupoIds`. Each `grupoId` MUST reference an existing group, else the request SHALL be rejected with 400 and no multa created. The resolved set SHALL be permission-filtered with the existing `permite(...,'multas')` rule (non-permitted socios excluded, same as today's direct-socio bulk). The system MUST materialize ONE multa per remaining socio via the existing bulk transaction loop and respond `201 { count, items }`. Semantics are POINT-IN-TIME: only CURRENT members at creation are charged; a socio joining a group LATER SHALL NOT be retrocharged; no `multa_grupos` relationship SHALL be persisted. When `grupoIds` is ABSENT, the endpoint SHALL behave exactly as today (`socioIds` remains required).

#### Scenario: Bulk with grupoIds creates one multa per current member

- GIVEN group "g1" exists with current members "s1" (primary) and "s2" (additional via `socio_grupos`)
- AND s1 and s2 have estados that permit "multas"
- WHEN POST /api/multas/bulk with { grupoIds: ["g1"], concepto: "Falta injustificada", monto: 50 }
- THEN the response SHALL be 201 with { count: 2, items }
- AND exactly one multa SHALL be created for s1 AND one for s2, both with concepto="Falta injustificada" and monto=50

#### Scenario: A socio in a selected grupo AND in direct socioIds is charged once

- GIVEN group "g1" has current member "s1" AND the body also lists "s1" in socioIds
- WHEN POST /api/multas/bulk with { socioIds: ["s1", "s2"], grupoIds: ["g1"], concepto: "x", monto: 10 }
- THEN the response SHALL be 201 with { count: 2 }
- AND exactly ONE multa SHALL exist for s1 (dedup on the union — no double charge)

#### Scenario: A group with zero members contributes no multas

- GIVEN group "g-empty" exists with NO current members
- WHEN POST /api/multas/bulk with { socioIds: ["s2"], grupoIds: ["g-empty"], concepto: "x", monto: 10 }
- THEN the response SHALL be 201 with { count: 1 }
- AND only the multa for s2 SHALL be created

#### Scenario: Group members whose estado does not permit "multas" are excluded

- GIVEN group "g1" has current members "s1" (permits "multas") and "s3" (does NOT permit "multas")
- WHEN POST /api/multas/bulk with { grupoIds: ["g1"], concepto: "x", monto: 10 }
- THEN the response SHALL be 201 with { count: 1 }
- AND a multa SHALL exist only for s1

#### Scenario: A socio joining the group after creation is NOT retrocharged

- GIVEN POST /api/multas/bulk with { grupoIds: ["g1"] } created multas for the then-current members
- WHEN socio "s9" is later added to g1 (membership change after creation)
- THEN NO multa SHALL be created for s9 from that earlier bulk call
- AND NO `multa_grupos` row SHALL exist (point-in-time semantics, no M:N tracking)

#### Scenario: Unknown grupoId is rejected

- WHEN POST /api/multas/bulk with { socioIds: ["s1"], grupoIds: ["fake-group"], concepto: "x", monto: 10 }
- THEN the response SHALL be 400
- AND no multa SHALL be created

#### Scenario: Bulk without grupoIds behaves exactly as today

- GIVEN socios "s1" (permits "multas") and "s2" (does NOT permit "multas")
- WHEN POST /api/multas/bulk with { socioIds: ["s1", "s2"], concepto: "Falta", monto: 30 }
- THEN the response SHALL be 201 with { count: 1 }
- AND a multa SHALL exist only for s1 (unchanged exclusion behavior)

#### Scenario: Group path where all members are excluded returns the existing 400

- GIVEN group "g1" whose members' estados do NOT permit "multas"
- WHEN POST /api/multas/bulk with { grupoIds: ["g1"], concepto: "x", monto: 10 }
- THEN the response SHALL be 400 with { "error": "Ningún socio puede participar en esta acción en su estado actual" }

### Requirement: Multas Create Form — Searchable MultiSelect (socios + grupos)

The multas create form (`apps/web/src/routes/multas.tsx`) MUST replace the checkbox scrollbox with the searchable MultiSelect component for Socios, and MUST add a second searchable MultiSelect for Grupos. Both selectors SHALL support filter-as-you-type (case-insensitive substring) and selected chips with a remove action, per the D32 pattern in `@otb/ui`. The Grupos selector SHALL be OPTIONAL and combinable with the direct socios selection (the effective charge set is the union, matching the API). The form SHALL display copy clarifying that a group charge applies to the CURRENT members of the group at creation time.

#### Scenario: Create form renders MultiSelects instead of the checkbox scrollbox

- GIVEN the multas create form on /multas
- WHEN the form is rendered
- THEN a searchable MultiSelect for Socios SHALL render (no checkbox scrollbox)
- AND a second searchable MultiSelect for Grupos SHALL render

#### Scenario: Filter-as-you-type narrows the socio and grupo options

- GIVEN a Socios MultiSelect with options "Juan Perez" and "Maria Lopez"
- WHEN the user types "mar" in the filter input
- THEN only "Maria Lopez" SHALL remain visible in the dropdown

#### Scenario: Selecting a grupo shows that its current members will be charged

- GIVEN the user selects group "g1" in the Grupos MultiSelect
- WHEN the form state updates
- THEN the form SHALL show copy indicating the fine applies to the current members of g1 (e.g. "se aplicará a todos los socios del grupo")
- AND the effective target count SHALL reflect the union of the selected socios and the current members of the selected groups

#### Scenario: A socio selected directly AND via a grupo appears once in the charge set

- GIVEN socio "s1" is selected in the Socios MultiSelect AND "s1" is a current member of a selected grupo
- WHEN the form is submitted
- THEN the payload SHALL resolve s1 exactly once in the target set (dedup)

### Requirement: Multas Bulk — Store Action (`createMultasBulk`)

The web store (`apps/web/src/stores/app.store.ts`) MUST expose a `createMultasBulk(payload)` action that calls `POST /api/multas/bulk` and handles the response, replacing the raw `fetch('/api/multas/bulk')` in `multas.tsx`. The action SHALL follow the existing `createAportesBulk` pattern: it SHALL accept `{ socioIds?, grupoIds?, concepto, monto, actividadId? }`, refresh the multas list on success, and surface 400/409 errors as friendly messages (consistent with store error handling).

#### Scenario: Submitting the create form calls the store action, not a raw fetch

- GIVEN the multas create form
- WHEN the user submits the form with socios/grupos, concepto and monto
- THEN the submission SHALL invoke the `createMultasBulk` store action
- AND NO raw `fetch('/api/multas/bulk')` SHALL be called from the route component

#### Scenario: Store action surfaces API errors as friendly messages

- GIVEN the API responds 400 (e.g. "Ningún socio puede participar en esta acción en su estado actual")
- WHEN `createMultasBulk` is invoked
- THEN the action SHALL surface the API error message to the UI (no unhandled rejection)

## Validation

| Campo | Regla |
|-------|-------|
| `monto` (pago) | MUST ser número positivo > 0 |
| `monto` (pago) | Si no se provee, SHALL usar `montoBase` (aporte) o `saldoPendiente` (multa) |
| `numeroRecibo` | OPCIONAL |
| `fechaPago` | OPCIONAL, default = fecha actual ISO |
| Acción `aportes` | MUST permitirse en el estado del socio para POST/PUT/bulk de aportes |
| Acción `multas` | MUST permitirse en el estado del socio para POST/PUT/bulk de multas |
| Acción `pagos` | MUST permitirse en el estado del socio para POST /:id/pagar |
| Acción `anulaciones` | MUST permitirse en el estado del socio para POST /:id/anular |
| `grupoIds` (multas bulk, OPCIONAL) | MUST ser un array de ids de grupos existentes; non-array o id desconocido → 400; ausente o `[]` → comportamiento exacto de hoy |

## Error States

| HTTP | Condición | Cuerpo |
|------|-----------|--------|
| 404 | Aporte/multa no encontrado | `{ "error": "Aporte not found" }` / `{ "error": "Multa not found" }` |
| 400 | Ya pagado | `{ "error": "Aporte already paid" }` / `{ "error": "Multa already paid" }` |
| 400 | Monto inválido / bulk sin socios elegibles | `{ "error": "Amount must be positive" }` / `{ "error": "..." }` |
| 400 | `grupoIds` non-array o referencia un grupo inexistente (multas bulk) | `{ "error": "grupoIds must be an array" }` / `{ "error": "grupoIds contains an invalid group" }` |
| 409 | Estado del socio no permite la acción (`aportes`/`multas`/`pagos`/`anulaciones`) | `{ "error": "El socio no puede realizar esta acción en su estado actual" }` |
| 500 | Rollback por error interno | `{ "error": "Internal server error" }` |
