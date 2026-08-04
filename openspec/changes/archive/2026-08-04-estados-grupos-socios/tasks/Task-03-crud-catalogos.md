# Task-03: CRUD catálogos (estados-socio, acciones-socio, grupos)

## Description

Clonar `tipos-actividad.ts`: router `estados-socio` (GET con `accionIds` aplanado por query agrupada; POST valida nombre/color hex/flags, `accionIds` default = todas, `orden` max+1, unicidad esDefecto/esBaja → 400; PUT edita TODO revalidando unicidad; DELETE 409 si `socios` lo referencian; `PUT /:id/acciones` reemplazo atómico en tx con validación de existencias); router `acciones-socio` (POST clave duplicada → 409, DELETE 409 si `estado_acciones` la referencia); router `grupos` (clon + DELETE 409 si `socios.grupoPrimarioId` o fila en `socio_grupos`); montar los 3 en `index.ts`.

## Requirements

- specs `socios-estados` (Catalog CRUD — Estados: 10 escenarios; Catalog CRUD — Acciones: 3 escenarios)
- specs `grupos` (Group CRUD: 8 escenarios)

## Files

- `packages/api/src/routes/estados-socio.ts` (nuevo)
- `packages/api/src/routes/acciones-socio.ts` (nuevo)
- `packages/api/src/routes/grupos.ts` (nuevo)
- `packages/api/src/index.ts` (mod)

## Dependencies

- Task-01
- Task-02

## Acceptance Criteria

- [ ] `pnpm typecheck` + `pnpm --filter @otb/api build`
- [ ] Curl smoke: POST estado sin accionIds → 7 acciones
- [ ] Clave duplicada → 409
- [ ] DELETE estado en uso → 409
- [ ] PUT acciones con id falso → 400 sin mutar el M:N

## Estimated Lines

~335
