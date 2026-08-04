# Join Fixes — Mostrar Nombres en vez de UUIDs y Enforcement de Asistencia por Acción

## Capability

`join-fixes` (bugs/data)

> **Delta** from `openspec/specs/join-fixes/spec.md`: the asistencia module now MUST restrict attendance registration and socio selection to socios whose estado permits the `asistencia` action, and asistencia lists support `estadoId`/`grupoId` filters. The existing join/display behavior (names instead of UUIDs) is unchanged.

## Description

Actualmente las tablas de actividades, multas y aportes muestran UUIDs en lugar de nombres legibles. Actividades muestra `tipoId` como UUID en vez del nombre del tipo; Multas y Aportes muestran `socioId` como UUID en vez del nombre del socio. Esto hace que la UI sea inusable operativamente. Además, con el catálogo de estados, la selección de socios y el registro de asistencia MUST incluir solo socios cuyo estado permita la acción `asistencia`; cualquier registro sobre un socio no permitido SHALL rechazarse con 409, y la UI SHALL ocultar/deshabilitar a esos socios.

## Endpoints / Components

| Ubicación | Tipo | Descripción |
|-----------|------|-------------|
| `packages/api/src/routes/actividades.ts` | Modified | GET / hace LEFT JOIN con tipos_actividad, devuelve tipoNombre |
| `packages/api/src/routes/multas.ts` | Modified | GET / hace LEFT JOIN con socios, devuelve socioNombre + socioApellido |
| `packages/api/src/routes/aportes.ts` | Modified | GET / hace LEFT JOIN con socios, devuelve socioNombre + socioApellido |
| `packages/api/src/routes/asistencia.ts` | Modified | Enforcement `asistencia` en POST/PUT; filtros estado/grupo en GET |
| `packages/core/src/index.ts` | Modified | Tipos `Actividad`, `Multa`, `Aporte` agregan campos de nombre |
| `apps/web/src/routes/actividades.tsx` | Modified | Mostrar `a.tipoNombre`, ocultar `tipoId` en columna Tipo |
| `apps/web/src/routes/multas.tsx` | Modified | Mostrar socioNombre + socioApellido, ocultar socioId |
| `apps/web/src/routes/aportes.tsx` | Modified | Mostrar socioNombre + socioApellido, ocultar socioId |
| `apps/web/src/routes/asistencia.tsx` | Modified | Selector de socios filtrado por acción `asistencia`; filtros estado/grupo |

## Requirements

### Requirement: Actividades — Mostrar Nombre del Tipo

#### Scenario: GET /api/actividades devuelve tipoNombre junto al tipoId

- GIVEN existe una actividad con tipoId = UUID de un tipo_actividad
- AND el tipo_actividad tiene nombre="Reunión"
- WHEN se invoca GET /api/actividades
- THEN cada actividad en la respuesta SHALL incluir:
  - tipoId (UUID, existente)
  - tipoNombre (string, "Reunión") ← NUEVO
- AND NO SHALL romper la estructura existente de la respuesta

#### Scenario: Actividad sin tipo asociado devuelve tipoNombre como null

- GIVEN existe una actividad con tipoId que no referencia un tipo válido
- WHEN se invoca GET /api/actividades
- THEN la actividad SHALL incluir tipoNombre = null

### Requirement: Multas — Mostrar Nombre del Socio

#### Scenario: GET /api/multas devuelve datos del socio

- GIVEN existe una multa con socioId = UUID de un socio
- AND el socio tiene nombre="Juan", apellidoPaterno="Pérez"
- WHEN se invoca GET /api/multas
- THEN cada multa en la respuesta SHALL incluir:
  - socioId (UUID, existente)
  - socioNombre (string, "Juan") ← NUEVO
  - socioApellido (string, "Pérez") ← NUEVO

#### Scenario: Multa sin socio asociado devuelve socioNombre/socioApellido null

- GIVEN existe una multa con socioId no válido o null
- WHEN se invoca GET /api/multas
- THEN la multa SHALL tener socioNombre = null, socioApellido = null

### Requirement: Aportes — Mostrar Nombre del Socio

#### Scenario: GET /api/aportes devuelve datos del socio

- GIVEN existe un aporte con socioId = UUID de un socio
- AND el socio tiene nombre="María", apellidoPaterno="López"
- WHEN se invoca GET /api/aportes
- THEN cada aporte en la respuesta SHALL incluir:
  - socioId (UUID, existente)
  - socioNombre (string, "María") ← NUEVO
  - socioApellido (string, "López") ← NUEVO

### Requirement: Asistencia — Enforcement por Acción (Delta)

#### Scenario: Registrar asistencia de socio sin acción "asistencia" se rechaza con 409

- GIVEN una actividad existente
- AND un socio cuyo estado NO permite "asistencia" (ej: suspendido)
- WHEN se invoca POST /api/asistencia con { actividadId, registros: [{ socioId: "<ese-socio>" }] }
- THEN la respuesta SHALL ser 409
- AND el error SHALL ser amigable, ej: `{ "error": "El socio no puede realizar esta acción en su estado actual" }`
- AND NO SHALL insertarse NINGÚN registro (el batch es atómico)

#### Scenario: Registrar asistencia de socio permitido es exitoso

