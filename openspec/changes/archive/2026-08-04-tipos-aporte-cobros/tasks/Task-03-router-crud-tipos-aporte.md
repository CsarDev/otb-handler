# Task-03: Router CRUD tipos-aporte + mount API

## Description

Crear `packages/api/src/routes/tipos-aporte.ts` clon de `tipos-actividad.ts`: `GET /` (lista completa), `POST /` (valida `nombre` required + `montoBase` number >= 0; 400 con `"nombre is required"`/montoBase; 201 con catálogo completo), `PUT /:id` (404 si no existe; valida igual que POST; 200 catálogo completo), `DELETE /:id` (404 si no existe; **guard 409** — D1 — si algún `socios.tipoAporteId` referencia el tipo, con `{ "error": "No se puede eliminar: hay socios usando este tipo" }`; 200 catálogo completo). Montar `api.route('/api/tipos-aporte', tiposAporteRouter)` en `packages/api/src/index.ts` (archivo que exporta `ApiApp` para los tests de integración de Task-10).

## Requirements

- specs `aporte-types` (Catalog CRUD: 8 escenarios — list, create, 400 nombre/montoBase, update, 404, delete ok, **delete in-use 409**)

## Files

- `packages/api/src/routes/tipos-aporte.ts` (nuevo)
- `packages/api/src/index.ts` (mod)

## Dependencies

- Task-01 (tabla + catálogo sembrado)
- Task-02 (types `TipoAporte`/`TipoAporteInput`)

## Acceptance Criteria

- [ ] `pnpm --filter @otb/api typecheck` + build sin error
- [ ] Smoke con `pnpm dev`: GET lista tipos; POST sin `nombre` → 400; POST crea y devuelve catálogo
- [ ] DELETE de tipo usado por un socio → 409 con mensaje amigable; tipo sin uso → 200 y desaparece
- [ ] `ApiApp` exportada e incluye la ruta `/api/tipos-aporte` (requisito para Task-10)

## Package Scope

api

## Estimated Lines

~95
