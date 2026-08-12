# Delta for Payments

> Delta over `openspec/specs/payments/spec.md`. Reworks aporte generation to be DEFINITION-DRIVEN (corrected model): the record `monto` and the record count now come from the assigned aporte DEFINITION (`aporteId` → `aportes_definicion`), NOT from the socio's type nor from any client-supplied number. The manual override (old D4) and the `monto`/`tipo` fields in the creation body disappear — the `tipo`/`recurrencia` now lives on the definition. `anual` still forces 12 records (Jan–Dec) and `unico`/`extraordinario` 1 record; `mensual` generates N records within the definition's `inicio`/`fin` vigencia window. `GET /api/aportes/:id/pagos` movement history is preserved (pattern `multas`, excludes voided movements). Enforcement by estado via `cargarPermisosPorEstado`/`permite(...,'aportes')` (NOT a hardcoded `estado='activo'`) is unchanged. Absorbs the pending work previously in the `aporte-types` delta and `ux-avanzado-otb`.

## ADDED Requirements

### Requirement: Single Aporte — Definition-Driven POST /api/aportes

The system MUST accept `POST /api/aportes` with `{ socioId, aporteId, gestion }` (and, for `mensual`, an optional starting `mes`). The record's `monto` MUST be read from the assigned definition's `monto` and the record count MUST follow the definition's `recurrencia` (`anual` → 12, `unico`/`extraordinario` → 1, `mensual` → N within the vigencia window). The definition MUST be active and applicable to the socio (directly assigned via `socio_aportes` OR inherited via group `aplicaGrupoId`). A `monto` field in the body MUST be ignored/rejected — no manual override exists.

#### Scenario: Single mensual uses the definition's monto and window count

- GIVEN definition "ap-mensual" has monto=50, recurrencia="mensual", inicio="2025-03-01", fin="2025-05-31"
- AND socio "s1" is directly assigned "ap-mensual"
- WHEN POST /api/aportes with `{ socioId: "s1", aporteId: "ap-mensual", gestion: 2025 }`
- THEN SHALL create 3 records with mes=3,4,5 and monto=50 each
- AND the response SHALL be 201 with `{ count: 3, items: [...] }`

#### Scenario: Single anual creates exactly 12 records from the definition

- GIVEN definition "ap-anual" has monto=500, recurrencia="anual"
- AND socio "s1" is assigned "ap-anual"
- WHEN POST /api/aportes with `{ socioId: "s1", aporteId: "ap-anual", gestion: 2025 }`
- THEN SHALL create exactly 12 records with mes=1..12, monto=500, tipo="anual"

#### Scenario: Single unico creates one record

- GIVEN definition "ap-unico" has monto=200, recurrencia="unico"
- AND socio "s1" is assigned "ap-unico"
- WHEN POST /api/aportes with `{ socioId: "s1", aporteId: "ap-unico", gestion: 2025 }`
- THEN SHALL create exactly 1 record with monto=200 and tipo="unico"

#### Scenario: Single extraordinario creates one record

- GIVEN definition "ap-extra" has monto=80, recurrencia="extraordinario"
- AND socio "s1" is assigned "ap-extra"
- WHEN POST /api/aportes with `{ socioId: "s1", aporteId: "ap-extra", gestion: 2025 }`
- THEN SHALL create exactly 1 record with monto=80 and tipo="extraordinario"

#### Scenario: A socio inheriting the definition via group generates records

- GIVEN definition "ap-grupo" has monto=100, recurrencia="mensual", inicio="2025-01-01", fin="2025-02-28", aplicaGrupoId="g1"
- AND socio "s1" is a member of g1 but NOT directly assigned "ap-grupo"
- WHEN POST /api/aportes with `{ socioId: "s1", aporteId: "ap-grupo", gestion: 2025 }`
- THEN SHALL create 2 records (mes=1,2) with monto=100

#### Scenario: A `monto` in the body is rejected (no override)

- GIVEN definition "ap-mensual" has monto=50, recurrencia="mensual"
- AND socio "s1" is assigned "ap-mensual"
- WHEN POST /api/aportes with `{ socioId: "s1", aporteId: "ap-mensual", gestion: 2025, monto: 999 }`
- THEN the response SHALL be 400
- AND no record SHALL be created

#### Scenario: Inactive definition is rejected

- GIVEN definition "ap-inactivo" has activo=0
- WHEN POST /api/aportes with `{ socioId: "s1", aporteId: "ap-inactivo", gestion: 2025 }`
- THEN the response SHALL be 400
- AND the error SHALL indicate the definition is inactive

#### Scenario: Definition outside its vigencia window generates no records

