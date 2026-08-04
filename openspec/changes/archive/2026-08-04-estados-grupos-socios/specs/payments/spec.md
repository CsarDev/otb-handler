# Payments — Pagos Atómicos con Transacciones y Enforcement por Acción

## Capability

`payments`

> **Delta** from `openspec/specs/payments/spec.md`: all socio-associated payment operations MUST now respect the state action catalog. Aporte/multa creation, bulk and edit require the `aportes`/`multas` action on the socio's estado; `pagar` requires `pagos`; `anular` requires `anulaciones`. Violations are rejected with 409 (friendly message) or excluded in bulk. The existing atomic-transaction behavior is unchanged.

## Description

Actualmente tanto `POST /api/aportes/:id/pagar` como `POST /api/multas/:id/pagar` ejecutan la inserción del movimiento y la actualización del estado como operaciones separadas sin transacción. Si la inserción del movimiento falla después de actualizar el estado, se genera inconsistencia de datos. Esta spec requiere envolver ambos endpoints en transacciones atómicas. Además, con el catálogo de estados, toda operación que toca a un socio SHALL validar la acción correspondiente vía `socioPermite(socio, accionClave)` — `aportes` para crear/editar/bulk aportes, `multas` para crear/editar/bulk multas, `pagos` para pagar, `anulaciones` para anular — y rechazar con 409 (o excluir en bulk) a los socios cuyo estado no lo permita.

## Endpoints / Components

| Ubicación | Tipo | Descripción |
|-----------|------|-------------|
| `packages/api/src/routes/aportes.ts` | Modified | POST /:id/pagar envuelto en transacción Drizzle; enforcement `aportes`/`pagos`/`anulaciones`; filtros estado/grupo |
| `packages/api/src/routes/multas.ts` | Modified | POST /:id/pagar envuelto en transacción Drizzle; enforcement `multas`/`pagos`/`anulaciones`; filtros estado/grupo |
| `packages/core/src/index.ts` | Modified | Helper `socioPermite(socio, accionClave)` compartido |

## Requirements

### Requirement: Aportes — Pago Atómico

#### Scenario: Pago exitoso crea movimiento y actualiza aporte en transacción

- GIVEN existe un aporte con id="ap1", estado="pendiente", montoBase=100
- AND el socio del aporte tiene un estado que permite "pagos"
- WHEN se invoca POST /api/aportes/ap1/pagar con body { "monto": 100 }
- THEN la transacción SHALL:
  - Insertar un movimiento con tipo="ingreso", monto=100, referenciaId="ap1"
  - Actualizar aporte: estado="pagado", fechaPago, numeroRecibo
- AND si ambas operaciones son exitosas, SHALL hacer commit
- AND la respuesta SHALL ser 200 con el aporte actualizado

#### Scenario: Pago fallido hace rollback si falla inserción de movimiento

- GIVEN existe un aporte con id="ap1", estado="pendiente"
- WHEN se invoca POST /api/aportes/ap1/pagar
- AND la inserción del movimiento falla (ej: violación de constraint)
- THEN la transacción SHALL hacer rollback
- AND el aporte SHALL mantener estado="pendiente"
- AND NO SHALL existir ningún movimiento nuevo con referenciaId="ap1"

#### Scenario: Pago parcial en aporte (monto < montoBase) mantiene estado pendiente

- GIVEN existe un aporte con id="ap1", montoBase=100, estado="pendiente"
- WHEN se invoca POST /api/aportes/ap1/pagar con body { "monto": 40 }
- THEN la transacción SHALL crear movimiento por 40
- AND el aporte SHALL quedar con estado="pendiente"
- AND la respuesta SHALL ser 200

### Requirement: Multas — Pago Atómico

#### Scenario: Pago de multa exitoso en transacción

- GIVEN existe una multa con id="m1", estado="pendiente", saldoPendiente=100
- AND el socio de la multa tiene un estado que permite "pagos"
- WHEN se invoca POST /api/multas/m1/pagar con body { "monto": 100 }
- THEN la transacción SHALL:
  - Insertar un movimiento con tipo="ingreso", monto=100, referenciaId="m1"
  - Actualizar multa: estado="pagado", saldoPendiente=0, fechaPago
- AND si ambas operaciones son exitosas, SHALL hacer commit

#### Scenario: Rollback en pago de multa si falla inserción

- GIVEN existe una multa con id="m1", saldoPendiente=100
- WHEN se invoca POST /api/multas/m1/pagar
- AND la inserción del movimiento falla
- THEN la transacción SHALL hacer rollback
- AND la multa SHALL mantener saldoPendiente=100 y estado="pendiente"

### Requirement: Transacciones — Comportamiento General

#### Scenario: Transacción usa el mismo objeto db de Drizzle (tx), no db global

- GIVEN el handler de pago
- WHEN se inicia la transacción con db.transaction((tx) => { ... })
- THEN todas las operaciones SHALL usar el objeto tx, no db
- AND SHALL seguir el patrón: tx.insert(...), tx.update(...), tx.delete(...)

#### Scenario: Número de recibo opcional en pago

- GIVEN existe un aporte/multa pendiente
- WHEN se invoca POST /:id/pagar con body { "monto": 100, "numeroRecibo": "R-001" }
- THEN el movimiento SHALL guardar numeroRecibo="R-001"
- AND si no se provee, numeroRecibo SHALL ser null

