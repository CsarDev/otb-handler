# Archive: ux-avanzado-otb — SUPERSEDED

**Status**: SUPERSEDED (NOT completed)

This change is **superseded by `tipos-aporte-cobros`** (definition-driven model). It is archived as a
historical artifact only — its requirements were absorbed and reworked by the later change.

## What Was Superseded

`ux-avanzado-otb` originally targeted: UI split (Crear/Listar tabs) for multas and aportes, batch
operations (multi-socio / all-socios), partial payments on aportes, voiding with reason, and advanced
report filters. Its own verification (2026-07-30) ended in **FAIL** with 6/9 tasks incomplete and
0/32 scenarios covered.

## Absorbed By tipos-aporte-cobros

The pending work of `ux-avanzado-otb` was absorbed and re-implemented under the corrected
**definition-driven** model (`aporte` = dynamic definition, many-to-many `socio_aportes`):

| ux-avanzado-otb pending | Absorbed as (tipos-aporte-cobros) |
|-------------------------|-----------------------------------|
| Annual generation → 12 records | `anual` → 12 records (mes 1..12) from the definition's `recurrencia` |
| Definition-driven generation | Record `monto`/count derived from `aportes_definicion` (no override, no `monto`/`tipo` in body) |
| `GET /api/aportes/:id/pagos` | Preserved: movement history (pattern `multas`, excludes `anulado`, 404 if absent) |
| Bulk operations | `POST /api/aportes/bulk` + `/bulk/all` definition-driven, scoped by `permite(...,'aportes')` |
| Aportes/multas enforcement by estado | `cargarPermisosPorEstado`/`permite` reuse (no hardcoded `estado='activo'`) |
| Frontend split (tabs) | Aportes section create/pagar tabs in `apps/web/src/routes/aportes.tsx` |

## Verification of the Superseding Change

`tipos-aporte-cobros` verify (2026-08-04): **PASS** — 60/60 tests, typechecks green
(db/core/api/web), zero migration drift, 62/62 spec scenarios compliant, 0 dead references to the old
model in production.

## Convention

Per SDD archive convention, superseded changes are archived with their artifacts preserved as an audit
trail. This change is NOT marked completed: its requirements live on in `tipos-aporte-cobros`.
