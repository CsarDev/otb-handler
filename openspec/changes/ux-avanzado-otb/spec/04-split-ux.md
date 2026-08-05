# Split UX — Separación de UI en Secciones Crear/Listar

## Capability

`split-ux`

## Description

Dividir las páginas monolíticas de multas y aportes en tabs especializados para creación vs. listado/pago, reduciendo carga cognitiva al separar entrada de datos de consulta.

## Requirements

### Requirement: Multas — tabs "Crear Multas" y "Listar Multas"

The system MUST split the `/multas` page into two tabs.

**Tab "Crear Multas"** MUST contain:
- Selector multi-socio (checkboxes or multi-select)
- Campos: concepto, monto, actividadId (opcional)
- Botón "Crear Multas" → invoca `POST /api/multas/bulk`
- Mensaje de resultado con count de multas creadas

**Tab "Listar Multas"** MUST contain:
- Tabla con columnas: Socio, Concepto, Monto, Pagado, Saldo, Estado, Fecha
- Filtros: actividadId, socioId, gestion, estado, fechaDesde/fechaHasta
- Botón "Pagar" → modal pago parcial (monto, recibo, fecha)
- Botón "Anular" → modal con campo razón + confirmación

#### Scenario: Crear multas batch desde UI

- GIVEN usuario en tab "Crear Multas" con 2 socios seleccionados
- WHEN completa concepto="Falta", monto=50 y hace clic "Crear Multas"
- THEN SHALL invocar POST /api/multas/bulk con los 2 socioIds
- AND UI SHALL mostrar "2 multas creadas exitosamente"

#### Scenario: Pagar multa desde listado

- GIVEN multa pendiente visible en tabla "Listar Multas"
- WHEN usuario clic "Pagar", ingresa monto parcial y confirma
- THEN SHALL invocar POST /api/multas/:id/pagar
- AND tabla SHALL refrescar mostrando nuevo saldo pendiente

### Requirement: Aportes — tabs "Crear Aportes" y "Pagar Aportes"

The system MUST split the `/aportes` page into two tabs.

**Tab "Crear Aportes"** MUST contain:
- Selector multi-socio o checkbox "Todos los activos"
- Tipo: único, mensual, anual (radio/select)
- Mes, gestión, montoBase
- Botón "Crear Aportes" → invoca POST /api/aportes/bulk o /bulk/all

**Tab "Pagar Aportes"** MUST contain:
- Tabla con filtros: socioId, tipo, gestion, mes, fechaDesde/fechaHasta, estado
- Cada fila muestra montoPagado/saldoPendiente
- Modal de pago parcial: monto, recibo, fecha
- Botón "Anular" con modal de razón

#### Scenario: Crear aporte para todos los activos

- GIVEN usuario en tab "Crear Aportes" con "Todos los activos" marcado
- WHEN selecciona tipo="mensual", montoBase=50, mes=1, gestion=2025
- THEN SHALL invocar POST /api/aportes/bulk/all
- AND UI SHALL mostrar count de registros creados

#### Scenario: Pagar aporte parcial

- GIVEN aporte pendiente con saldoPendiente=100 en tabla "Pagar Aportes"
- WHEN usuario clic "Pagar", ingresa monto=40 y confirma
- THEN SHALL invocar POST /api/aportes/:id/pagar con monto=40
- AND UI SHALL actualizar montoPagado=40, saldoPendiente=60
