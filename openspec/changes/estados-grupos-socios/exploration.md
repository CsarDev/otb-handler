# Exploración: Estados de Socios (ciclo de vida configurable) + Grupos configurables

## Estado Actual

### 1. Schema DB de socios

**Archivo**: `packages/db/src/schema/socios.ts` — tabla `socios` (SQLite, Drizzle):

| Campo | Columna SQL | Tipo | Null/Default |
|-------|-------------|------|--------------|
| `id` | `id` | text PK | — |
| `nombre` | `nombre` | text | notNull |
| `apellidoPaterno` | `apellido_paterno` | text | notNull |
| `apellidoMaterno` | `apellido_materno` | text | nullable |
| `ci` | `ci` | text | nullable |
| `telefono` | `telefono` | text | nullable |
| `email` | `email` | text | nullable |
| `ocupacion` | `ocupacion` | text | nullable |
| `direccion` | `direccion` | text | nullable |
| `fechaNac` | `fecha_nac` | text | nullable |
| `fechaIng` | `fecha_ing` | text | nullable |
| `fechaAlta` | `fecha_alta` | text | nullable |
| `aporteBase` | `aporte_base` | real | notNull, default 0 |
| `estado` | `estado` | text, **enum `['activo','inactivo','suspendido']`** | notNull, default `'activo'` |

**SÍ existe enum de estado**, hardcodeado en Drizzle: `'activo' | 'inactivo' | 'suspendido'`. NO existe "dado de baja" — hoy el "baja" se modela como `inactivo` (el DELETE lo setea). NO hay campos tipo grupo/categoría en socios (`egresos.categoria` es de otro dominio).

- Migración: `packages/db/drizzle/0000_blushing_calypso.sql` — `estado` es `text DEFAULT 'activo'` a nivel SQL, **sin CHECK constraint**; el enum solo se aplica en tipos TypeScript de Drizzle. La DB es permisiva a nivel SQL.
- Tipo de dominio: `packages/core/src/index.ts` — `Socio.estado: 'activo' | 'inactivo' | 'suspendido'` (línea 15).
- Seed: `packages/db/src/seed.ts` usa los 3 valores (`activo` 12, `inactivo` 2, `suspendido` 1); la generación de asistencia/aportes saltea `inactivo`/`suspendido`.
- Export: `packages/db/src/schema.ts` re-exporta todos los schemas; `packages/db/src/index.ts` exporta `db` + `schema` (SQLite via better-sqlite3, WAL, FK ON).

### 2. API de socios

**Archivo**: `packages/api/src/routes/socios.ts` — montado en `packages/api/src/index.ts` bajo `/api/socios`.

| Endpoint | Descripción | Detalle |
|----------|-------------|---------|
| `GET /api/socios?search=` | Listar | LIKE sobre nombre y apellidoPaterno; sin paginación ni filtro por estado |
| `GET /api/socios/:id` | Obtener | 404 `{error:'Not found'}` si no existe |
| `POST /api/socios` | Crear | Requiere `nombre` + `apellidoPaterno`; genera `id` con `crypto.randomUUID()`; **no valida `estado`** (pasa `...body` directo) |
| `PUT /api/socios/:id` | Actualizar | Elimina `body.id`, hace `update().set(body)` (replace completo, sin validación de campos) |
| `DELETE /api/socios/:id` | **Baja (soft)** | NO borra el registro: `update().set({ estado: 'inactivo' })`, responde 204. Es el único mecanismo de baja actual |

- **NO hay PATCH**. El estado se cambia solo por: PUT con body completo (si el frontend lo enviara) o DELETE (fuerza `inactivo`).
- **Precedente de endpoints de acción** (patrón a considerar para transiciones de estado): `POST /api/aportes/:id/pagar`, `POST /api/aportes/:id/anular`, `POST /api/multas/:id/pagar`, `POST /api/multas/:id/anular` (en `packages/api/src/routes/aportes.ts` y `multas.ts`).
- Consumidores de `socios.estado` fuera del CRUD:
  - `packages/api/src/routes/dashboard.ts` (líneas 42-43, 61): cuenta solo `estado === 'activo'` para totales/morosos.
  - `packages/api/src/routes/reportes.ts` y `asistencia.ts` no filtran por estado de socio directamente (sí por estado de aporte/multa).
  - `seed.ts` (asistencia/aportes) saltea inactivos/suspendidos.

### 3. Forms de socio en frontend

**Archivo**: `apps/web/src/routes/socios.tsx` — ruta `/socios` (registrada en `apps/web/src/main.tsx`, nav en `apps/web/src/routes/__root.tsx`).

