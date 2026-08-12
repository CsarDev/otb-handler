# Reports — Balance Mensual, Libro Diario, Resumen por Socio con Permisos y Filtros

## Capability

`reports`

> **Delta** from `openspec/specs/reports/spec.md` (paginacion-avanzada): `GET /api/reportes/libro-diario` responde SIEMPRE con el envelope `{ items, total, page, pageSize }` (reemplaza el array plano) y acepta los query params `page`/`pageSize` (defaults 1/25, cap 100 vía `parsePaginacion`). `items` SHALL ordenarse determinísticamente por `fecha ASC, id DESC` (tiebreak: dentro de la misma fecha, id DESC). `total` es el COUNT de todas las filas que matchean los filtros existentes (fechaDesde/fechaHasta — default últimos 30 días —, estadoId, grupoId, gestion, mes, tipo) ANTES de la paginación. El consumidor es único e in-repo (reportes.tsx), actualizado en el mismo cambio. Balance y resumen-socio son UNCHANGED.

> **Delta** from `openspec/specs/reports/spec.md`: socio-facing report endpoints MUST respect the state action catalog. `resumen-socio` requires the `reportes` action on the socio's estado (409 otherwise). `libro-diario` and `resumen-socio` support optional `estadoId`/`grupoId` filters (socio estado / group membership). Balance and existing aggregation behavior are unchanged.

## Description

Proveer tres endpoints de reportes contables agregados que permitan obtener balances mensuales, el libro diario de movimientos y resúmenes individuales por socio. Estos reportes son necesarios para la operación contable en producción y actualmente no existen. With the states catalog, a socio SHALL appear in reports and summaries only when its estado permits the `reportes` action; the resumen-socio endpoint MUST reject (409) socios whose estado does not permit it, and list endpoints SHALL support `estadoId`/`grupoId` filters.

## Endpoints / Components

| Ubicación | Tipo | Descripción |
|-----------|------|-------------|
| `packages/api/src/routes/reportes.ts` | **New** | Router Hono con tres endpoints GET + enforcement `reportes` + filtros estado/grupo |
| `packages/api/src/index.ts` | Modified | Registrar `api.route('/api/reportes', reportesRouter)` |
| `apps/web/src/routes/reportes.tsx` | Modified | Implementar UI de tres tabs (Balance, Libro Diario, Resumen Socio) + filtros |
| `apps/web/src/stores/app.store.ts` | Modified | Agregar fetchReportesBalance, fetchReportesLibroDiario, fetchReportesResumenSocio |

## Requirements

### Requirement: Balance Mensual

#### Scenario: Obtener balance mensual con ingresos, egresos y neto

- GIVEN el endpoint GET /api/reportes/balance
- AND los parámetros "gestion=2025" y "mes=6"
- WHEN se ejecuta la consulta
- THEN la respuesta SHALL tener status 200
- AND la respuesta SHALL incluir:
  - totalIngresos: SUM de movimientos.tipo='ingreso' para mes/gestion dados
  - totalEgresos: SUM de movimientos.tipo='egreso' para mes/gestion dados
  - neto: totalIngresos - totalEgresos
  - desglose: array de { categoria, monto } agrupado por tipo/categoria
- AND el resultado SHALL estar filtrado por la ventana temporal (gestion+mes)

#### Scenario: Balance mensual retorna 400 si faltan parámetros obligatorios

- GIVEN el endpoint GET /api/reportes/balance
- WHEN se invoca sin "gestion"
- THEN la respuesta SHALL ser 400
- AND el cuerpo SHALL contener { error: "gestion and mes are required" }

### Requirement: Libro Diario

