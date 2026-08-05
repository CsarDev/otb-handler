# Task-06: Atomic Payments — Transacciones y Pago Parcial en Multas/Aportes

## Description

Envolver `POST /api/aportes/:id/pagar` y `POST /api/multas/:id/pagar` en `db.transaction()` de Drizzle para garantizar atomicidad. Ambas operaciones (insertar movimiento + actualizar estado) deben usar el objeto `tx`, no `db`, dentro del callback.

### Multas — Lógica de Pago Parcial

- Si `monto` < `saldoPendiente`: reducir `saldoPendiente`, incrementar `montoPagado`, mantener `estado = 'pendiente'`
- Si `monto` >= `saldoPendiente`: `saldoPendiente = 0`, `estado = 'pagado'`
- Si no se provee `monto`, usar `saldoPendiente` como default (pago total)
- Validar: multa existe (404), multa no está pagada ni anulada (400), monto <= saldoPendiente (400), monto > 0 (400)

### Aportes — Transacción Atómica

- Envolver el flujo existente en `db.transaction()`
- Pago parcial (`monto` < `montoBase`) mantiene `estado = 'pendiente'`
- Si no se provee `monto`, usar `montoBase` como default

### Nuevo Endpoint

- `GET /api/multas/:id/pagos` — devuelve historial de movimientos con `referenciaId = :id AND tipo = 'ingreso'`

## Files

- `packages/api/src/routes/multas.ts` — POST /:id/pagar con transaction + logica parcial, GET /:id/pagos
- `packages/api/src/routes/aportes.ts` — POST /:id/pagar envuelto en transaction

## Dependencies

- Task-01 (saldoPendiente, montoPagado columns existen en multas)

## Acceptance Criteria

- [ ] `POST /api/multas/:id/pagar` usa `db.transaction((tx) => { ... })`
- [ ] Pago parcial (monto < saldoPendiente): `saldoPendiente` se reduce, `montoPagado` aumenta, estado sigue `pendiente`
- [ ] Pago total (monto >= saldoPendiente): `saldoPendiente = 0`, estado = `pagado`
- [ ] Sin monto explícito: usa `saldoPendiente` como default
- [ ] Error 400 si monto > saldoPendiente
- [ ] Error 400 si multa ya pagada o anulada
- [ ] `POST /api/aportes/:id/pagar` usa `db.transaction((tx) => { ... })`
- [ ] Pago parcial en aporte mantiene `estado = 'pendiente'`
- [ ] Todas las operaciones dentro del callback usan `tx`, no `db`
- [ ] Si la transacción falla, se hace rollback completo
- [ ] `GET /api/multas/:id/pagos` devuelve array de movimientos con `referenciaId = :id`
- [ ] `GET /api/multas/:id/pagos` retorna 404 si la multa no existe
- [ ] `numeroRecibo` opcional se guarda en movimiento si se provee
- [ ] `pnpm typecheck` pasa sin errores

## Estimated Lines

80
