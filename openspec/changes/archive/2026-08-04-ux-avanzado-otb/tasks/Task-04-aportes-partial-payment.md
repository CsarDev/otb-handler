# Task-04: Aportes Partial Payment (Refactor)

## Description
Refactor completo del pago de aportes para usar el mismo patrón que multas (pagos parciales con db.transaction).

## Files
- `packages/api/src/routes/aportes.ts`

## Dependencies
- Task-01, Task-02

## Acceptance Criteria
- [ ] POST /api/aportes/:id/pagar usa db.transaction()
- [ ] Respeta monto del body (montoPagado += monto, saldoPendiente -= monto)
- [ ] Si saldoPendiente <= 0 → estado = 'pagado'
- [ ] POST /api/aportes/:id/anular: { razon } → marca anulado + anula movimiento
- [ ] GET /api/aportes/:id/pagos: historial de movimientos asociados
- [ ] GET /api/aportes: filtros tipo, fechaDesde, fechaHasta
- [ ] Bugfix: monto ya no es ignorado
- [ ] Typecheck pasa

## Estimated Lines
100
