# Archive Report: tipos-aporte-cobros

- **Change**: tipos-aporte-cobros (Aportes as Dynamic Definitions with Many-to-Many Socio Assignment)
- **Archived**: 2026-08-04
- **Archived to**: `openspec/changes/archive/2026-08-04-tipos-aporte-cobros/`
- **Verdict**: **PASS** (verify-report #150, engram topic `sdd/tipos-aporte-cobros/verify-report`)
- **Completeness**: 13/13 code tasks ([x]) + T7.1 (archive meta, post-verify), 12/12 requirements, 62/62 scenarios, 0 blockers, 0 critical
- **Tests**: 60/60 (Vitest, `@otb/api`) — `aporte-definicion.test.ts` (19), `socios-aportes.test.ts` (17), `aportes-generacion.test.ts` (11), `aportes-bulk-all-pagos.test.ts` (13)
- **Typecheck**: ✅ green — `@otb/db`, `@otb/core`, `@otb/api`, `@otb/web` (tsc --noEmit, exit 0)
- **Migration drift**: ✅ none (`db:generate` → "No schema changes"; migration `0005` applied on real db)
- **Dead references**: ✅ 0 in production code (`tipos_aporte`, `tipoAporteId`, `tipoAporteNombre`, `aporteBase`, `/api/tipos-aporte` — only comments/seed mapping remain)

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| aporte-definitions | Created (full main spec) | Definition CRUD + DELETE 409 guard, group application (dynamic, not materialized), seed of default definitions — 22/22 scenarios |
| payments | Updated | Delta merge — definition-driven single/bulk/bulk-all generation (no override, no `monto`/`tipo` in body), MODIFIED enforcement por estado, REMOVED override/derived-monto requirements, preserved `GET /:id/pagos` — 22/22 scenarios |
| socios-estados | Updated | Delta merge — ADDED `aporteIds` multiselect + group inheritance (read-only chips), MODIFIED socio read shape (DROP tipoAporteId/aporteBase), REMOVED legacy single-FK requirements — 18/18 scenarios |

## Main Specs Reflecting the New Behavior

- `openspec/specs/aporte-definitions/spec.md` (full)
- `openspec/specs/payments/spec.md` (merged delta)
- `openspec/specs/socios-estados/spec.md` (merged delta)

## Superseded Change Archived

`ux-avanzado-otb` was archived as **SUPERSEDED** (NOT completed) to
`openspec/changes/archive/2026-08-04-ux-avanzado-otb/` — see its `README.md`. Its pending work
(annual→12, definition-driven generation, `GET /api/aportes/:id/pagos`, bulk operations) was absorbed
and implemented in this change.

## Lineage (Engram observations)

| Artifact | Observation ID | Topic |
|----------|---------------|-------|
| proposal | #133 | sdd/tipos-aporte-cobros/proposal |
| design | #137 | sdd/tipos-aporte-cobros/design |
| spec (corrected rewrite) | #146 | sdd/tipos-aporte-cobros/spec |
| apply-progress | #140 | sdd/tipos-aporte-cobros/apply-progress |
| verify-report | #150 | sdd/tipos-aporte-cobros/verify-report |
| archive-report | (this report) | sdd/tipos-aporte-cobros/archive-report |
| model correction decision | #145 | (decision — corrected many-to-many model) |
| tests rewrite | #149 | (definition-driven suite, 60/60) |

Note: earlier specs in Engram (#134/#135/#136, `aporte-types`/`payments`/`socios-estados` first
revision) reflect the superseded catalog+FK model and are retained as iteration history; the filesystem
delta specs are the authoritative corrected versions.

## Environment Exception

Review huérfano `review-3d838d9d4934a74d` (estados-grupos-socios) queda en estado "reviewing"
permanentemente — documentado, NO reintentar. No es fallo de este cambio.

## Known Follow-ups (no blockers)

1. Push/PRs de los ~30 commits locales (desde `cd7c2e3`) — decisión del usuario post-archive.
2. `config.tsx` input editable "Aporte Base (Bs)" se sobrescribe en cada fetch (D11 legacy derived) —
   considerar read-only/derivado (sugerencia del verify-report).
3. Frontend sin E2E/UI tests — smoke manual recomendado (sugerencia del verify-report).

## SDD Cycle

The change has been fully planned, implemented, verified, and archived. Ready for the next change.
