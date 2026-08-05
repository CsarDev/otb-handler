# Proposal: Mejoras Integrales OTB Handler

## Intent

Corregir 15 bugs/problemas de UI y datos identificados en el sistema OTB actual, y agregar funcionalidad faltante que bloquea el uso en producción. Datos incorrectos en tablas (UUIDs en vez de nombres), lógica inconsistente de dashboard (ventanas de tiempo mezcladas), y la ausencia de reportes contables generan desconfianza y fricción operativa.

## Scope

### In Scope
- 8 correcciones de bugs y datos incorrectos en UI (Prioridades 1-2)
- 5 correcciones de funcionalidad faltante (Prioridad 3)
- Módulo de reportes (balance mensual, libro diario, resumen por socio)
- Dashboard mejorado con métricas contables correctas
- Modelo de datos: `monto`/`saldoPendiente` en multas, `motivo` en movimientos

### Out of Scope
- Autenticación OAuth, modo offline, exportación PDF/Excel
- Migración a PostgreSQL
- Tests E2E o de integración (unitarios sí se agregan)

## Capabilities

### New Capabilities
- `reports` — Balance mensual, libro diario (ingresos/egresos), resumen por socio
- `fine-partial-payment` — Pago parcial con saldo pendiente en multas

### Modified Capabilities
- `activity-types` — CRUD completo con PUT, opciones de asistencia y multas por estado
- `expenses` — Sincronización de tabla movimientos en PUT/DELETE
- `payments` — Transacciones atómicas (creación de movimiento + actualización estado)

## Approach

1. **Schema**: Agregar `monto`, `saldoPendiente` a multas; `motivo` opcional a movimientos. Migración Drizzle.
2. **API joins**: LEFT JOINs en GET lists para incluir nombres en vez de UUIDs (socios, tipos).
3. **API fixes**: Corregir selects (enviar UUID, no nombre); agregar PUT tipos-actividad; sincronizar movimientos en egresos; envolver pagos en transacciones DB.
4. **Dashboard**: Unificar ventanas temporales en consultas; corregir tipos (COUNT vs monto); filtrar datos sensibles.
5. **Frontend**: Corregir formularios (options con id/value correctos); mostrar nombres en tablas; UI completa para tipos de actividad; módulo reportes; flujo de pago parcial.
6. **Reportes API**: Queries agregadas con SUM/COUNT, GROUP BY mes y tipo, ventanas configurables.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/db/src/schema.ts` | Modified | Columnas en multas, movimientos |
| `packages/api/src/routes/multas.ts` | Modified | Joins, partial payment |
| `packages/api/src/routes/aportes.ts` | Modified | Joins, fix select options |
| `packages/api/src/routes/actividades.ts` | Modified | Joins, fix tipoId |
| `packages/api/src/routes/dashboard.ts` | Modified | Fix time windows, sensitive data |
| `packages/api/src/routes/egresos.ts` | Modified | Sync movimientos PUT/DELETE |
| `packages/api/src/routes/tipos-actividad.ts` | Modified | Add PUT, fix DELETE |
| `packages/api/src/routes/reportes.ts` | **New** | Aggregated query endpoints |
| `apps/web/src/routes/multas.tsx` | Modified | Partial payment UI, socio name |
| `apps/web/src/routes/aportes.tsx` | Modified | Fix select, socio name |
| `apps/web/src/routes/actividades.tsx` | Modified | Fix select, tipo name |
| `apps/web/src/routes/index.tsx` | Modified | Dashboard metrics correction |
| `apps/web/src/routes/config.tsx` | Modified | Activity types CRUD UI |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Actividades con tipoId = nombre existente corrupto | Medium | Migration script: lookup tipo por nombre, reasignar UUID |
| Pagos atómicos rompen flujo actual sin rollback | Low | Envolver en transacción, probar con seed reset |
| Queries de reportes lentas con datos históricos | Low | Indexar fechas y tipoId, limitar ventana default |

## Rollback Plan

Por commit unitario: revertir schema (DROP columns via migration DOWN), revertir endpoints API. Dashboard bugfixes son independientes y seguros de revertir. Los cambios de schema requieren migration DOWN antes de deploy.

## Dependencies

- Drizzle Kit migration para nuevos campos
- Seed data actualizado para cubrir nuevos campos
- `pnpm typecheck` debe pasar en todo el monorepo

## Success Criteria

- [ ] Todos los selects muestran nombre del socio/tipo, no UUID
- [ ] Dashboard `neto` usa la misma ventana temporal para ingresos y egresos
- [ ] Pagos parciales actualizan `saldoPendiente` sin marcar como pagado completo
- [ ] Reportes API responden con datos agregados correctos por mes
- [ ] `pnpm typecheck` pasa sin errores en todos los paquetes
