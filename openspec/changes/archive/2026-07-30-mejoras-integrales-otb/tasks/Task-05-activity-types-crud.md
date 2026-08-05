# Task-05: Activity Types CRUD — PUT, DELETE por ID, Frontend Completo

## Description

Completar el CRUD de tipos de actividad: agregar `PUT /api/tipos-actividad/:id` para edición parcial (solo campos presentes en body), cambiar `DELETE /:nombre` a `DELETE /:id` con manejo de error 409 cuando el tipo tiene actividades asociadas (capturar `SQLITE_CONSTRAINT_FOREIGNKEY`). Parsear `opciones`/`multas` como JSON en GET para devolver objetos en vez de strings.

En el frontend (`config.tsx`):
- Agregar botón "Editar" por cada tipo que abre un modal con campos: nombre, checkboxes de opciones predefinidas, montos de multa por opción, tolerancia
- Corregir `addTipoActividad` para no enviar `id` generado por frontend (`crypto.randomUUID()`)
- Corregir `removeTipoActividad` para enviar `id` (UUID) en vez de `nombre`

En el store (`app.store.ts`):
- Cambiar firma de `removeTipoActividad` de `nombre: string` a `id: string`
- Agregar `updateTipoActividad(id, data)` action

## Files

- `packages/api/src/routes/tipos-actividad.ts` — agregar PUT /:id, cambiar DELETE /:nombre → /:id
- `apps/web/src/routes/config.tsx` — edit modal, fix addTipo, fix removeTipo
- `apps/web/src/stores/app.store.ts` — updateTipoActividad, fix removeTipoActividad param

## Dependencies

Ninguna (schema actual de tipos_actividad no cambia).

## Acceptance Criteria

- [ ] `PUT /api/tipos-actividad/:id` soporta actualización parcial (solo campos en body)
- [ ] `PUT` retorna 404 si el tipo no existe
- [ ] `PUT` persiste `opciones` como JSON string, `multas` como JSON string
- [ ] `DELETE /api/tipos-actividad/:id` usa `id` (UUID), no `nombre`
- [ ] `DELETE` retorna 409 si el tipo tiene actividades asociadas (FK constraint)
- [ ] `DELETE` retorna 404 si el tipo no existe
- [ ] `GET /api/tipos-actividad` devuelve `opciones` como array y `multas` como object (parseados de JSON string)
- [ ] Frontend: cada tipo tiene botón "Editar" + "Eliminar"
- [ ] Frontend: modal de edición incluye nombre, opciones (checkboxes), multas (inputs por opción), tolerancia
- [ ] Frontend: `addTipoActividad` envía solo `{ nombre, opciones, multas, tolerancia }` sin `id`
- [ ] Frontend: `removeTipoActividad(id)` envía DELETE con UUID
- [ ] Store: `updateTipoActividad` definida y funcional
- [ ] Store: `removeTipoActividad` firma cambiada a `(id: string)`
- [ ] `pnpm typecheck` pasa sin errores

## Estimated Lines

140
