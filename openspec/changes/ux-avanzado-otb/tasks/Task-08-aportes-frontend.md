# Task-08: Aportes Frontend Split

## Description
Dividir página de aportes en tabs Crear/Pagar con formulario batch, pago parcial, y anulación.

## Files
- `apps/web/src/routes/aportes.tsx`
- `apps/web/src/stores/app.store.ts`

## Dependencies
- Task-04, Task-05

## Acceptance Criteria
- [ ] Dos tabs: "Crear Aportes" y "Pagar Aportes"
- [ ] Crear: selector multi-socio o checkbox "Todos los activos", tipo (único/mensual/anual), monto, gestión, mes inicio, meses (si mensual)
- [ ] Pagar: filtros tipo, gestion, mes, fechaDesde/fechaHasta, socioId, estado
- [ ] Modal pago parcial (pre-filled con saldoPendiente)
- [ ] Botón anular con modal de razón
- [ ] Store: createAportesBulk, createAportesBulkAll, pagarAporteConMonto, anularAporte, fetchPagosAporte
- [ ] Typecheck pasa

## Estimated Lines
250