`GET /api/reportes/libro-diario` MUST aceptar los query params opcionales `page` y `pageSize` (defaults page=1, pageSize=25; pageSize SHALL clampearse a 100 si se provee un valor mayor; valores no numéricos o page < 1 SHALL caer a los defaults vía `parsePaginacion`) y SHALL responder SIEMPRE con el envelope `{ items, total, page, pageSize }`, donde `items` es el slice de la página, `total` es el COUNT de todas las filas que matchean los filtros existentes (fechaDesde/fechaHasta — default últimos 30 días —, estadoId, grupoId, gestion, mes, tipo) ANTES de la paginación, y `page`/`pageSize` hacen echo de los valores efectivos. `items` SHALL ordenarse determinísticamente: `fecha ASC, id DESC` (tiebreak dentro de la misma fecha). El envelope reemplaza el array plano de la versión anterior; el único consumidor (reportes.tsx) se actualiza en el mismo cambio.

#### Scenario: Obtener libro diario con todos los movimientos en un rango de fechas

- GIVEN el endpoint GET /api/reportes/libro-diario
- AND los parámetros "fechaDesde=2025-01-01" y "fechaHasta=2025-01-31"
- WHEN se ejecuta la consulta
- THEN la respuesta SHALL tener status 200
- AND la respuesta SHALL incluir un array de movimientos con:
  - id, tipo, monto, fecha, nota, numeroRecibo
  - referenciaId
  - socioId + socioNombre + socioApellido (LEFT JOIN con socios)
- AND los resultados SHALL estar ordenados por fecha ascendente
- AND solo SHALL incluir movimientos en el rango [fechaDesde, fechaHasta]

#### Scenario: Libro diario sin filtros retorna últimos 30 días

- GIVEN el endpoint GET /api/reportes/libro-diario
- WHEN se invoca sin parámetros de fecha
- THEN la respuesta SHALL tener status 200
- AND los resultados SHALL corresponder a los últimos 30 días desde hoy

#### Scenario: Libro diario se filtra por estado del socio (Delta)

- GIVEN movimientos de s1 (estado activo) y s2 (estado suspendido)
- WHEN se invoca GET /api/reportes/libro-diario?estadoId=<suspendido-id>
- THEN la respuesta SHALL incluir solo movimientos de socios con ese estado

#### Scenario: Libro diario se filtra por grupo del socio (Delta)

- GIVEN movimientos de s1 (grupo g1) y s3 (sin grupo)
- WHEN se invoca GET /api/reportes/libro-diario?grupoId=g1
- THEN la respuesta SHALL incluir solo movimientos de s1
- AND los filtros estadoId y grupoId SHALL poder combinarse

#### Scenario: Libro diario devuelve la primera página con total

- GIVEN existen 60 movimientos en el rango de fechas
- WHEN GET /api/reportes/libro-diario
- THEN la respuesta SHALL ser 200 con { items: [25 movimientos], total: 60, page: 1, pageSize: 25 }

#### Scenario: pageSize mayor a 100 se clampea a 100

- WHEN GET /api/reportes/libro-diario?pageSize=500
- THEN la respuesta SHALL llevar pageSize=100 y a lo sumo 100 items

#### Scenario: Los filtros se aplican antes de la paginación y total refleja el conteo filtrado

- GIVEN movimientos de s1 (activo) y s2 (suspendido)
- WHEN GET /api/reportes/libro-diario?estadoId=<suspendido-id>&pageSize=10
- THEN items SHALL contener solo movimientos de s2
- AND total SHALL ser el conteo de movimientos de s2 únicamente (antes de la paginación)

#### Scenario: El orden es determinista entre páginas (sin duplicados ni huecos)

- GIVEN 60 movimientos con fechas/ids distintos
- WHEN GET /api/reportes/libro-diario?page=1 y GET /api/reportes/libro-diario?page=2 (pageSize=25)
- THEN cada movimiento SHALL aparecer exactamente una vez entre ambas páginas
- AND la página 1 SHALL contener los 25 movimientos con la fecha más antigua (fecha ASC)
- AND dentro de la misma fecha, los ids SHALL ordenarse DESC

#### Scenario: Lista vacía devuelve items [] y total 0

- GIVEN ningún movimiento en el rango de fechas
- WHEN GET /api/reportes/libro-diario
- THEN la respuesta SHALL ser 200 con { items: [], total: 0, page: 1, pageSize: 25 }

