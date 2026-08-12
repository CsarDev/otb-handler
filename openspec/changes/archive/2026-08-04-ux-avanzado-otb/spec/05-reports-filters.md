# Delta for Reports — Filtros Avanzados

Capability modified: `reports`

## MODIFIED Requirements

### Requirement: Balance — Filtros combinables

(Previously: Balance requería gestion+mes como obligatorios)

The system MUST extend `GET /api/reportes/balance` to support these modes:
- `?gestion=2025` — suma todo el año
- `?gestion=2025&mes=6` — mes específico (comportamiento actual)
- `?fechaDesde=2025-01-01&fechaHasta=2025-06-30` — rango arbitrario
- Sin filtros — suma todos los registros (all-time)

If no parameters provided, the system SHALL return all-time totals. If conflicting filters (e.g., gestion+fecha), gestion SHALL take precedence.

#### Scenario: Balance por gestión sin mes

- GIVEN movimientos en Ene 2025 (100) y Feb 2025 (200)
- WHEN GET /api/reportes/balance?gestion=2025
- THEN respuesta SHALL sumar 300 (todo el año)

#### Scenario: Balance sin filtros (all-time)

- GIVEN movimientos de 2024, 2025, 2026
- WHEN GET /api/reportes/balance sin parámetros
- THEN respuesta SHALL incluir todos los registros

#### Scenario: Balance por rango de fechas

- GIVEN movimientos en rango y fuera de rango
- WHEN GET /api/reportes/balance?fechaDesde=2025-01-15&fechaHasta=2025-02-15
- THEN respuesta SHALL limitarse al rango especificado

### Requirement: Libro Diario — Filtros gestion, mes, tipo

(Previously: solo filtro fechaDesde/fechaHasta)

The system MUST extend `GET /api/reportes/libro-diario` with optional params `gestion`, `mes`, `tipo` (ingreso|egreso|todos). All params SHALL be combinable.

#### Scenario: Filtrar libro diario por tipo ingreso

- GIVEN 3 ingresos y 2 egresos
- WHEN GET /api/reportes/libro-diario?tipo=ingreso
- THEN respuesta SHALL incluir solo los 3 ingresos

#### Scenario: Filtrar por gestión y mes

- GIVEN movimientos en 2025 mes 1 y mes 2
- WHEN GET /api/reportes/libro-diario?gestion=2025&mes=1
- THEN respuesta SHALL incluir solo enero 2025

### Requirement: Resumen Socio — Filtros y listas detalladas

(Previously: sin filtros, solo totales numéricos)

The system MUST extend `GET /api/reportes/resumen-socio/:id` with filters `gestion`, `mes`, `fechaDesde`, `fechaHasta`, `tipo` (aportes|multas|todos).

Response SHALL be extended to include detailed arrays:
- `aportes`: array de objetos Aporte con id (para deep-link)
- `multas`: array de objetos Multa con id (para deep-link)

Existing numeric fields (`totalAportado`, `multasPagadas`, `saldoPendienteMultas`) SHALL be preserved.

#### Scenario: Resumen socio con filtro de tipo aportes

- GIVEN socio con aportes y multas en 2025
- WHEN GET /api/reportes/resumen-socio/s1?gestion=2025&tipo=aportes
- THEN respuesta SHALL incluir `aportes` array con registros filtrados
- AND cada aporte SHALL incluir su id para deep-link al pago