- **El form NO tiene select de estado ni campo estado**. El zod schema `socioSchema` (líneas 7-20) no incluye `estado` — al crear, la DB lo setea en `'activo'`; al editar, `socioSchema.parse(socio)` lo descarta y el PUT nunca lo envía (el estado se preserva en DB).
- La tabla muestra `estado` como badge: verde si `'activo'`, **rojo para cualquier otro valor** (suspendido también se ve rojo).
- Baja desde UI: botón "Desactivar" **solo visible cuando `estado === 'activo'`** → `confirm()` → `deleteSocio(id)` (soft delete a `inactivo`).
- Form: React Hook Form + zodResolver, modal único crear/editar (`openCreate`/`openEdit`), 15 campos de texto/número/fecha.
- Store: `apps/web/src/stores/app.store.ts` — `fetchSocios(search?)`, `createSocio`, `updateSocio` (PUT), `deleteSocio` (DELETE). `request()` wrapper con `ApiError`.

### 4. Sección Configuración

**Archivo**: `apps/web/src/routes/config.tsx` — ruta `/config`, nav label "Config".

Estructura actual (2 tarjetas):
1. **Form OTB** (`configSchema`): `nombreOTB`, `gestionActual`, `aporteMensualBase`, `diasGraciaAporte`, `toleranciaMinutos` → `updateConfig` (PUT `/api/config`, JSON plano en tabla `modules_config` fila `otb-core`; `packages/api/src/routes/config.ts`).
2. **Tipos de Actividad** — CRUD configurable completo (ver punto 6).

**SÍ existe CRUD configurable como patrón: activity-types.**

### 5. Referencias a grupos / manzana / cuadra / unidad vecinal / zona

**No existe NADA** de grupos/manzana/cuadra/unidad vecinal en schema, API ni frontend. Única coincidencia: la palabra "Zona" aparece dentro de strings de `direccion` en seed (`packages/db/src/seed.ts` líneas 87, 92, 98) — es texto libre, no estructura.

- La carpeta `openspec/changes/estados-grupos-socios/` ya existe y está **vacía** (cambio nombrado, sin artefactos).
- Contexto de dominio en `PROJECT_KNOWLEDGE.md` (OTB boliviana): menciona el sistema de módulos EAV (`custom_field_definitions` / `custom_field_values` en `packages/db/src/schema/config.ts`) como extensibilidad futura — pero el patrón REALMENTE implementado y usado es `tipos_actividad`.

### 6. Patrón activity-types (CRUD configurable) — punta a punta

- **Schema**: `packages/db/src/schema/tipos-actividad.ts` — tabla `tipos_actividad`: `id` (text PK), `nombre` (text notNull), `opciones` (text **JSON string** notNull), `multas` (text JSON nullable), `tolerancia` (integer default 0). Migrada en `0000_blushing_calypso.sql`. Tipo TS en `packages/core/src/index.ts` (`TipoActividad`).
- **API**: `packages/api/src/routes/tipos-actividad.ts` (`/api/tipos-actividad`):
  - `GET /` → lista completa.
  - `POST /` → valida `nombre`; `JSON.stringify` de `opciones`/`multas`; **responde la lista completa** (201).
  - `PUT /:id` → 404 si no existe; update parcial con spreads condicionales (`body.x !== undefined`); **responde la lista completa**.
  - `DELETE /:id` → 404 si no existe; **409** si hay `actividades` que referencien el id (referential guard); **responde la lista completa**.
- **Store**: `apps/web/src/stores/app.store.ts` — `tiposActividad` en estado; `addTipoActividad`/`updateTipoActividad`/`removeTipoActividad` reemplazan toda la lista con la respuesta del server. `fetchConfig` carga `config` + `tiposActividad` en `Promise.all`.
- **Frontend**: `apps/web/src/routes/config.tsx` — lista con botones Editar/Eliminar (confirm), form inline de alta (nombre + tolerancia), modal de edición con checkboxes de opciones + inputs de monto de multa por opción, helpers de parseo JSON (try/catch).
- **Spec documentada**: `openspec/specs/activity-types/spec.md` (escenarios Given/When/Then, validaciones, error states).
- **Patrón de seed**: `seed.ts` inserta 4 tipos con opciones/multas JSON.

## Áreas Afectadas