### Requirement: Resumen por Socio

#### Scenario: Obtener resumen financiero de un socio permitido

- GIVEN el endpoint GET /api/reportes/resumen-socio/:id
- AND el socio con id existe y su estado permite la acción "reportes"
- WHEN se ejecuta la consulta
- THEN la respuesta SHALL tener status 200
- AND la respuesta SHALL incluir:
  - totalAportado: SUM de aportes.montoBase donde estado='pagado' y socioId = :id
  - multasPagadas: SUM de multas.monto donde estado='pagado' y socioId = :id
  - saldoPendiente: SUM de multas.saldoPendiente donde estado='pendiente' y socioId = :id
  - socio: { id, nombre, apellidoPaterno }

#### Scenario: Resumen de socio inexistente retorna 404

- GIVEN el endpoint GET /api/reportes/resumen-socio/:id
- AND ningún socio existe con ese id
- WHEN se ejecuta la consulta
- THEN la respuesta SHALL ser 404
- AND el cuerpo SHALL contener { error: "Socio not found" }

#### Scenario: Resumen de socio cuyo estado no permite "reportes" retorna 409 (Delta)

- GIVEN el endpoint GET /api/reportes/resumen-socio/:id
- AND el socio existe pero su estado NO permite la acción "reportes" (ej: dado_de_baja)
- WHEN se ejecuta la consulta
- THEN la respuesta SHALL ser 409
- AND el error SHALL ser amigable, ej: `{ "error": "El socio no puede realizar esta acción en su estado actual" }`

#### Scenario: Resumen por socio filtra sus listas pendientes por estado y grupo (Delta)

- GIVEN el endpoint GET /api/reportes/resumen-socio/:id
- WHEN se invoca con ?estadoId=<id> o ?grupoId=<id>
- THEN las listas aportesPendientes/multasPendientes SHALL filtrarse
- AND los totales agregados SHALL permanecer inalterados

## Validation

| Campo | Regla |
|-------|-------|
| `gestion` (balance) | MUST ser entero de 4 dígitos, 1900-2100 |
| `mes` (balance) | MUST ser entero 1-12 |
| `fechaDesde` (libro-diario) | MUST ser fecha ISO (YYYY-MM-DD) si se provee |
| `fechaHasta` (libro-diario) | MUST ser fecha ISO (YYYY-MM-DD) si se provee, MUST ser >= fechaDesde |
| `id` (resumen-socio) | MUST existir en tabla socios |
| `estadoId`/`grupoId` (filtros) | Opcionales; si se proveen, MUST filtrar por estado del socio o pertenencia a grupo |
| Acción `reportes` | MUST permitirse en el estado del socio para resumen-socio (409 si no) |

## Error States

| HTTP | Condición | Cuerpo |
|------|-----------|--------|
| 400 | Parámetros faltantes o inválidos | `{ error: "gestion and mes are required" }` |
| 400 | formato fecha inválido | `{ error: "Invalid date format, use YYYY-MM-DD" }` |
| 404 | Socio no encontrado | `{ error: "Socio not found" }` |
| 409 | Estado del socio no permite la acción `reportes` | `{ error: "El socio no puede realizar esta acción en su estado actual" }` |
| 500 | Error interno de base de datos | `{ error: "Internal server error" }` |

## Frontend Spec

- Tres tabs navegables en `/reportes`:
  1. **Balance** — tabla con totalIngresos, totalEgresos, neto, y desglose por categoría. KPIs superiores.
  2. **Libro Diario** — tabla con todos los movimientos, filtro por rango de fechas, columnas: Fecha, Tipo, Socio, Concepto, Monto, Recibo.
  3. **Resumen Socio** — selector de socio + KPIs (totalAportado, multasPagadas, saldoPendiente).
- (Delta) El selector de socio en Resumen Socio SHALL ocultar/deshabilitar socios cuyo estado no permita `reportes`
- (Delta) Libro Diario y Resumen Socio ganan selects de filtro por estado y por grupo
