# Payments — Pagos Atómicos con Transacciones

## Capability

`payments`

## Description

Actualmente tanto `POST /api/aportes/:id/pagar` como `POST /api/multas/:id/pagar` ejecutan la inserción del movimiento y la actualización del estado como operaciones separadas sin transacción. Si la inserción del movimiento falla después de actualizar el estado, se genera inconsistencia de datos. Esta spec requiere envolver ambos endpoints en transacciones atómicas.

## Endpoints / Components

| Ubicación | Tipo | Descripción |
|-----------|------|-------------|
| `packages/api/src/routes/aportes.ts` | Modified | POST /:id/pagar envuelto en transacción Drizzle |
| `packages/api/src/routes/multas.ts` | Modified | POST /:id/pagar envuelto en transacción Drizzle |

## Scenarios

### Aportes — Pago Atómico

```
Scenario: Pago exitoso crea movimiento y actualiza aporte en transacción
  Given existe un aporte con id="ap1", estado="pendiente", montoBase=100
  When se invoca POST /api/aportes/ap1/pagar con body { "monto": 100 }
  Then la transacción SHALL:
      - Insertar un movimiento con tipo="ingreso", monto=100, referenciaId="ap1"
      - Actualizar aporte: estado="pagado", fechaPago, numeroRecibo
    And si ambas operaciones son exitosas, SHALL hacer commit
    And la respuesta SHALL ser 200 con el aporte actualizado
```

```
Scenario: Pago fallido hace rollback si falla inserción de movimiento
  Given existe un aporte con id="ap1", estado="pendiente"
  When se invoca POST /api/aportes/ap1/pagar
    And la inserción del movimiento falla (ej: violación de constraint)
  Then la transacción SHALL hacer rollback
    And el aporte SHALL mantener estado="pendiente"
    And NO SHALL existir ningún movimiento nuevo con referenciaId="ap1"
```

```
Scenario: Pago fallido hace rollback si falla actualización de aporte
  Given existe un aporte con id="ap1", estado="pendiente"
  When se invoca POST /api/aportes/ap1/pagar
    And la inserción del movimiento es exitosa
    And la actualización del aporte falla
  Then la transacción SHALL hacer rollback
    And NO SHALL existir ningún movimiento nuevo con referenciaId="ap1"
    And el aporte SHALL mantener estado="pendiente"
```

```
Scenario: Pago parcial en aporte (monto < montoBase) mantiene estado pendiente
  Given existe un aporte con id="ap1", montoBase=100, estado="pendiente"
  When se invoca POST /api/aportes/ap1/pagar con body { "monto": 40 }
  Then la transacción SHALL crear movimiento por 40
    And el aporte SHALL quedar con estado="pendiente"
    And la respuesta SHALL ser 200
```

### Multas — Pago Atómico

```
Scenario: Pago de multa exitoso en transacción
  Given existe una multa con id="m1", estado="pendiente", saldoPendiente=100
  When se invoca POST /api/multas/m1/pagar con body { "monto": 100 }
  Then la transacción SHALL:
      - Insertar un movimiento con tipo="ingreso", monto=100, referenciaId="m1"
      - Actualizar multa: estado="pagado", saldoPendiente=0, fechaPago
    And si ambas operaciones son exitosas, SHALL hacer commit
```

```
Scenario: Rollback en pago de multa si falla inserción
  Given existe una multa con id="m1", saldoPendiente=100
  When se invoca POST /api/multas/m1/pagar
    And la inserción del movimiento falla
  Then la transacción SHALL hacer rollback
    And la multa SHALL mantener saldoPendiente=100 y estado="pendiente"
```

### Transacciones — Comportamiento General

```
Scenario: Transacción usa el mismo objeto db de Drizzle (tx), no db global
  Given el handler de pago
  When se inicia la transacción con db.transaction((tx) => { ... })
  Then todas las operaciones SHALL usar el objeto tx, no db
    And SHALL seguir el patrón: tx.insert(...), tx.update(...), tx.delete(...)
```

```
Scenario: Número de recibo opcional en pago
  Given existe un aporte/multa pendiente
  When se invoca POST /:id/pagar con body { "monto": 100, "numeroRecibo": "R-001" }
  Then el movimiento SHALL guardar numeroRecibo="R-001"
    And si no se provee, numeroRecibo SHALL ser null
```

## Validation

| Campo | Regla |
|-------|-------|
| `monto` (pago) | MUST ser número positivo > 0 |
| `monto` (pago) | Si no se provee, SHALL usar `montoBase` (aporte) o `saldoPendiente` (multa) |
| `numeroRecibo` | OPCIONAL |
| `fechaPago` | OPCIONAL, default = fecha actual ISO |

## Error States

| HTTP | Condición | Cuerpo |
|------|-----------|--------|
| 404 | Aporte/multa no encontrado | `{ "error": "Aporte not found" }` / `{ "error": "Multa not found" }` |
| 400 | Ya pagado | `{ "error": "Aporte already paid" }` / `{ "error": "Multa already paid" }` |
| 400 | Monto inválido | `{ "error": "Amount must be positive" }` |
| 500 | Rollback por error interno | `{ "error": "Internal server error" }` |
