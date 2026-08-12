# Fine Voiding — Anulación de Multas con Razón

## Capability

`fine-voiding`

## Description

Permitir anular multas con una razón explícita, reemplazando el DELETE actual. La anulación es soft: marca `estado='anulado'`, guarda `razonAnulacion`, y si existe un movimiento asociado, lo marca como anulado. Las multas anuladas son visibles con filtro `?estado=anulado`.

## Requirements

### Requirement: POST /api/multas/:id/anular — Anular con razón

The system MUST expose `POST /api/multas/:id/anular` accepting `{ razon: string }`. It SHALL:
1. Set `estado='anulado'` and `razonAnulacion` on the multa
2. If a movimiento with `referenciaId=:id` exists, set `anulado=true` and `razonAnulacion` on it
3. The existing `DELETE /:id` SHALL be replaced or deprecated in favor of this endpoint

#### Scenario: Anular multa con movimiento asociado

- GIVEN multa "m1" con estado="pendiente" y movimiento asociado "mov1"
- WHEN POST /api/multas/m1/anular con `{ razon: "Pago manual fuera del sistema" }`
- THEN multa SHALL tener estado="anulado", razonAnulacion="Pago manual fuera del sistema"
- AND movimiento "mov1" SHALL tener anulado=true y misma razonAnulacion

#### Scenario: Anular multa ya pagada es rechazado

- GIVEN multa con estado="pagado"
- WHEN POST /api/multas/m1/anular
- THEN respuesta SHALL ser 400 con error `"Cannot cancel a paid fine"`

#### Scenario: Anular multa inexistente

- GIVEN no existe multa con ese id
- WHEN POST /api/multas/fake-id/anular
- THEN respuesta SHALL ser 404

#### Scenario: Anular sin razón es rechazado

- GIVEN multa pendiente
- WHEN POST /api/multas/m1/anular sin body.razon o con razon vacía
- THEN respuesta SHALL ser 400 con error `"razon is required"`

### Requirement: GET /api/multas filtra por estado anulado

The existing `GET /api/multas?estado=anulado` MUST continue working and SHALL return multas con estado="anulado" con su razonAnulacion.

#### Scenario: Filtrar anuladas incluye razón

- GIVEN 2 multas anuladas con razonAnulacion seteada
- WHEN GET /api/multas?estado=anulado
- THEN respuesta SHALL devolver las 2 anuladas, cada una con su razonAnulacion