- GIVEN definition "ap-mensual" has recurrencia="mensual", fin="2024-12-31"
- AND socio "s1" is assigned "ap-mensual"
- WHEN POST /api/aportes with `{ socioId: "s1", aporteId: "ap-mensual", gestion: 2025 }`
- THEN SHALL create 0 records (window expired)
- AND the response SHALL be 201 with `{ count: 0, items: [] }`

#### Scenario: Socio not assigned and not inheriting the definition is rejected

- GIVEN definition "ap-mensual" has no aplicaGrupoId
- AND socio "s1" has no direct assignment to "ap-mensual"
- WHEN POST /api/aportes with `{ socioId: "s1", aporteId: "ap-mensual", gestion: 2025 }`
- THEN the response SHALL be 400
- AND the error SHALL indicate the socio does not hold this aporte

### Requirement: Bulk Aportes — Definition-Driven POST /api/aportes/bulk

The system MUST accept `POST /api/aportes/bulk` with `{ socioIds, aporteIds, gestion }` (and, for `mensual`, an optional starting `mes`). For each socio that holds at least one of the given definitions (direct or group-inherited) AND whose estado permits `aportes`, the system MUST create records per definition following its `recurrencia` and `monto` within its `inicio`/`fin` window. There is NO `monto` override field and NO `tipo` field in the body. The response SHALL be 201 with `{ count, items }`.

#### Scenario: Bulk mensual uses each definition's monto

- GIVEN definition "ap-mensual" has monto=50, recurrencia="mensual", inicio="2025-04-01", fin="2025-05-31"
- AND socios "s1" and "s2" are both assigned "ap-mensual"
- WHEN POST /api/aportes/bulk with `{ socioIds: ["s1","s2"], aporteIds: ["ap-mensual"], gestion: 2025 }`
- THEN SHALL create 2 records per socio (mes=4,5) with monto=50
- AND the response SHALL be 201 with `{ count: 4, items: [...] }`

#### Scenario: Bulk anual creates 12 records per socio regardless of any window months

- GIVEN definition "ap-anual" has monto=500, recurrencia="anual"
- AND socios "s1" and "s2" are assigned "ap-anual"
- WHEN POST /api/aportes/bulk with `{ socioIds: ["s1","s2"], aporteIds: ["ap-anual"], gestion: 2025 }`
- THEN SHALL create exactly 12 records per socio with mes=1..12
- AND the response SHALL be 201 with `{ count: 24, items: [...] }`

#### Scenario: Bulk with a `monto` or `tipo` field is rejected

- GIVEN definition "ap-mensual" is assigned to "s1"
- WHEN POST /api/aportes/bulk with `{ socioIds: ["s1"], aporteIds: ["ap-mensual"], gestion: 2025, monto: 999 }`
- THEN the response SHALL be 400
- AND no records SHALL be created

#### Scenario: Bulk excludes socios whose estado does not permit aportes

- GIVEN definition "ap-mensual" is assigned to "s1" (estado permits "aportes") and "s2" (estado does NOT)
- WHEN POST /api/aportes/bulk with `{ socioIds: ["s1","s2"], aporteIds: ["ap-mensual"], gestion: 2025 }`
- THEN SHALL create records only for s1
- AND s2 SHALL be excluded
- AND the response SHALL be 201 with `{ count: 2, items: [...] }`

#### Scenario: Bulk with all socios excluded returns 400

- GIVEN ALL given socios have estados that do NOT permit "aportes"
- WHEN POST /api/aportes/bulk with `{ socioIds: ["s2"], aporteIds: ["ap-mensual"], gestion: 2025 }`
- THEN the response SHALL be 400
- AND the error SHALL indicate no socio can participate

#### Scenario: Bulk with an inactive definition generates nothing for that definition

- GIVEN definition "ap-inactivo" has activo=0 and is assigned to a permitted socio
- WHEN POST /api/aportes/bulk with `{ socioIds: ["s1"], aporteIds: ["ap-inactivo"], gestion: 2025 }`
- THEN the response SHALL be 400
- AND the error SHALL indicate the definition is inactive

### Requirement: POST /api/aportes/bulk/all — Definition-Driven for All Permitted Socios

The system MUST expose `POST /api/aportes/bulk/all` accepting the same definition-driving fields as `/bulk` but WITHOUT `socioIds`. It MUST resolve ALL socios whose `estadoId` permits the `aportes` action (via `cargarPermisosPorEstado`/`permite`, NOT a hardcoded `estado='activo'`), generate for the given definitions per socio, and return 400 if no socio is eligible and 201 with `{ count, items }` otherwise.

#### Scenario: Bulk/all generates only for permitted socios holding the definition

- GIVEN definition "ap-mensual" is assigned to "s1" (permits "aportes"), "s2" (no permit) and "s3" (not assigned)
- WHEN POST /api/aportes/bulk/all with `{ aporteIds: ["ap-mensual"], gestion: 2025 }`
- THEN SHALL create records only for s1
- AND the response SHALL be 201 with `{ count: 2, items: [s1] }`

