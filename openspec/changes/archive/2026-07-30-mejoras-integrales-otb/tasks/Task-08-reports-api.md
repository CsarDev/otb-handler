# Task-08: Reports API — Endpoints de Balance, Libro Diario y Resumen por Socio

## Description

Crear nuevo router `packages/api/src/routes/reportes.ts` con tres endpoints GET de consultas agregadas. No hay writes. Registrar el router en `packages/api/src/index.ts`. Agregar acciones correspondientes en el store de Zustand.

### GET /api/reportes/balance?gestion=2025&mes=6
- Validar que `gestion` (1900-2100) y `mes` (1-12) sean obligatorios (400 si faltan)
- `totalIngresos`: SUM de movimientos.monto WHERE tipo='ingreso' y fecha BETWEEN [inicioMes, finMes]
- `totalEgresos`: SUM de movimientos.monto WHERE tipo='egreso' y fecha BETWEEN [inicioMes, finMes]
- `neto`: totalIngresos - totalEgresos
- `desglose`: array de `{ categoria, monto }` agrupado por movimientos.nota/categoria

### GET /api/reportes/libro-diario?fechaDesde=2025-01-01&fechaHasta=2025-01-31
- Validar formato de fechas ISO (400 si inválido)
- LEFT JOIN con socios para socioNombre/socioApellido
- Sin parámetros: default últimos 30 días
- Ordenado por fecha ascendente

### GET /api/reportes/resumen-socio/:id
- Validar que socio existe (404 si no)
- `totalAportado`: SUM de aportes.montoBase WHERE socioId=:id AND estado='pagado'
- `multasPagadas`: SUM de multas.monto WHERE socioId=:id AND estado='pagado'
- `saldoPendiente`: SUM de multas.saldoPendiente WHERE socioId=:id AND estado='pendiente'
- `socio`: { id, nombre, apellidoPaterno }

### Store Actions
- `fetchBalance(gestion, mes)`: Promise<BalanceReport>
- `fetchLibroDiario(fechaDesde?, fechaHasta?)`: Promise<LibroDiarioEntry[]>
- `fetchResumenSocio(socioId)`: Promise<ResumenSocioReport>

## Files

- `packages/api/src/routes/reportes.ts` — **nuevo** router con 3 endpoints
- `packages/api/src/index.ts` — registrar `/api/reportes`
- `apps/web/src/stores/app.store.ts` — 3 nuevas acciones de fetch

## Dependencies

- Task-02 (tipos BalanceReport, LibroDiarioEntry, ResumenSocioReport existen en core)

## Acceptance Criteria

- [ ] `GET /api/reportes/balance` retorna `{ totalIngresos, totalEgresos, neto, desglose }`
- [ ] Balance retorna 400 si faltan `gestion` o `mes`
- [ ] Balance retorna 400 si `gestion` no es entero 1900-2100 o `mes` no es 1-12
- [ ] `GET /api/reportes/libro-diario` retorna array de movimientos con socioNombre/socioApellido
- [ ] Libro diario sin parámetros usa últimos 30 días
- [ ] Libro diario retorna 400 si fechaDesde > fechaHasta
- [ ] Libro diario resultados ordenados por fecha ASC
- [ ] `GET /api/reportes/resumen-socio/:id` retorna totalAportado, multasPagadas, saldoPendiente, socio
- [ ] Resumen socio retorna 404 si socio no existe
- [ ] Router registrado en `api.route('/api/reportes', reportesRouter)`
- [ ] Store tiene `fetchBalance`, `fetchLibroDiario`, `fetchResumenSocio` con tipos correctos
- [ ] `pnpm typecheck` pasa sin errores

## Estimated Lines

110