- GIVEN un socio cuyo estado permite "asistencia"
- WHEN se invoca POST /api/asistencia con { actividadId, registros: [{ socioId: "<socio>" }] }
- THEN la respuesta SHALL ser 201 con los registros creados

#### Scenario: Editar asistencia de socio no permitido se rechaza con 409

- GIVEN un registro de asistencia cuyo socio NO permite "asistencia"
- WHEN se invoca PUT /api/asistencia/<id>
- THEN la respuesta SHALL ser 409
- AND el registro SHALL permanecer sin cambios

#### Scenario: GET de asistencia de una actividad soporta filtros estado y grupo

- GIVEN registros de asistencia de s1 (activo) y s2 (suspendido, grupo g1)
- WHEN se invoca GET /api/asistencia/actividad/<actividadId>?estadoId=<suspendido-id>
- THEN la respuesta SHALL incluir solo los registros de s2
- WHEN se invoca GET /api/asistencia/actividad/<actividadId>?grupoId=g1
- THEN la respuesta SHALL incluir solo los registros de socios de g1

### Requirement: Frontend — Mostrar Nombres en Tablas

#### Scenario: Tabla de actividades muestra tipoNombre en columna Tipo

- GIVEN el frontend recibe actividades con tipoNombre
- WHEN se renderiza la tabla de actividades
- THEN la columna "Tipo" SHALL mostrar a.tipoNombre
- AND la columna "Tipo" NO SHALL mostrar a.tipoId (UUID)

#### Scenario: Tabla de multas muestra socioNombre en columna Socio

- GIVEN el frontend recibe multas con socioNombre + socioApellido
- WHEN se renderiza la tabla de multas
- THEN la columna que antes mostraba "Socio ID" SHALL mostrar socioNombre + socioApellido
- AND el encabezado de columna SHALL ser "Socio" en vez de "Socio ID"

#### Scenario: Tabla de aportes muestra socioNombre en columna Socio

- GIVEN el frontend recibe aportes con socioNombre + socioApellido
- WHEN se renderiza la tabla de aportes
- THEN la columna "Socio ID" SHALL mostrar socioNombre + socioApellido
- AND el encabezado SHALL ser "Socio"

#### Scenario: Selector de socios en asistencia excluye socios no permitidos (Delta)

- GIVEN el formulario de asistencia en /asistencia
- WHEN se renderiza el selector de socios para una actividad
- THEN solo SHALL listarse socios cuyo estado permite "asistencia"
- AND los demás SHALL ocultarse o deshabilitarse

## API Response Shape Changes

### Actividades Response (GET /api/actividades)

```json
{
  "id": "uuid",
  "tipoId": "uuid",
  "tipoNombre": "Reunión",        // ← NUEVO
  "fecha": "2025-06-15",
  "hora": "10:00",
  "descripcion": "..."
}
```

### Multas Response (GET /api/multas)

```json
{
  "id": "uuid",
  "socioId": "uuid",
  "socioNombre": "Juan",          // ← NUEVO
  "socioApellido": "Pérez",       // ← NUEVO
  "concepto": "...",
  "monto": 100,
  "saldoPendiente": 100,
  "estado": "pendiente"
}
```

### Aportes Response (GET /api/aportes)

```json
{
  "id": "uuid",
  "socioId": "uuid",
  "socioNombre": "María",         // ← NUEVO
  "socioApellido": "López",       // ← NUEVO
  "mes": 6,
  "gestion": 2025,
  "tipo": "mensual",
  "montoBase": 50,
  "estado": "pendiente"
}
```

## Core Type Changes

```diff
// packages/core/src/index.ts

export type Actividad = {
  id: string;
  tipoId: string;
+ tipoNombre: string | null;    // ← NUEVO
  fecha: string;
  hora: string | null;
  descripcion: string | null;
};

export type Multa = {
  id: string;
  socioId: string;
+ socioNombre: string | null;   // ← NUEVO
+ socioApellido: string | null; // ← NUEVO
  actividadId: string | null;
  concepto: string;
  monto: number;
+ saldoPendiente: number;       // ← NUEVO (ver spec 02)
  fechaGen: string;
  fechaPago: string | null;
  estado: 'pendiente' | 'pagado' | 'anulado';
};

export type Aporte = {
  id: string;
  socioId: string;
+ socioNombre: string | null;   // ← NUEVO
+ socioApellido: string | null; // ← NUEVO
  mes: number | null;
  gestion: number | null;
  tipo: 'mensual' | 'extraordinario';
  montoBase: number;
  numeroRecibo: string | null;
  fechaPago: string | null;
  estado: 'pendiente' | 'pagado' | 'anulado';
};
```

## Implementation Notes

- Usar `db.select({...}).from(schema.asistencia).leftJoin(schema.socios, ...)` para resolver estado/grupo en los filtros de asistencia
- El enforcement de `asistencia` SHALL usar el helper compartido `socioPermite(socio, 'asistencia')`
- Mantener retrocompatibilidad: los campos UUID originales (`socioId`, `tipoId`) se conservan
- El frontend lee los nuevos campos `socioNombre`, `socioApellido`, `tipoNombre` para display

## Error States

| HTTP | Condición |
|------|-----------|
| 200 | Respuesta normal con campos adicionales null si no hay JOIN match |
| 409 | Registro/edición de asistencia de socio cuyo estado no permite `asistencia` |
| 500 | Error en query JOIN |
