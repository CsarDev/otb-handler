# Delta for Aportes Partial Payment

Capabilities modified: `fine-partial-payment`, `payments`

## ADDED Requirements (fine-partial-payment domain)

### Requirement: Schema extension for aportes

The system MUST add columns to `aportes` table: `montoPagado real default 0`, `saldoPendiente real default 0`, `razonAnulacion text nullable`. The `tipo` SHALL accept (in code type, not DB constraint) `'mensual'|'extraordinario'|'unico'|'anual'`.

#### Scenario: Nuevo aporte inicializa saldos

- GIVEN schema actualizado
- WHEN POST /api/aportes con `{ socioId: "s1", montoBase: 100, tipo: "mensual" }`
- THEN registro SHALL tener montoPagado=0, saldoPendiente=100

### Requirement: POST /api/aportes/:id/pagar respeta monto parcial

The system MUST modify `POST /api/aportes/:id/pagar` to:
1. Use `db.transaction()` (already implemented)
2. Respect `body.monto` for partial payments
3. Increment `montoPagado`, decrement `saldoPendiente` (same pattern as multas)
4. Set `estado='pagado'` only when `saldoPendiente <= 0`
5. Validate `monto` is positive and does not exceed `saldoPendiente`

Current behavior (always sets estado='pagado', ignores incremental tracking) SHALL be replaced.

#### Scenario: Pago parcial reduce saldo

- GIVEN aporte "ap1" con montoBase=100, saldoPendiente=100, estado="pendiente"
- WHEN POST /api/aportes/ap1/pagar con `{ monto: 30 }`
- THEN movimiento SHALL crearse con monto=30
- AND aporte SHALL tener montoPagado=30, saldoPendiente=70, estado="pendiente"

#### Scenario: Pago total salda el aporte

- GIVEN aporte con saldoPendiente=70
- WHEN POST /api/aportes/ap1/pagar con `{ monto: 70 }`
- THEN estado="pagado", saldoPendiente=0

#### Scenario: Monto mayor a saldo es rechazado

- GIVEN aporte con saldoPendiente=50
- WHEN POST /api/aportes/ap1/pagar con `{ monto: 100 }`
- THEN respuesta SHALL ser 400

### Requirement: POST /api/aportes/:id/anular — Anular aporte con razón

The system MUST expose `POST /api/aportes/:id/anular` accepting `{ razon: string }`. It SHALL set `estado='anulado'`, store `razonAnulacion`, and mark associated movimiento as anulado.

#### Scenario: Anular aporte pendiente

- GIVEN aporte "ap1" con estado="pendiente"
- WHEN POST /api/aportes/ap1/anular con `{ razon: "Cobro duplicado" }`
- THEN estado="anulado", razonAnulacion="Cobro duplicado"

### Requirement: GET /api/aportes/:id/pagos — Historial de pagos

The system MUST expose `GET /api/aportes/:id/pagos` returning movimientos con `referenciaId=:id`.

#### Scenario: Historial con movimientos

- GIVEN aporte con 2 movimientos asociados
- WHEN GET /api/aportes/ap1/pagos
- THEN respuesta SHALL ser 200 con array de movimientos

### Requirement: Nuevos filtros en GET /api/aportes

The system MUST add query params `tipo`, `fechaDesde`, `fechaHasta` to `GET /api/aportes`.

#### Scenario: Filtrar por tipo extraordinario

- GIVEN aportes "mensual" y "extraordinario"
- WHEN GET /api/aportes?tipo=extraordinario
- THEN solo SHALL devolver los extraordinarios

## ADDED Requirements (payments domain)

### Requirement: Anulación soft en movimientos

The system MUST add columns to `movimientos`: `anulado text nullable`, `razonAnulacion text nullable`. When a multa or aporte is anulled, the associated movimiento SHALL be marked (not deleted). Anulled movements SHALL be excluded from report totals.

#### Scenario: Movimiento marcado como anulado

- GIVEN movimiento "mov1" asociado a multa "m1"
- WHEN se anula multa "m1"
- THEN "mov1" SHALL tener anulado=true y razonAnulacion seteada

#### Scenario: Reporte excluye movimientos anulados

- GIVEN un movimiento anulado (100) y otro no anulado (200)
- WHEN GET /api/reportes/balance?gestion=2025&mes=1
- THEN total SHALL excluir los 100 anulados
