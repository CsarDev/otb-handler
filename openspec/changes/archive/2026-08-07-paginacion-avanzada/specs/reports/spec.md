# Delta for Reports

> **Delta** from `openspec/specs/reports/spec.md` (paginacion-avanzada): `GET /api/reportes/libro-diario` responde SIEMPRE con el envelope `{ items, total, page, pageSize }` (reemplaza el array plano) y acepta los query params `page`/`pageSize` (defaults 1/25, cap 100 vía `parsePaginacion`). `items` SHALL ordenarse determinísticamente por `fecha ASC, id DESC` (tiebreak: dentro de la misma fecha, id DESC). `total` es el COUNT de todas las filas que matchean los filtros existentes (fechaDesde/fechaHasta — default últimos 30 días —, estadoId, grupoId, gestion, mes, tipo) ANTES de la paginación. El consumidor es único e in-repo (reportes.tsx), actualizado en el mismo cambio. Balance y resumen-socio son UNCHANGED.

> **Scenario status tags**: los escenarios etiquetados `(IMPLEMENTED — regression)` verifican comportamiento pre-existente que MUST preservarse; los sin etiqueta son NUEVOS y son los targets de verificación de este cambio.

## MODIFIED Requirements

### Requirement: Libro Diario

`GET /api/reportes/libro-diario` MUST aceptar los query params opcionales `page` y `pageSize` (defaults page=1, pageSize=25; pageSize SHALL clampearse a 100 si se provee un valor mayor; valores no numéricos o page < 1 SHALL caer a los defaults vía `parsePaginacion`) y SHALL responder SIEMPRE con el envelope `{ items, total, page, pageSize }`, donde `items` es el slice de la página, `total` es el COUNT de todas las filas que matchean los filtros existentes (fechaDesde/fechaHasta — default últimos 30 días —, estadoId, grupoId, gestion, mes, tipo) ANTES de la paginación, y `page`/`pageSize` hacen echo de los valores efectivos. `items` SHALL ordenarse determinísticamente: `fecha ASC, id DESC` (tiebreak dentro de la misma fecha). El envelope reemplaza el array plano de la versión anterior; el único consumidor (reportes.tsx) se actualiza en el mismo cambio.
(Previously: respondía un array plano de movimientos ordenado solo por fecha ASC, sin paginación ni total.)

#### Scenario: Obtener libro diario con todos los movimientos en un rango de fechas — (IMPLEMENTED — regression)

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

#### Scenario: Libro diario sin filtros retorna últimos 30 días — (IMPLEMENTED — regression)

- GIVEN el endpoint GET /api/reportes/libro-diario
- WHEN se invoca sin parámetros de fecha
- THEN la respuesta SHALL tener status 200
- AND los resultados SHALL corresponder a los últimos 30 días desde hoy

#### Scenario: Libro diario se filtra por estado del socio (Delta) — (IMPLEMENTED — regression)

- GIVEN movimientos de s1 (estado activo) y s2 (estado suspendido)
- WHEN se invoca GET /api/reportes/libro-diario?estadoId=<suspendido-id>
- THEN la respuesta SHALL incluir solo movimientos de socios con ese estado

#### Scenario: Libro diario se filtra por grupo del socio (Delta) — (IMPLEMENTED — regression)

- GIVEN movimientos de s1 (grupo g1) y s3 (sin grupo)
- WHEN se invoca GET /api/reportes/libro-diario?grupoId=g1
- THEN la respuesta SHALL incluir solo movimientos de s1
- AND los filtros estadoId y grupoId SHALL poder combinarse

#### Scenario: Libro diario devuelve la primera página con total — NEW

- GIVEN existen 60 movimientos en el rango de fechas
- WHEN GET /api/reportes/libro-diario
- THEN la respuesta SHALL ser 200 con { items: [25 movimientos], total: 60, page: 1, pageSize: 25 }

#### Scenario: pageSize mayor a 100 se clampea a 100 — NEW

- WHEN GET /api/reportes/libro-diario?pageSize=500
- THEN la respuesta SHALL llevar pageSize=100 y a lo sumo 100 items

#### Scenario: Los filtros se aplican antes de la paginación y total refleja el conteo filtrado — NEW

- GIVEN movimientos de s1 (activo) y s2 (suspendido)
- WHEN GET /api/reportes/libro-diario?estadoId=<suspendido-id>&pageSize=10
- THEN items SHALL contener solo movimientos de s2
- AND total SHALL ser el conteo de movimientos de s2 únicamente (antes de la paginación)

#### Scenario: El orden es determinista entre páginas (sin duplicados ni huecos) — NEW

- GIVEN 60 movimientos con fechas/ids distintos
- WHEN GET /api/reportes/libro-diario?page=1 y GET /api/reportes/libro-diario?page=2 (pageSize=25)
- THEN cada movimiento SHALL aparecer exactamente una vez entre ambas páginas
- AND la página 1 SHALL contener los 25 movimientos con la fecha más antigua (fecha ASC)
- AND dentro de la misma fecha, los ids SHALL ordenarse DESC

#### Scenario: Lista vacía devuelve items [] y total 0 — NEW

- GIVEN ningún movimiento en el rango de fechas
- WHEN GET /api/reportes/libro-diario
- THEN la respuesta SHALL ser 200 con { items: [], total: 0, page: 1, pageSize: 25 }