#### Scenario: Bulk/all with no eligible socio returns 400

- GIVEN ALL socios have estados that do NOT permit "aportes"
- WHEN POST /api/aportes/bulk/all with `{ aporteIds: ["ap-mensual"], gestion: 2025 }`
- THEN the response SHALL be 400
- AND the error SHALL indicate no socio can participate

#### Scenario: Bulk/all anual creates 12 records per permitted socio

- GIVEN definition "ap-anual" is assigned to "s1" (permits "aportes")
- WHEN POST /api/aportes/bulk/all with `{ aporteIds: ["ap-anual"], gestion: 2025 }`
- THEN SHALL create 12 records for s1 with mes=1..12

## MODIFIED Requirements

### Requirement: Enforcement por Estado en Generación (Previously: derived from each socio's type)

The system MUST scope aporte generation to socios whose estado permits the `aportes` action, resolved via `cargarPermisosPorEstado`/`permite(...,'aportes')` — a hardcoded `estado='activo'` SHALL NOT be used. Record amounts and recurrence are read from the definition (previously read from each socio's assigned type `tipoAporteId` / a client `monto`).

#### Scenario: Single create respects the socio estado action

- GIVEN a socio whose estado does NOT permit "aportes"
- WHEN POST /api/aportes with `{ socioId: "<ese-socio>", aporteId: "ap-mensual", gestion: 2025 }`
- THEN the response SHALL be 409
- AND the error SHALL be `{ "error": "El socio no puede realizar esta acción en su estado actual" }`
- AND no record SHALL be created

## REMOVED Requirements

### Requirement: Bulk/Single Aportes — Override Opcional del Monto

(Reason: The manual `monto` override disappears under the corrected definition-driven model. Records always take `monto` from the assigned definition; a client-supplied `monto` in the creation body is rejected. The old rule that honored `monto` for `unico`/`extraordinario` is removed.)

### Requirement: Bulk Aportes — Monto Derivado del Tipo y Fix Anual

(Reason: Generation no longer reads `montoBase` from the socio's `tipoAporteId` type (the FK is dropped). `monto` and `recurrencia` now come from the aporte DEFINITION; the fix that "anual forces 12 records ignoring `body.meses`" is preserved but the source of truth is the definition.)

## Validation

| Field | Rule |
|-------|------|
| `aporteId`/`aporteIds` (POST/POST bulk) | MUST reference an existing ACTIVE definition applicable to the socio (direct or group-inherited); otherwise the socio/definition is excluded or 400 |
| `gestion` | MUST be a valid year |
| `mes` (optional, mensual) | MUST be 1..12 when provided |
| Record `monto` | MUST equal the definition's `monto` — no override field exists |
| `recurrencia` | MUST come from the definition — no `tipo` field in the body |
| `anual` | MUST create exactly 12 records (mes=1..12) |
| `mensual` | MUST create one record per month within the intersection of the definition's `inicio`/`fin` window and the target gestion |
| `unico`/`extraordinario` | MUST create exactly 1 record |
| Acción `aportes` | MUST be permitted on the socio's estado for generation (single/bulk/bulk/all), via `cargarPermisosPorEstado`/`permite` |

## Error States

| HTTP | Condition | Body |
|------|-----------|------|
| 400 | `monto`/`tipo` in body (no override), inactive definition, socio not holding the definition, bulk/all with no eligible socios | `{ "error": "..." }` / `{ "error": "Ningún socio puede participar en esta acción en su estado actual" }` |
| 404 | Aporte record not found on GET /:id/pagos | `{ "error": "Aporte not found" }` |
| 409 | Socio estado does not permit the action | `{ "error": "El socio no puede realizar esta acción en su estado actual" }` |

## Preserved Requirement

### Requirement: GET /api/aportes/:id/pagos — Historial de Movimientos

The system MUST keep `GET /api/aportes/:id/pagos` returning all movements with `referenciaId=<id>` and `tipo='ingreso'` and `anulado=0`, following the `multas.get('/:id/pagos')` pattern. If the aporte record does not exist, the response SHALL be 404.

#### Scenario: Returns the payment history of an aporte record

- GIVEN aporte record "ap1" has 2 ingreso movements and 1 anulado
- WHEN GET /api/aportes/ap1/pagos
- THEN the response SHALL be 200 with the 2 ingreso movements ordered by date
- AND the anulado movement SHALL be excluded

#### Scenario: Aporte record with no payments returns an empty array

- GIVEN aporte record "ap1" has no movements
- WHEN GET /api/aportes/ap1/pagos
- THEN the response SHALL be 200 with `[]`

#### Scenario: Nonexistent aporte record returns 404

- WHEN GET /api/aportes/fake-id/pagos
- THEN the response SHALL be 404 with `{ "error": "Aporte not found" }`