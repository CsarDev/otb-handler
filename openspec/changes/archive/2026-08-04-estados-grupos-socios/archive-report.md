# Archive Report: estados-grupos-socios

- **Change**: estados-grupos-socios
- **Archived**: 2026-08-04
- **Archived to**: `openspec/changes/archive/2026-08-04-estados-grupos-socios/`
- **Verdict**: PASS WITH WARNINGS (verify-report #130, engram topic `sdd/estados-grupos-socios/verify-report`)
- **Baseline**: origin/dev `c2dcacc` (incluye fixes R3-2/R3-3 del commit `8c0a534`, mergeado)
- **Completeness**: 9/9 tasks, 25/25 requirements, 95/95 scenarios, 0 blockers, 0 critical

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| socios-estados | Created | Full spec (new main spec) — catalog estados/acciones, migración, socio CRUD y baja, enforcement |
| grupos | Created | Full spec (new main spec) — group CRUD, socio↔grupo, filtros |
| payments | Updated | Delta merge — enforcement por acción (aportes/multas/pagos/anulaciones), filtros estado/grupo; transacciones atómicas preservadas |
| dashboard-fixes | Updated | Delta merge — conteos por catálogo `es_activo` (totalSocios/morosos), multasPendientes SUM, sin cumpleañosMes |
| join-fixes | Updated | Delta merge — enforcement `asistencia`, filtros estado/grupo, nombres en vez de UUIDs preservados |
| reports | Updated | Delta merge — enforcement `reportes` (409), filtros estadoId/grupoId, balance/libro diario/resumen preservados |

## Lineage (Engram observations)

| Artifact | Observation ID | Topic |
|----------|---------------|-------|
| explore | #122 | sdd/estados-grupos-socios/explore |
| spec conversion note | #127 | (patrón OpenSpec spec/+tasks/) |
| verify-report | #130 | sdd/estados-grupos-socios/verify-report |
| archive-report | (this report) | sdd/estados-grupos-socios/archive-report |

Proposal, design, spec y tasks viven en el filesystem (modo openspec) — sin observación engram propia.

## Known Follow-ups (no blockers)

1. **Fase 0004** — backfill + `DROP COLUMN estado` (columna legacy sin lecturas en runtime) pendiente de ejecutar
2. **R3-4** — enforcement dashboard/reportes en listas (evaluar alcance)
3. **R3-5** — índice parcial único esDefecto/esBaja
4. **R3-6** — tests de comportamiento (repo sin test infra; verificación = typecheck + build + inspección estática)

## Environment Exception

Review nativo gentle-ai quedó huérfano en estado "reviewing" tras mergear — no finalizable por operaciones sancionadas; documentado, NO es fallo del cambio.
