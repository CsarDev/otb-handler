# Task-05: Enforcement por acción en módulos existentes

## Description

Usar `cargarPermisosPorEstado()` en TODA ruta que toca socio: `aportes.ts` (POST/PUT/bulk → `aportes`; `/pagar` → `pagos`; `/anular` → `anulaciones`; bulk excluye no-permitidos y 400 si ninguno; filtros `estadoId`/`grupoId` en GET); `multas.ts` (ídem); `asistencia.ts` (POST batch atómico: si ALGUNO no permite → 409 sin insertar; PUT → 409; GET `/actividad/:id` con filtros estado/grupo vía join+subquery); `reportes.ts` (`/resumen-socio/:id` → 409 si no permite `reportes`; `/libro-diario` filtros estadoId/grupoId); `dashboard.ts` (`totalSocios`/`morosos` vía join `estados_socio.esActivo=1`, reemplaza string `'activo'`).

## Requirements

- specs `payments` (Enforcement por Acción: 11 escenarios)
- specs `join-fixes` (Asistencia — 4 escenarios delta)
- specs `reports` (3 escenarios delta)
- specs `dashboard-fixes` (3 escenarios delta es_activo)

## Files

- `packages/api/src/routes/aportes.ts` (mod)
- `packages/api/src/routes/multas.ts` (mod)
- `packages/api/src/routes/asistencia.ts` (mod)
- `packages/api/src/routes/reportes.ts` (mod)
- `packages/api/src/routes/dashboard.ts` (mod)

## Dependencies

- Task-04 (`permisos.ts`)
- Task-02 (`socioPermite`)

## Acceptance Criteria

- [ ] `pnpm typecheck` + build API
- [ ] Smoke: POST aporte de socio dado_de_baja → 409
- [ ] Bulk mixto inserta solo permitidos
- [ ] Asistencia batch con un no-permitido → 409 sin inserts
- [ ] Resumen-socio suspendido sin `reportes` → 409
- [ ] Dashboard totales idénticos pre/post migración

## Estimated Lines

~155
