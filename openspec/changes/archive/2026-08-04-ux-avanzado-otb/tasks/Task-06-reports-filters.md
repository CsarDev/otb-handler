# Task-06: Reports Filters

## Description
Filtros avanzados en todos los endpoints de reportes.

## Files
- `packages/api/src/routes/reportes.ts`

## Dependencies
- Task-01 (movimientos.anulado)

## Acceptance Criteria
- [ ] GET /reportes/balance: filtros combinables
  - Solo gestion → todo el año
  - gestion + mes → mes específico
  - fechaDesde + fechaHasta → rango
  - Sin filtros → todas las gestiones
  - Excluye movimientos con anulado=1
- [ ] GET /reportes/resumen-socio/:id: filtros gestion, mes, fechaDesde, fechaHasta, tipo (aportes|multas|todos). Devuelve listas detalladas (no solo agregados)
- [ ] GET /reportes/libro-diario: filtros gestion, mes, tipo (ingreso|egreso|todos). Excluye anulados.
- [ ] Las queries de aportes usan montoPagado no montoBase
- [ ] Typecheck pasa

## Estimated Lines
120
