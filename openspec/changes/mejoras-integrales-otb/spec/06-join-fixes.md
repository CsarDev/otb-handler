# Join Fixes — Mostrar Nombres en vez de UUIDs en Actividades, Multas y Aportes

## Capability

`data-display-fixes` (bugs/data)

## Description

Actualmente las tablas de actividades, multas y aportes muestran UUIDs en lugar de nombres legibles. Actividades muestra `tipoId` como UUID en vez del nombre del tipo; Multas y Aportes muestran `socioId` como UUID en vez del nombre del socio. Esto hace que la UI sea inusable operativamente.

## Endpoints / Components

| Ubicación | Tipo | Descripción |
|-----------|------|-------------|
| `packages/api/src/routes/actividades.ts` | Modified | GET / hace LEFT JOIN con tipos_actividad, devuelve tipoNombre |
| `packages/api/src/routes/multas.ts` | Modified | GET / hace LEFT JOIN con socios, devuelve socioNombre + socioApellido |
| `packages/api/src/routes/aportes.ts` | Modified | GET / hace LEFT JOIN con socios, devuelve socioNombre + socioApellido |
| `packages/core/src/index.ts` | Modified | Tipos `Actividad`, `Multa`, `Aporte` agregan campos de nombre |
| `apps/web/src/routes/actividades.tsx` | Modified | Mostrar `a.tipoNombre`, ocultar `tipoId` en columna Tipo |
| `apps/web/src/routes/multas.tsx` | Modified | Mostrar socioNombre + socioApellido, ocultar socioId |
| `apps/web/src/routes/aportes.tsx` | Modified | Mostrar socioNombre + socioApellido, ocultar socioId |

## Scenarios

### Actividades — Mostrar Nombre del Tipo

```
Scenario: GET /api/actividades devuelve tipoNombre junto al tipoId
  Given existe una actividad con tipoId = UUID de un tipo_actividad
    And el tipo_actividad tiene nombre="Reunión"
  When se invoca GET /api/actividades
  Then cada actividad en la respuesta SHALL incluir:
      - tipoId (UUID, existente)
      - tipoNombre (string, "Reunión") ← NUEVO
    And NO SHALL romper la estructura existente de la respuesta
```

```
Scenario: Actividad sin tipo asociado devuelve tipoNombre como null
  Given existe una actividad con tipoId que no referencia un tipo válido
  When se invoca GET /api/actividades
  Then la actividad SHALL incluir tipoNombre = null
```

### Multas — Mostrar Nombre del Socio

```
Scenario: GET /api/multas devuelve datos del socio
  Given existe una multa con socioId = UUID de un socio
    And el socio tiene nombre="Juan", apellidoPaterno="Pérez"
  When se invoca GET /api/multas
  Then cada multa en la respuesta SHALL incluir:
      - socioId (UUID, existente)
      - socioNombre (string, "Juan") ← NUEVO
      - socioApellido (string, "Pérez") ← NUEVO
```

```
Scenario: Multa sin socio asociado devuelve socioNombre/socioApellido null
  Given existe una multa con socioId no válido o null
  When se invoca GET /api/multas
  Then la multa SHALL tener socioNombre = null, socioApellido = null
```

### Aportes — Mostrar Nombre del Socio

```
Scenario: GET /api/aportes devuelve datos del socio
  Given existe un aporte con socioId = UUID de un socio
    And el socio tiene nombre="María", apellidoPaterno="López"
  When se invoca GET /api/aportes
  Then cada aporte en la respuesta SHALL incluir:
      - socioId (UUID, existente)
      - socioNombre (string, "María") ← NUEVO
      - socioApellido (string, "López") ← NUEVO
```

### Frontend — Mostrar Nombres en Tablas

```
Scenario: Tabla de actividades muestra tipoNombre en columna Tipo
  Given el frontend recibe actividades con tipoNombre
  When se renderiza la tabla de actividades
  Then la columna "Tipo" SHALL mostrar a.tipoNombre
    And la columna "Tipo" NO SHALL mostrar a.tipoId (UUID)
```

```
Scenario: Tabla de multas muestra socioNombre en columna Socio
  Given el frontend recibe multas con socioNombre + socioApellido
  When se renderiza la tabla de multas
  Then la columna que antes mostraba "Socio ID" SHALL mostrar socioNombre + socioApellido
    And el encabezado de columna SHALL ser "Socio" en vez de "Socio ID"
```

```
Scenario: Tabla de aportes muestra socioNombre en columna Socio
  Given el frontend recibe aportes con socioNombre + socioApellido
  When se renderiza la tabla de aportes
  Then la columna "Socio ID" SHALL mostrar socioNombre + socioApellido
    And el encabezado SHALL ser "Socio"
```

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

- Usar `db.select({...}).from(schema.multas).leftJoin(schema.socios, eq(...)).all()`
- Los campos adicionales se mapean con `socioNombre: schema.socios.nombre`
- Mantener retrocompatibilidad: los campos UUID originales (`socioId`, `tipoId`) se conservan
- El frontend lee los nuevos campos `socioNombre`, `socioApellido`, `tipoNombre` para display

## Error States

| HTTP | Condición |
|------|-----------|
| 200 | Respuesta normal con campos adicionales null si no hay JOIN match |
| 500 | Error en query JOIN |
