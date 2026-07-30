# Form Fixes — Corrección de Selects y Opciones en Formularios

## Capability

`form-fixes` (bugs)

## Description

Varios formularios tienen selects con valores incorrectos. El formulario de actividades usa `t.nombre` como value en el select de tipo en vez de `t.id` (UUID). El formulario de aportes tiene opciones de tipo incorrectas (`individual`, `anual`) en vez de solo `['mensual', 'extraordinario']`. El formulario de tipos de actividad en config.tsx construye objetos con `id: crypto.randomUUID()` en vez de dejar que la API genere el UUID.

## Endpoints / Components

| Ubicación | Tipo | Descripción |
|-----------|------|-------------|
| `apps/web/src/routes/actividades.tsx` | Modified | Select de tipo: value = `t.id`, display = `t.nombre` |
| `apps/web/src/routes/aportes.tsx` | Modified | Select de tipo: solo opciones `mensual` y `extraordinario` |
| `apps/web/src/routes/config.tsx` | Modified | addTipoActividad no envía id generado por frontend |

## Scenarios

### Actividades — Select de Tipo

```
Scenario: Select de tipo en formulario de actividad usa UUID como value
  Given existen tipos de actividad con id="uuid-1", nombre="Reunión"
  When se abre el modal de crear/editar actividad
  Then el select de tipo SHALL tener:
      - value = t.id ("uuid-1")        // ← CORREGIDO
      - display text = t.nombre ("Reunión")
    And NO SHALL tener value = t.nombre
```

```
Scenario: Al enviar formulario se envía el UUID del tipo
  Given el usuario selecciona "Reunión" en el select (value="uuid-1")
  When se envía el formulario
  Then el payload POST/PUT SHALL contener tipoId = "uuid-1"
    And NO SHALL contener tipoId = "Reunión"
```

### Aportes — Select de Tipo

```
Scenario: Select de tipo en aporte solo tiene mensual y extraordinario
  Given se abre el modal de crear aporte
  Then el select de tipo SHALL tener SOLO las opciones:
      - value="mensual",   display="Mensual"
      - value="extraordinario", display="Extraordinario"
    And NO SHALL incluir "individual"
    And NO SHALL incluir "anual"
```

```
Scenario: Tipo "mensual" es el valor por defecto
  Given se abre el modal de crear aporte
  Then el select de tipo SHALL tener "mensual" preseleccionado por defecto
```

### Config — Tipos de Actividad

```
Scenario: addTipoActividad no envía id generado por frontend
  Given el usuario llena el formulario de nuevo tipo
    With nombre="Asamblea", tolerancia=10
  When se invoca addTipoActividad
  Then el payload POST SHALL incluir solo:
      - nombre, opciones, multas, tolerancia
    And NO SHALL incluir "id" generado por crypto.randomUUID()
    And la API SHALL generar el UUID en el servidor
```

```
Scenario: addTipoActividad envía opciones y multas como array/object
  Given el usuario selecciona opciones y montos de multa en el formulario
  When se invoca addTipoActividad
  Then el payload SHALL incluir opciones como array
    And multas como object (si hay montos definidos)
    And la API SHALL serializar a JSON string para almacenamiento
```

## Validation

| Elemento | Regla |
|----------|-------|
| Select tipo (actividad) | value MUST ser `t.id` (UUID), display MUST ser `t.nombre` |
| Select tipo (aporte) | Solo MUST contener `mensual` y `extraordinario` |
| Default tipo (aporte) | MUST ser `mensual` |
| POST tipo-actividad | El frontend NO SHOULD enviar campo `id` |
| POST tipo-actividad | `opciones` SHOULD enviarse como array JS (se serializa en API) |

## Type Changes

No hay cambios de tipo en API response — son bugs exclusivamente de frontend.
