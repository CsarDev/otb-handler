# Batch Operations — Creación Masiva de Multas y Aportes

## Capability

`batch-operations`

## Description

Permitir la creación simultánea de multas y aportes para múltiples socios en una sola operación, reduciendo la fricción de UX al evitar formularios repetitivos.

## Requirements

### Requirement: POST /api/multas/bulk — Crear multas batch

The system MUST expose `POST /api/multas/bulk` accepting `{ socioIds: string[], concepto: string, monto: number, actividadId?: string, fecha?: string }`. For each `socioId`, it MUST create one multa with shared `concepto`, `monto`, optional `actividadId`/`fecha`. Response: 201 with `{ count: number, items: Multa[] }`.

#### Scenario: Crear multas para múltiples socios

- GIVEN 3 socios activos con ids ["s1","s2","s3"]
- WHEN POST /api/multas/bulk con `{ socioIds: ["s1","s2","s3"], concepto: "Falta injustificada", monto: 50 }`
- THEN SHALL crear 3 multas con saldoPendiente=50 cada una
- AND respuesta SHALL ser 201 con `{ count: 3, items: [...] }`

#### Scenario: Array vacío rechazado

- GIVEN socioIds vacío o ausente
- WHEN POST /api/multas/bulk
- THEN respuesta SHALL ser 400 con error `"socioIds must be a non-empty array"`

### Requirement: POST /api/aportes/bulk — Crear aportes batch

The system MUST expose `POST /api/aportes/bulk` accepting `{ socioIds: string[], tipo: 'mensual'|'unico'|'anual', montoBase: number, gestion: number, mes?: number, meses?: number }`. Behavior per `tipo`:
- `mensual`: crea `meses` registros (uno por mes desde `mes`) × socio
- `anual`: crea 12 registros (enero a diciembre) × socio
- `unico`: crea 1 registro × socio

Response: 201 con `{ count: number, items: Aporte[] }`.

#### Scenario: Aportes mensuales 3 meses para 2 socios

- GIVEN 2 socios activos
- WHEN POST /api/aportes/bulk con `{ socioIds: ["s1","s2"], tipo: "mensual", montoBase: 50, gestion: 2025, mes: 1, meses: 3 }`
- THEN SHALL crear 6 registros (2 × 3) con mes secuencial 1, 2, 3

#### Scenario: Aportes anuales 12 meses

- GIVEN 1 socio activo
- WHEN POST /api/aportes/bulk con `{ socioIds: ["s1"], tipo: "anual", montoBase: 600, gestion: 2025 }`
- THEN SHALL crear 12 registros con mes=1..12

#### Scenario: Aporte único

- GIVEN 1 socio activo
- WHEN POST /api/aportes/bulk con `{ socioIds: ["s1"], tipo: "unico", montoBase: 100, gestion: 2025 }`
- THEN SHALL crear 1 registro con tipo="unico"

### Requirement: POST /api/aportes/bulk/all — Aportes para todos los activos

The system MUST expose `POST /api/aportes/bulk/all` accepting the same fields as `/bulk` but WITHOUT `socioIds`. It MUST resolve all socios with `estado='activo'` and create aportes for each.

#### Scenario: Bulk all solo activos

- GIVEN 5 socios activos y 2 inactivos
- WHEN POST /api/aportes/bulk/all con `{ tipo: "unico", montoBase: 50, gestion: 2025 }`
- THEN SHALL crear 5 registros con count=5
