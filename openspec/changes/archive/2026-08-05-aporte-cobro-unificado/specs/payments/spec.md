# Delta for Payments

> **Delta** from `openspec/specs/payments/spec.md` (aporte-cobro-unificado): aporte record generation gains TWO additions on top of the retained definition-driven manual endpoints: (1) a NEW AUTO-GENERATION TRIGGER at assignment — definition creation with assignment, socio save with assignments, and membership-time group generation — all flowing through the SAME shared definition-driven generator; (2) a MANDATORY DEDUP INVARIANT — the system MUST never create a duplicate cobro record for the same (socio, aporte, mes, gestion) on ANY path, making the retained single `POST /api/aportes`, `/bulk` and `/bulk/all` endpoints dedup-safe on re-run. `GET /:id/pagos`, pay/anular flows and partial payments are UNCHANGED.

## ADDED Requirements

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