- `packages/db/src/schema/socios.ts` — enum de estado (¿renombrar `inactivo` → `dado de baja`?) y/o nueva tabla de estados configurables; campo de grupos.
- `packages/db/src/schema/grupos.ts` (nuevo) — tabla `grupos` + tabla asociativa `socio_grupos` (0..N = muchos-a-muchos).
- `packages/db/drizzle/` — nueva migración (drizzle-kit generate).
- `packages/core/src/index.ts` — tipos `Socio` (estado, grupoIds), `Grupo`, `EstadoSocio` si aplica.
- `packages/api/src/routes/socios.ts` — validación de estado en POST/PUT; posible endpoint de transición de estado; joins/grupos en GET.
- `packages/api/src/routes/grupos.ts` (nuevo) — CRUD clon de tipos-actividad; guard de borrado (socios asociados → 409).
- `packages/api/src/index.ts` — montar `/api/grupos`.
- `packages/api/src/routes/dashboard.ts` — si cambia el nombre de un estado (`inactivo`→`dado de baja`), ajustar `eq(socios.estado, 'activo')` y conteos.
- `apps/web/src/routes/socios.tsx` — select de estado en `socioSchema` + form; badge por estado; multi-select de grupos; flujo de alta/baja explícito.
- `apps/web/src/routes/config.tsx` — sección CRUD de Grupos (clon del bloque Tipos de Actividad).
- `apps/web/src/stores/app.store.ts` — acciones de grupos; manejo de estado en socio.
- `packages/db/src/seed.ts` — nuevos estados/grupos de ejemplo.
- `openspec/specs/` — nuevas capabilities `socios-estados` y `grupos` (o una sola).

## Enfoques

1. **Estados: tabla de estados configurables + FK en socio** (`estados` con `id, nombre, es_activo`; `socios.estado_id` referencia)
   - Pros: ciclo de vida 100% configurable desde Config; el form del socio muestra estados existentes; consistente con la filosofía "configurable" del pedido.
   - Cons: migración de datos (mapear `activo/inactivo/suspendido` → filas de estados); toca dashboard/reportes que filtran por `estado='activo'` (necesita flag `es_activo`); más complejidad que el enum.
   - Esfuerzo: Alto.

2. **Estados: mantener enum Drizzle pero ampliarlo a `['activo','suspendido','dado_de_baja']` y configurable vía tabla de catálogo en Config** (catálogo `estados` que define el orden/etiquetas visibles, y el socio referencia un estado del catálogo)
   - Pros: cubre el wording "dado de baja" con migración simple (renombrar `inactivo`); select en form del socio; catálogo editable.
   - Cons: requiere igualmente coordinar dashboard (filtra `activo`).
   - Esfuerzo: Medio.

3. **Estados: solo UX — select fijo de 3 valores en el form (sin config)**
   - Pros: mínimo esfuerzo.
   - Cons: NO cumple "configurable" del requerimiento. Descartar.
   - Esfuerzo: Bajo.

4. **Grupos: tabla `grupos` + tabla asociativa `socio_grupos` (0..N), CRUD clonado de tipos-actividad**
   - Pros: patrón ya probado en el repo (schema→API→store→UI, JSON en API, lista completa como respuesta); cumple 0..N (un socio en N grupos, un grupo con N socios); guard de borrado 409 idéntico al existente.
   - Cons: ninguno relevante; es el camino natural.
   - Esfuerzo: Medio.

## Recomendación

- **Grupos**: Enfoque 4 — clonar el patrón activity-types (`grupos` + `socio_grupos`), CRUD en Config, multi-select en el form del socio, guard 409 al borrar grupo con socios.
- **Estados**: Enfoque 2 como base (renombrar el enum a `activo | suspendido | dado_de_baja`, ajustar seed/dashboard) y exponer el select de estado en el form del socio. Si el requerimiento exige crear/dar de baja estados nuevos desde Config sin tocar código, escalar a Enfoque 1 (tabla de estados + flag `es_activo`). Decisión a tomar en la propuesta: **¿baja = borrado lógico único (`dado_de_baja`) o ciclo configurable completo?** El wording del pedido ("activo/suspendido/dado de baja configurable desde el form del socio") sugiere estados fijos pero **elegibles** desde el form — Enfoque 2 con catálogo es el punto dulce.

## Riesgos

- El enum actual `inactivo` se usa en dashboard, seed y UI; renombrar a `dado_de_baja` rompe queries de `dashboard.ts` si no se actualizan juntas.
- `DELETE /api/socios/:id` hoy es el único mecanismo de baja y fuerza `inactivo`; si se agrega estado configurable hay que decidir si DELETE sigue mapeando a un estado por defecto o se elimina el soft-delete.
- Los archivos `apps/desktop` y `apps/mobile` son stubs (placeholder) — solo `apps/web` es frontend real; no duplicar trabajo ahí.
- No existe NINGÚN test en el repo (no hay *.test.ts/*.spec.ts); la verificación será typecheck/build manual.
- La DB SQLite no tiene CHECK en `estado` — migrar requiere limpiar valores existentes si se renombra.

## Listo para Propuesta

Sí. Material suficiente: schema actual completo, endpoints, patrón activity-types punta a punta, y carpetas openspec del cambio ya creada (`openspec/changes/estados-grupos-socios/`). Indicar al usuario que decida: (a) estados fijos renombrados vs. catálogo totalmente configurable, y (b) si la asociación 0..N es muchos-a-muchos (recomendado) o un grupo primario + grupos adicionales.
