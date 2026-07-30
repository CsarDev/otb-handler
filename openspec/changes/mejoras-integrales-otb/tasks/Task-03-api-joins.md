# Task-03: API Joins — LEFT JOINs en GET Lists para Mostrar Nombres

## Description

Agregar LEFT JOINs en los tres GET endpoints de listado para devolver nombres legibles en vez de UUIDs. `GET /api/multas` LEFT JOIN con `socios` para devolver `socioNombre` + `socioApellido`. `GET /api/aportes` LEFT JOIN con `socios`. `GET /api/actividades` LEFT JOIN con `tipos_actividad` para devolver `tipoNombre`. Mantener retrocompatibilidad: los campos UUID originales (`socioId`, `tipoId`) se conservan.

En el frontend, actualizar las tablas para mostrar `socioNombre socioApellido` y `tipoNombre` en lugar de los UUIDs, y cambiar los encabezados de columna.

## Files

- `packages/api/src/routes/multas.ts` — GET / con LEFT JOIN socios
- `packages/api/src/routes/aportes.ts` — GET / con LEFT JOIN socios
- `packages/api/src/routes/actividades.ts` — GET / con LEFT JOIN tipos_actividad
- `apps/web/src/routes/multas.tsx` — columna "Socio" muestra socioNombre + socioApellido
- `apps/web/src/routes/aportes.tsx` — columna "Socio" muestra socioNombre + socioApellido
- `apps/web/src/routes/actividades.tsx` — columna "Tipo" muestra tipoNombre

## Dependencies

- Task-02 (core types con los nuevos campos)

## Acceptance Criteria

- [ ] `GET /api/multas` devuelve `socioNombre` + `socioApellido` (LEFT JOIN), socioId se conserva
- [ ] `GET /api/aportes` devuelve `socioNombre` + `socioApellido` (LEFT JOIN), socioId se conserva
- [ ] `GET /api/actividades` devuelve `tipoNombre` (LEFT JOIN), tipoId se conserva
- [ ] Si no hay match en JOIN, los campos nombre son `null`
- [ ] Tabla de multas muestra "Socio {socioNombre} {socioApellido}" en vez de UUID
- [ ] Tabla de aportes muestra "Socio {socioNombre} {socioApellido}" en vez de UUID
- [ ] Tabla de actividades muestra "{tipoNombre}" en vez del UUID de tipoId
- [ ] Encabezados de columna cambiados de "Socio ID" a "Socio" y "Tipo ID" a "Tipo"
- [ ] `pnpm typecheck` pasa sin errores

## Estimated Lines

65
