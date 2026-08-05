# Reports — Balance Mensual, Libro Diario, Resumen por Socio

## Capability

`reports`

## Description

Proveer tres endpoints de reportes contables agregados que permitan obtener balances mensuales, el libro diario de movimientos y resúmenes individuales por socio. Estos reportes son necesarios para la operación contable en producción y actualmente no existen.

## Endpoints / Components

| Ubicación | Tipo | Descripción |
|-----------|------|-------------|
| `packages/api/src/routes/reportes.ts` | **New** | Router Hono con tres endpoints GET |
| `packages/api/src/index.ts` | Modified | Registrar `api.route('/api/reportes', reportesRouter)` |
| `apps/web/src/routes/reportes.tsx` | Modified | Implementar UI de tres tabs (Balance, Libro Diario, Resumen Socio) |
| `apps/web/src/stores/app.store.ts` | Modified | Agregar fetchReportesBalance, fetchReportesLibroDiario, fetchReportesResumenSocio |

## Scenarios

### Balance Mensual

```
Scenario: Obtener balance mensual con ingresos, egresos y neto
  Given el endpoint GET /api/reportes/balance
    And los parámetros "gestion=2025" y "mes=6"
  When se ejecuta la consulta
  Then la respuesta SHALL tener status 200
    And la respuesta SHALL incluir:
      - totalIngresos: SUM de movimientos.tipo='ingreso' para mes/gestion dados
      - totalEgresos: SUM de movimientos.tipo='egreso' para mes/gestion dados
      - neto: totalIngresos - totalEgresos
      - desglose: array de { categoria, monto } agrupado por tipo/categoria
    And el resultado SHALL estar filtrado por la ventana temporal (gestion+mes)

Scenario: Balance mensual retorna 400 si faltan parámetros obligatorios
  Given el endpoint GET /api/reportes/balance
  When se invoca sin "gestion"
  Then la respuesta SHALL ser 400
    And el cuerpo SHALL contener { error: "gestion and mes are required" }
```

### Libro Diario

```
Scenario: Obtener libro diario con todos los movimientos en un rango de fechas
  Given el endpoint GET /api/reportes/libro-diario
    And los parámetros "fechaDesde=2025-01-01" y "fechaHasta=2025-01-31"
  When se ejecuta la consulta
  Then la respuesta SHALL tener status 200
    And la respuesta SHALL incluir un array de movimientos con:
      - id, tipo, monto, fecha, nota, numeroRecibo
      - referenciaId
      - socioId + socioNombre + socioApellido (LEFT JOIN con socios)
    And los resultados SHALL estar ordenados por fecha ascendente
    And solo SHALL incluir movimientos en el rango [fechaDesde, fechaHasta]

Scenario: Libro diario sin filtros retorna últimos 30 días
  Given el endpoint GET /api/reportes/libro-diario
  When se invoca sin parámetros de fecha
  Then la respuesta SHALL tener status 200
    And los resultados SHALL corresponder a los últimos 30 días desde hoy
```

### Resumen por Socio

```
Scenario: Obtener resumen financiero de un socio
  Given el endpoint GET /api/reportes/resumen-socio/:id
    And el socio con id existe
  When se ejecuta la consulta
  Then la respuesta SHALL tener status 200
    And la respuesta SHALL incluir:
      - totalAportado: SUM de aportes.montoBase donde estado='pagado' y socioId = :id
      - multasPagadas: SUM de multas.monto donde estado='pagado' y socioId = :id
      - saldoPendiente: SUM de multas.saldoPendiente donde estado='pendiente' y socioId = :id
      - socio: { id, nombre, apellidoPaterno }

Scenario: Resumen de socio inexistente retorna 404
  Given el endpoint GET /api/reportes/resumen-socio/:id
    And ningún socio existe con ese id
  When se ejecuta la consulta
  Then la respuesta SHALL ser 404
    And el cuerpo SHALL contener { error: "Socio not found" }
```

## Validation

| Campo | Regla |
|-------|-------|
| `gestion` (balance) | MUST ser entero de 4 dígitos, 1900-2100 |
| `mes` (balance) | MUST ser entero 1-12 |
| `fechaDesde` (libro-diario) | MUST ser fecha ISO (YYYY-MM-DD) si se provee |
| `fechaHasta` (libro-diario) | MUST ser fecha ISO (YYYY-MM-DD) si se provee, MUST ser >= fechaDesde |
| `id` (resumen-socio) | MUST existir en tabla socios |

## Error States

| HTTP | Condición | Cuerpo |
|------|-----------|--------|
| 400 | Parámetros faltantes o inválidos | `{ error: "gestion and mes are required" }` |
| 400 | formato fecha inválido | `{ error: "Invalid date format, use YYYY-MM-DD" }` |
| 404 | Socio no encontrado | `{ error: "Socio not found" }` |
| 500 | Error interno de base de datos | `{ error: "Internal server error" }` |

## Frontend Spec

- Tres tabs navegables en `/reportes`:
  1. **Balance** — tabla con totalIngresos, totalEgresos, neto, y desglose por categoría. KPIs superiores.
  2. **Libro Diario** — tabla con todos los movimientos, filtro por rango de fechas, columnas: Fecha, Tipo, Socio, Concepto, Monto, Recibo.
  3. **Resumen Socio** — selector de socio + KPIs (totalAportado, multasPagadas, saldoPendiente).