### Requirement: Enforcement por Acción (Delta)

#### Scenario: Crear aporte de socio sin acción "aportes" se rechaza con 409

- GIVEN un socio cuyo estado NO permite "aportes" (ej: dado_de_baja)
- WHEN se invoca POST /api/aportes con body { socioId: "<ese-socio>", montoBase: 50 }
- THEN la respuesta SHALL ser 409
- AND el error SHALL ser amigable, ej: `{ "error": "El socio no puede realizar esta acción en su estado actual" }`
- AND NO SHALL crearse el aporte

#### Scenario: Actualizar aporte de socio sin acción "aportes" se rechaza con 409

- GIVEN un aporte existente cuyo socio NO permite "aportes"
- WHEN se invoca PUT /api/aportes/<id>
- THEN la respuesta SHALL ser 409

#### Scenario: Bulk de aportes excluye socios no permitidos

- GIVEN el bulk incluye s1 (permite "aportes") y s2 (NO permite "aportes")
- WHEN se invoca POST /api/aportes/bulk con socioIds=[s1, s2]
- THEN la respuesta SHALL ser 201
- AND SHALL crearse aportes solo para s1
- AND s2 SHALL quedar excluido del batch

#### Scenario: Bulk donde todos los socios están excluidos retorna 400

- GIVEN el bulk solo incluye socios cuyo estado NO permite "aportes"
- WHEN se invoca POST /api/aportes/bulk
- THEN la respuesta SHALL ser 400
- AND el error SHALL indicar que ningún socio puede participar

#### Scenario: Pagar un aporte requiere la acción "pagos"

- GIVEN un aporte de un socio cuyo estado permite "aportes" pero NO "pagos"
- WHEN se invoca POST /api/aportes/<id>/pagar
- THEN la respuesta SHALL ser 409
- AND el movimiento NO SHALL insertarse

#### Scenario: Pagar una multa requiere la acción "pagos"

- GIVEN una multa de un socio cuyo estado NO permite "pagos"
- WHEN se invoca POST /api/multas/<id>/pagar
- THEN la respuesta SHALL ser 409

#### Scenario: Crear multa de socio sin acción "multas" se rechaza con 409

- GIVEN un socio cuyo estado NO permite "multas"
- WHEN se invoca POST /api/multas con body { socioId: "<ese-socio>", concepto: "x", monto: 10 }
- THEN la respuesta SHALL ser 409
- AND NO SHALL crearse la multa

#### Scenario: Bulk de multas excluye socios no permitidos

- WHEN se invoca POST /api/multas/bulk con socioIds=[s1(permite), s2(no permite)]
- THEN la respuesta SHALL ser 201 con multas solo para s1

#### Scenario: Anular un aporte requiere la acción "anulaciones"

- GIVEN un aporte de un socio cuyo estado NO permite "anulaciones"
- WHEN se invoca POST /api/aportes/<id>/anular con body { razon: "error" }
- THEN la respuesta SHALL ser 409
- AND el aporte SHALL mantener su estado

#### Scenario: Anular una multa requiere la acción "anulaciones"

- GIVEN una multa de un socio cuyo estado NO permite "anulaciones"
- WHEN se invoca POST /api/multas/<id>/anular con body { razon: "error" }
- THEN la respuesta SHALL ser 409

#### Scenario: Listas de aportes y multas soportan filtros por estado y grupo

- GIVEN existen aportes/multas de socios con distintos estados y grupos
- WHEN se invoca GET /api/aportes?estadoId=<id> y GET /api/multas?grupoId=<id>
- THEN la respuesta SHALL filtrarse por estado del socio o pertenencia a grupo
- AND los filtros SHALL poder combinarse con los filtros existentes (socioId, estado, gestion...)

## Validation

| Campo | Regla |
|-------|-------|
| `monto` (pago) | MUST ser número positivo > 0 |
| `monto` (pago) | Si no se provee, SHALL usar `montoBase` (aporte) o `saldoPendiente` (multa) |
| `numeroRecibo` | OPCIONAL |
| `fechaPago` | OPCIONAL, default = fecha actual ISO |
| Acción `aportes` | MUST permitirse en el estado del socio para POST/PUT/bulk de aportes |
| Acción `multas` | MUST permitirse en el estado del socio para POST/PUT/bulk de multas |
| Acción `pagos` | MUST permitirse en el estado del socio para POST /:id/pagar |
| Acción `anulaciones` | MUST permitirse en el estado del socio para POST /:id/anular |

## Error States

| HTTP | Condición | Cuerpo |
|------|-----------|--------|
| 404 | Aporte/multa no encontrado | `{ "error": "Aporte not found" }` / `{ "error": "Multa not found" }` |
| 400 | Ya pagado | `{ "error": "Aporte already paid" }` / `{ "error": "Multa already paid" }` |
| 400 | Monto inválido / bulk sin socios elegibles | `{ "error": "Amount must be positive" }` / `{ "error": "..." }` |
| 409 | Estado del socio no permite la acción (`aportes`/`multas`/`pagos`/`anulaciones`) | `{ "error": "El socio no puede realizar esta acción en su estado actual" }` |
| 500 | Rollback por error interno | `{ "error": "Internal server error" }` |
