# Task-07: Expenses Sync — PUT/DELETE de Egresos Sincronizan Movimientos

## Description

Actualmente `POST /api/egresos` crea tanto el egreso como el movimiento correspondiente, pero `PUT` y `DELETE` no sincronizan la tabla `movimientos`. Envolver ambos endpoints en `db.transaction()` para que actualicen/eliminen el movimiento asociado (identificado por `referenciaId = egreso.id AND tipo = 'egreso'`).

### PUT /:id
1. Validar que egreso existe (404 si no)
2. En transacción: actualizar egreso + actualizar movimiento correspondiente (monto, nota si cambiaron)
3. Si no hay movimiento asociado, solo actualizar egreso (graceful)

### DELETE /:id
1. Validar que egreso existe (404 si no)
2. En transacción: eliminar movimiento (WHERE referenciaId = id AND tipo = 'egreso') + eliminar egreso
3. Si no hay movimiento asociado, solo eliminar egreso (graceful)

## Files

- `packages/api/src/routes/egresos.ts` — PUT /:id y DELETE /:id con transacción

## Dependencies

Ninguna (no requiere cambios de schema).

## Acceptance Criteria

- [ ] `PUT /api/egresos/:id` envuelve update-egreso + update-movimiento en `db.transaction()`
- [ ] Movimiento se identifica por `referenciaId = :id AND tipo = 'egreso'`
- [ ] Si `monto` cambia, se actualiza en el movimiento
- [ ] Si `categoria`/`descripcion` cambia, se actualiza la `nota` del movimiento
- [ ] Si no hay movimiento asociado, PUT actualiza solo el egreso (sin error)
- [ ] `DELETE /api/egresos/:id` envuelve delete-movimiento + delete-egreso en `db.transaction()`
- [ ] DELETE retorna 204 si se elimina correctamente
- [ ] DELETE retorna 404 si el egreso no existe
- [ ] Todas las operaciones dentro del callback usan `tx`, no `db`
- [ ] Rollback completo si falla alguna operación de la transacción
- [ ] `pnpm typecheck` pasa sin errores

## Estimated Lines

55
