# Expenses — Sincronización de Movimientos en PUT/DELETE de Egresos

## Capability

`expenses`

## Description

Actualmente `POST /api/egresos` crea tanto el egreso como el movimiento correspondiente, pero `PUT` y `DELETE` no sincronizan la tabla `movimientos`. Esto genera movimientos huérfanos o desactualizados cuando se edita o elimina un egreso. Esta spec requiere envolver PUT y DELETE en transacciones que sincronicen ambas tablas.

## Endpoints / Components

| Ubicación | Tipo | Descripción |
|-----------|------|-------------|
| `packages/api/src/routes/egresos.ts` | Modified | PUT /:id y DELETE /:id sincronizan movimientos |
| `packages/db/src/schema/movimientos.ts` | Modified | Agregar columna opcional `motivo` |
| `packages/core/src/index.ts` | Modified | Tipo `Movimiento` agrega `motivo: string \| null` |

## Scenarios

### PUT — Actualizar Egreso + Movimiento

```
Scenario: PUT actualiza egreso y su movimiento correspondiente
  Given existe un egreso con id="eg1", monto=100, categoria="Luz", descripcion="Factura"
    And existe un movimiento con referenciaId="eg1", tipo="egreso", monto=100
  When se invoca PUT /api/egresos/eg1 con body:
    { "monto": 120, "categoria": "Luz", "descripcion": "Factura corregida" }
  Then la respuesta SHALL ser 200
    And el egreso SHALL tener monto=120
    And el movimiento con referenciaId "eg1" SHALL tener:
      - monto = 120
      - nota actualizada incluyendo nueva descripción
    And AMBAS operaciones SHALL ejecutarse dentro de una transacción
```

```
Scenario: PUT solo actualiza movimiento si hay cambios relevantes
  Given existe un egreso con monto=100
    And su movimiento asociado tiene monto=100, nota="Egreso: Luz"
  When se invoca PUT /api/egresos/eg1 con body { "beneficiario": "Nuevo" }
  Then el egreso SHALL actualizar beneficiario
    And el movimiento NO SHALL cambiar su monto
    And la nota del movimiento SHOULD actualizarse si cambió la categoría/descripción
```

```
Scenario: PUT con body vacío o inválido retorna 400
  Given existe un egreso con id="eg1"
  When se invoca PUT /api/egresos/eg1 con body vacío {}
  Then la respuesta SHALL ser 200 (update sin cambios)
    Or la respuesta SHALL ser 400 si no hay campos válidos para actualizar
```

### DELETE — Eliminar Egreso + Movimiento

```
Scenario: DELETE elimina egreso y su movimiento asociado
  Given existe un egreso con id="eg1"
    And existe un movimiento con referenciaId="eg1", tipo="egreso"
  When se invoca DELETE /api/egresos/eg1
  Then la respuesta SHALL ser 204
    And el egreso con id="eg1" NO SHALL existir
    And el movimiento con referenciaId="eg1" NO SHALL existir
    And AMBAS operaciones SHALL ejecutarse dentro de una transacción
```

```
Scenario: DELETE de egreso sin movimiento asociado
  Given existe un egreso con id="eg1"
    And NO existe movimiento con referenciaId="eg1"
  When se invoca DELETE /api/egresos/eg1
  Then la respuesta SHALL ser 204
    And el egreso SHALL eliminarse exitosamente
```

```
Scenario: DELETE de egreso inexistente retorna 404
  Given no existe egreso con id="fake-id"
  When se invoca DELETE /api/egresos/fake-id
  Then la respuesta SHALL ser 404
```

### Transaccionalidad

```
Scenario: Rollback completo si falla actualización de movimiento
  Given existe un egreso con id="eg1"
  When se invoca PUT /api/egresos/eg1 con body { "monto": 999 }
    And la actualización del movimiento falla (ej: violación de constraint)
  Then la transacción SHALL hacer rollback
    And el egreso "eg1" SHALL mantener su monto original
```

```
Scenario: Rollback completo si falla eliminación de movimiento
  Given existe un egreso con id="eg1"
  When se invoca DELETE /api/egresos/eg1
    And la eliminación del movimiento falla
  Then la transacción SHALL hacer rollback
    And el egreso "eg1" SHALL seguir existiendo
```

## Schema Changes

```diff
// packages/db/src/schema/movimientos.ts
+ motivo: text('motivo'),
```

El campo `motivo` es opcional y permite registrar una razón o justificación para el movimiento contable (útil para asientos manuales o ajustes).

## Validation

| Campo | Regla |
|-------|-------|
| `monto` (PUT egreso) | MUST ser > 0 si se provee |
| El movimiento asociado se identifica por `movimientos.referenciaId = egresos.id AND tipo = 'egreso'` | |

## Error States

| HTTP | Condición | Cuerpo |
|------|-----------|--------|
| 404 | Egreso no encontrado | `{ "error": "Not found" }` |
| 400 | monto <= 0 | `{ "error": "monto must be greater than 0" }` |
| 500 | Error en transacción | `{ "error": "Internal server error" }` |
