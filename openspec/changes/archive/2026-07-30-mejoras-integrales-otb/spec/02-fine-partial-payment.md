# Fine Partial Payment — Pago Parcial con Saldo Pendiente

## Capability

`fine-partial-payment`

## Description

Permitir pagos parciales en multas donde el monto a pagar es menor que el saldo pendiente. En lugar de marcar la multa como pagada completamente, se registra el abono, se actualiza el `saldoPendiente` y la multa continúa en estado `pendiente` hasta que el saldo se cubra en su totalidad.

Requiere agregar la columna `saldoPendiente` en la tabla `multas`.

## Endpoints / Components

| Ubicación | Tipo | Descripción |
|-----------|------|-------------|
| `packages/db/src/schema/multas.ts` | Modified | Agregar columna `saldoPendiente` (real, default = `monto`) |
| `packages/api/src/routes/multas.ts` | Modified | POST /:id/pagar acepta `monto` parcial; GET /:id/pagos (nuevo) |
| `packages/core/src/index.ts` | Modified | Tipo `Multa` agrega `saldoPendiente: number` |
| `apps/web/src/routes/multas.tsx` | Modified | Mostrar saldoPendiente, habilitar pago parcial en UI |
| `apps/web/src/stores/app.store.ts` | Modified | Agregar fetchPagosMulta |

## Scenarios

### Pago Parcial

```
Scenario: Pago parcial reduce saldoPendiente sin cambiar estado
  Given existe una multa con id="m1", monto=100, saldoPendiente=100, estado="pendiente"
  When se invoca POST /api/multas/m1/pagar con body { "monto": 30 }
  Then se SHALL crear un movimiento con tipo="ingreso", monto=30, referenciaId="m1"
    And la multa SHALL actualizarse:
      - saldoPendiente = 70
      - estado = "pendiente" (sin cambios)
      - fechaPago = fecha del pago
    And la respuesta SHALL ser 200 con la multa actualizada
```

```
Scenario: Pago total cubre saldo pendiente y marca como pagado
  Given existe una multa con id="m1", monto=100, saldoPendiente=70, estado="pendiente"
  When se invoca POST /api/multas/m1/pagar con body { "monto": 70 }
  Then se SHALL crear un movimiento con monto=70
    And la multa SHALL actualizarse:
      - saldoPendiente = 0
      - estado = "pagado"
    And la respuesta SHALL ser 200
```

```
Scenario: Pago sin monto explícito usa saldoPendiente completo
  Given existe una multa con saldoPendiente=100
  When se invoca POST /api/multas/m1/pagar sin body.monto
  Then el monto pagado SHALL ser 100
    And la multa SHALL quedar con saldoPendiente=0 y estado="pagado"
```

### Validación de Pago

```
Scenario: Pago con monto mayor a saldoPendiente es rechazado
  Given existe una multa con saldoPendiente=50
  When se invoca POST /api/multas/m1/pagar con body { "monto": 100 }
  Then la respuesta SHALL ser 400
    And el error SHALL ser { "error": "Amount exceeds pending balance" }
```

```
Scenario: Pago sobre multa ya pagada es rechazado
  Given existe una multa con estado="pagado"
  When se invoca POST /api/multas/m1/pagar
  Then la respuesta SHALL ser 400
    And el error SHALL ser { "error": "Multa already paid" }
```

```
Scenario: Pago sobre multa anulada es rechazado
  Given existe una multa con estado="anulado"
  When se invoca POST /api/multas/:id/pagar
  Then la respuesta SHALL ser 400
    And el error SHALL ser { "error": "Multa is cancelled" }
```

### Historial de Pagos

```
Scenario: Obtener historial de abonos de una multa
  Given existe una multa con id="m1"
    And existen 3 movimientos con referenciaId="m1" y tipo="ingreso"
  When se invoca GET /api/multas/m1/pagos
  Then la respuesta SHALL ser 200
    And SHALL devolver un array de movimientos
    And cada movimiento SHALL incluir: id, monto, fecha, numeroRecibo, nota

Scenario: Historial de multa inexistente retorna vacío
  Given no existe multa con id="fake-id"
  When se invoca GET /api/multas/fake-id/pagos
  Then la respuesta SHALL ser 404
    And el error SHALL ser { "error": "Multa not found" }
```

### Transaccionalidad

```
Scenario: Pago parcial es atómico — falla si creación de movimiento falla
  Given existe una multa con saldoPendiente=100
  When se invoca POST /api/multas/m1/pagar con body { "monto": 30 }
    And la inserción del movimiento falla
  Then la transacción SHALL hacer rollback
    And la multa SHALL mantener saldoPendiente=100
    And el estado SHALL seguir siendo "pendiente"
```

## Schema Changes

```diff
// packages/db/src/schema/multas.ts
+ saldoPendiente: real('saldo_pendiente').notNull().default(0),
```

Al crear una multa via POST, `saldoPendiente` SHALL inicializarse igual a `monto`.

## Validation

| Campo | Regla |
|-------|-------|
| `monto` (pago) | MUST ser número positivo > 0 |
| `monto` (pago) | MUST ser <= saldoPendiente actual de la multa |
| `monto` (pago) | Si no se provee, SHALL usar saldoPendiente como valor por defecto |
| `numeroRecibo` (pago) | OPCIONAL, string |
| `fechaPago` (pago) | OPCIONAL, default = hoy (YYYY-MM-DD) |

## Error States

| HTTP | Condición | Cuerpo |
|------|-----------|--------|
| 400 | Multa ya pagada o anulada | `{ "error": "Multa already paid" }` |
| 400 | Monto excede saldo pendiente | `{ "error": "Amount exceeds pending balance" }` |
| 400 | Monto inválido (<= 0) | `{ "error": "Amount must be positive" }` |
| 404 | Multa no encontrada | `{ "error": "Multa not found" }` |
| 500 | Error en transacción DB | `{ "error": "Internal server error" }` |
