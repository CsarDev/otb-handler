# Task-06: Aportes — POST /bulk/all + GET /:id/pagos

## Description

En `packages/api/src/routes/aportes.ts`: **`POST /api/aportes/bulk/all`** — acepta igual que `/bulk` pero SIN `socioIds`; resuelve TODOS los socios cuyo `estadoId` permita la acción `aportes` reutilizando `cargarPermisosPorEstado`/`permite(...,'aportes')` (D5 — NO hardcode `estado='activo'`); deriva `montoBase` por socio vía `resolverMonto` (Task-05) y crea los mismos registros que `/bulk` dentro de la transacción; 400 `{ "error": "Ningún socio puede participar en esta acción en su estado actual" }` si ningún socio elegible (incluye `anual`→12 registros por socio). **`GET /api/aportes/:id/pagos`** — devuelve todos los movimientos con `referenciaId=<id>` y `tipo='ingreso'` ordenados por fecha (patrón `multas.get('/:id/pagos')`); 404 `{ "error": "Aporte not found" }` si el aporte no existe; `[]` si no tiene pagos.

## Requirements

- specs `payments` (bulk/all: 4 escenarios — solo permitidos, deriva por tipo, 400 no-eligible, anual→12; GET /:id/pagos: 3 escenarios — historial ingreso, vacío, 404)

## Files

- `packages/api/src/routes/aportes.ts` (mod)

## Dependencies

- Task-05 (helper `resolverMonto` + patrón de generación)

## Acceptance Criteria

- [ ] `pnpm --filter @otb/api typecheck` + build
- [ ] Smoke: `/bulk/all` con socio suspendido/baja los EXCLUYE (solo si su estado permite `aportes`)
- [ ] `/bulk/all` sin socios elegibles → 400 con mensaje indicado
- [ ] `/bulk/all` `tipo='anual'` → 12 registros por socio permitido
- [ ] GET `/api/aportes/:id/pagos` → solo movimientos `tipo='ingreso'` de ese aporte, ordenados
- [ ] GET `/api/aportes/fake-id/pagos` → 404; aporte sin pagos → `[]`

## Package Scope

api

## Estimated Lines

~85