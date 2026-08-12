# Proposal: UX Avanzado OTB — Split, Batch Ops, Pagos Parciales y Anulación

## Intent

Evolucionar la UI/UX de OTB Handler de páginas monolíticas a secciones especializadas para multas y aportes, habilitar operaciones batch (multi-socio/todos), implementar pagos parciales reales en aportes (espejando el patrón ya existente en multas), añadir anulación con razón en pagos, y extender filtros de reportes.

## Scope

### In Scope
- Split de UI de Multas en "Crear Multas" + "Listar Multas"
- Split de UI de Aportes en "Crear Aportes" + "Pagar Aportes"
- Schema: `montoPagado`, `saldoPendiente`, `razonAnulacion` en aportes; tipo `'unico'|'anual'`; `anulado` en movimientos
- Batch: multas multi-socio, aportes a varios/todos los socios activos
- Bugfix: POST /api/aportes/:id/pagar ignora `monto` del body
- Anulación con razón en multas y aportes (movimiento marcado, no eliminado)
- Reportes: filtros combinables (gestión, mes, rango fechas, tipo ingreso/egreso), resumen socio con listas detalladas, links a pagos

### Out of Scope
- Autenticación/autorización
- Exportación PDF/Excel
- Notificaciones
- Dashboard
- Egresos

## Capabilities

### New Capabilities
- `multas-split-ui`: UI split — formulario batch de creación + tabla lista/filtros/pagar/anular
- `aportes-split-ui`: UI split — creación batch + tabla pagos con parcial y anulación
- `batch-operations`: Endpoints y UI para crear multas/aportes a múltiples socios simultáneamente
- `anulacion-tracking`: Anulación soft con razón en multas, aportes y movimientos

### Modified Capabilities
- `fine-partial-payment`: Schema aportes extiende montoPagado/saldoPendiente; UI aportes permite pago parcial (espeja multas)
- `payments`: Anulación no elimina — marca `anulado` + `razonAnulacion` en movimiento; anular aporte con razón
- `reports`: Balance acepta múltiples modos de filtro; libro diario filtra por tipo (ingreso/egreso/todos); resumen socio muestra listas detalladas + links

## Approach

1. **Schema primero** (packages/db): agregar columnas a aportes y movimientos, extender enum tipo en aportes, migración
2. **API** (packages/api): nuevos endpoints batch (POST /multas/batch, POST /aportes/batch), corregir bug pago aporte, agregar anulación con razón en multas y aportes, extender filtros de reportes
3. **Core types** (packages/core): actualizar tipos Aporte, Movimiento
4. **Frontend** (apps/web): split de páginas multas/aportes en tabs/secciones, formularios batch, filtros avanzados en reportes, modal de anulación con razón
5. **Store** (apps/web): nuevos métodos batch, anular con razón, report filters

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/db/src/schema/aportes.ts` | Modified | +montoPagado, +saldoPendiente, +razonAnulacion, tipo enum extendido |
| `packages/db/src/schema/movimientos.ts` | Modified | +anulado (boolean/text), +razonAnulacion |
| `packages/core/src/index.ts` | Modified | Tipos Aporte, Movimiento actualizados |
| `packages/api/src/routes/aportes.ts` | Modified | Bugfix pagar, batch create, anular con razón |
| `packages/api/src/routes/multas.ts` | Modified | Batch create, anular con razón en pagos |
| `packages/api/src/routes/reportes.ts` | Modified | Filtros avanzados en balance, libro diario, resumen socio |
| `apps/web/src/routes/multas.tsx` | Modified | Split UI + batch create + anular con razón |
| `apps/web/src/routes/aportes.tsx` | Modified | Split UI + batch create + pago parcial + anular |
| `apps/web/src/routes/reportes.tsx` | Modified | Filtros avanzados, listas detalladas, links |
| `apps/web/src/stores/app.store.ts` | Modified | Nuevos métodos batch, anulación, report filters |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Schema breaking change al extender enum tipo en aportes | Medium | Drizzle migrations add-only; valores legacy ('mensual','extraordinario') siguen funcionando |
| Reportes que suman `montoBase` en vez de `montoPagado` dan incorrectos tras pagos parciales en aportes | High | Corregir queries de reportes para usar `montoPagado` donde corresponda |
| Bug existente en pagar aporte (ignora monto) corregido pero puede afectar flujos existentes | Low | El comportamiento actual paga siempre montoBase completo; el nuevo permite montos parciales — es compatible hacia atrás |

## Rollback Plan

- Schema: revertir migración Drizzle (down migration o regenerar DB desde seed)
- API: restaurar routes anteriores desde git
- Frontend: restaurar páginas anteriores desde git
- Dado que es additive (nuevos campos, nuevos endpoints), rollback no requiere migración de datos destructiva

## Dependencies

- Drizzle ORM migrations pipeline (ya configurado)

## Success Criteria

- [ ] Schema de aportes tiene montoPagado, saldoPendiente, razonAnulacion y tipo acepta 'unico'/'anual'
- [ ] POST /api/aportes/:id/pagar respeta `monto` del body (pago parcial)
- [ ] POST /api/multas/batch crea multas para múltiples socios
- [ ] POST /api/aportes/batch crea aportes para varios/todos socios activos
- [ ] Anular multa/aporte pide razón y marca movimiento como anulado (no elimina)
- [ ] Reporte balance funciona con solo gestión, gestión+mes, rango fechas, o sin filtros
- [ ] Reporte libro diario filtra por tipo (ingreso/egreso/todos)
- [ ] Reporte resumen socio muestra listas detalladas con links a pagar/revisar
- [ ] Frontend de multas tiene tabs "Crear" y "Listar"
- [ ] Frontend de aportes tiene tabs "Crear" y "Pagar"
