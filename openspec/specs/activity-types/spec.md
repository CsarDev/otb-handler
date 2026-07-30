# Activity Types — CRUD Completo de Tipos de Actividad

## Capability

`activity-types`

## Description

Completar el CRUD de tipos de actividad: agregar PUT para editar un tipo existente, corregir DELETE para usar `id` (UUID) en lugar de `nombre`, y exponer `opciones` y `multas` como JSON parseado para edición completa desde el frontend.

## Endpoints / Components

| Ubicación | Tipo | Descripción |
|-----------|------|-------------|
| `packages/api/src/routes/tipos-actividad.ts` | Modified | Agregar PUT /:id; cambiar DELETE /:nombre → DELETE /:id |
| `apps/web/src/routes/config.tsx` | Modified | Formulario completo con checkboxes de opciones, montos de multa por opción |
| `apps/web/src/stores/app.store.ts` | Modified | Actualizar removeTipoActividad para usar id; agregar updateTipoActividad |

## Scenarios

### PUT — Editar Tipo de Actividad

```
Scenario: Editar nombre, opciones y tolerancia de un tipo de actividad
  Given existe un tipo de actividad con id="ta1", nombre="Reunión"
  When se invoca PUT /api/tipos-actividad/ta1 con body:
    {
      "nombre": "Asamblea",
      "opciones": ["asistio", "falta", "tardanza", "justificado", "licencia"],
      "multas": { "falta": 50, "tardanza": 20 },
      "tolerancia": 10
    }
  Then la respuesta SHALL ser 200
    And el tipo actualizado SHALL tener nombre="Asamblea"
    And opciones SHALL incluir "licencia"
    And multas.falta SHALL ser 50
    And tolerancia SHALL ser 10
```

```
Scenario: PUT con solo nombre actualiza solo nombre
  Given existe un tipo de actividad con id="ta1", nombre="Reunión", opciones=[...]
  When se invoca PUT /api/tipos-actividad/ta1 con body { "nombre": "Asamblea" }
  Then la respuesta SHALL ser 200
    And el nombre SHALL ser "Asamblea"
    And opciones SHALL mantener su valor anterior
    And multas SHALL mantener su valor anterior
    And tolerancia SHALL mantener su valor anterior
```

```
Scenario: PUT sobre tipo inexistente retorna 404
  Given no existe tipo de actividad con id="fake-id"
  When se invoca PUT /api/tipos-actividad/fake-id
  Then la respuesta SHALL ser 404
    And el error SHALL ser { "error": "Tipo de actividad not found" }
```

### DELETE — Eliminar por ID

```
Scenario: Eliminar tipo de actividad por UUID
  Given existe un tipo de actividad con id="ta1", nombre="Reunión"
  When se invoca DELETE /api/tipos-actividad/ta1
  Then la respuesta SHALL ser 200 (o 204)
    And el tipo ya no SHALL existir en la base de datos
```

```
Scenario: DELETE de tipo usado por actividades existentes
  Given existe un tipo de actividad con id="ta1"
    And existen actividades que referencian ta1 como tipoId
  When se invoca DELETE /api/tipos-actividad/ta1
  Then la respuesta SHALL ser 409 (Conflict)
    And el error SHALL indicar que el tipo tiene actividades asociadas
    Or la API SHALL manejar la foreign key constraint con error 409
```

```
Scenario: DELETE de tipo inexistente retorna 404
  Given no existe tipo de actividad con id="fake-id"
  When se invoca DELETE /api/tipos-actividad/fake-id
  Then la respuesta SHALL ser 404
```

### Almacenamiento de Opciones y Multas

```
Scenario: Opciones se almacenan como JSON array string en DB
  Given se crea o actualiza un tipo con opciones = ["asistio", "falta"]
  When se persiste en la base de datos
  Then el campo opciones en DB SHALL ser el string JSON '["asistio","falta"]'
```

```
Scenario: Multas se almacenan como JSON object string en DB
  Given se crea o actualiza un tipo con multas = { "falta": 50, "tardanza": 20 }
  When se persiste en la base de datos
  Then el campo multas en DB SHALL ser el string JSON '{"falta":50,"tardanza":20}'
```

```
Scenario: API devuelve opciones y multas parseadas como objetos, no strings
  Given existe un tipo con opciones='["asistio","falta"]' y multas='{"falta":50}'
  When se invoca GET /api/tipos-actividad
  Then la respuesta SHALL incluir opciones como array JSON, no string
    And multas SHALL incluirse como object JSON, no string
```

## Frontend Spec

En `apps/web/src/routes/config.tsx`, sección "Tipos de Actividad":

- Cada tipo MUST mostrar un botón "Editar" además de "Eliminar"
- Modal/formulario de edición SHALL incluir:
  - Campo `nombre` (text)
  - **Opciones de asistencia**: checkboxes para cada opción predefinida + opción de agregar custom
  - **Multas por opción**: input de monto (Bs) por cada opción seleccionable
  - Campo `tolerancia` (number, minutos)
- DELETE MUST enviar `id` (UUID), no `nombre`
- Los datos de opciones/multas SHALL parsearse de JSON string a objeto antes de enviar al formulario

## Validation

| Campo | Regla |
|-------|-------|
| `nombre` (PUT/POST) | MUST ser string no vacío |
| `nombre` (PUT/POST) | SHOULD ser único (sugerido, no bloqueante) |
| `opciones` (PUT/POST) | MUST ser array de strings si se provee |
| `multas` (PUT/POST) | MUST ser object con valores numéricos si se provee |
| `tolerancia` (PUT/POST) | MUST ser entero >= 0 |
| `id` (DELETE/PUT) | MUST ser UUID válido existente |

## Error States

| HTTP | Condición | Cuerpo |
|------|-----------|--------|
| 404 | Tipo no encontrado | `{ "error": "Tipo de actividad not found" }` |
| 400 | Datos inválidos | `{ "error": "nombre is required" }` |
| 409 | Tipo con actividades asociadas | `{ "error": "Cannot delete: tipo has associated actividades" }` |
