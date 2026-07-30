# Task-04: Dashboard Fixes — Corrección de Métricas y Eliminación de Datos Sensibles

## Description

Corregir tres bugs en `GET /api/dashboard`:

1. **Recaudado filtrado por mes/gestion**: Actualmente `recaudado` suma TODOS los ingresos históricos sin filtrar, mientras que `egresosMes` sí está filtrado por el mes actual. Corregir para que ambas métricas usen la misma ventana `[inicioMes, finMes]` con `gte`/`lte`.
2. **Multas Pendientes como SUM**: Cambiar de `COUNT(*)` a `COALESCE(SUM(saldoPendiente), 0)` para reflejar el monto adeudado, no la cantidad de multas.
3. **Eliminar cumpleañosMes**: Remover el bloque que expone fechas de nacimiento de socios en la respuesta pública del dashboard. Eliminar también del tipo `DashboardData` en el store.

`neto` se recalcula correctamente como `recaudadoMes - egresosMes` (misma ventana temporal).

## Files

- `packages/api/src/routes/dashboard.ts` — corregir queries
- `apps/web/src/stores/app.store.ts` — eliminar `cumpleañosMes` de `DashboardData`
- `apps/web/src/routes/index.tsx` — sin cambios visuales (verificar que KPIs existentes funcionan con datos corregidos)

## Dependencies

- Task-01 (saldoPendiente column existe en multas para el SUM)

## Acceptance Criteria

- [ ] `recaudado` filtra por `movimientos.tipo = 'ingreso' AND fecha BETWEEN [inicioMes, finMes]`
- [ ] `egresosMes` filtra por `egresos.fecha BETWEEN [inicioMes, finMes]` (ya existe, verificar que coincida con recaudado)
- [ ] `neto = recaudado - egresosMes` (misma ventana para ambas métricas)
- [ ] `multasPendientes` usa `COALESCE(SUM(multas.saldoPendiente), 0)` donde `estado = 'pendiente'`
- [ ] `cumpleañosMes` eliminado de la respuesta JSON
- [ ] `cumpleañosMes` eliminado del tipo `DashboardData` en el store
- [ ] KPI `Neto` muestra correctamente valores negativos (ya soportado por `positive`/`negative` props)
- [ ] `pnpm typecheck` pasa sin errores

## Estimated Lines

40
