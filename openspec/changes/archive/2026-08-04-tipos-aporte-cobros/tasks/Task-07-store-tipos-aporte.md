# Task-07: Store Zustand — tiposAporte + CRUD + métodos bulk/pagos

## Description

En `apps/web/src/stores/app.store.ts`: agregar estado `tiposAporte` y acciones `addTipoAporte/updateTipoAporte/removeTipoAporte` (patrón full-list replace, siguiendo el bloque `tiposActividad` existente) cargadas en `fetchConfig`. Agregar `createAportesBulk(payload)` → `POST /api/aportes/bulk`; `createAportesBulkAll(payload)` → `POST /api/aportes/bulk/all` (sin `socioIds`); `fetchPagosAporte(id)` → `GET /api/aportes/:id/pagos`. Exponer selectores para: tipos activos (filtrado por `activo=1`, para el select de socio), y derivación del monto por socio (tipo → `montoBase`). Error handling consistente con el store (mensaje de error en 409/400 amigable).

## Requirements

- specs `aporte-types` (Frontend Spec: store carga tipos en `fetchConfig`)
- specs `payments` (Store expone createAportesBulk/All, fetchPagosAporte — success criteria del proposal)
- specs `socios-estados` (derivación de `aporteBase` en el cliente)

## Files

- `apps/web/src/stores/app.store.ts` (mod)

## Dependencies

- Task-03 (`/api/tipos-aporte` CRUD)
- Task-06 (`/bulk/all` y `/pagos`)

## Acceptance Criteria

- [ ] `pnpm --filter @otb/web typecheck` + build
- [ ] `fetchConfig` puebla `tiposAporte`
- [ ] Selector de tipos activos retorna solo `activo=1`
- [ ] `createAportesBulk/All` llaman al endpoint correcto y devuelven `{ count, items }`; `fetchPagosAporte` devuelve el array de pagos
- [ ] El store propaga el error 409/400 amigable al UI

## Package Scope

web

## Estimated Lines

~105