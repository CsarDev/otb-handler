# Design: Estados de Socios Configurables + Grupos (estados-grupos-socios)

## Contexto / Decisiones clave

Hoy `socios.estado` es un enum Drizzle hardcodeado (`activo|inactivo|suspendido`), el DELETE fuerza `inactivo` y el dashboard cuenta `estado='activo'` por string. Este cambio reemplaza el enum por un catálogo configurable (`estados_socio`) donde **cada estado define qué acciones permite el socio** vía M:N (`estado_acciones` ↔ `acciones_socio`), agrega grupos (1 primario + N adicionales) con filtros en toda la app, y hace explícita la baja con motivo. Patrón a clonar en cada capa: **activity-types** (schema → API CRUD con lista completa como respuesta → store full-list replace → card en Config).

| Decisión | Opción | Decisión |
|----------|--------|----------|
| Flags booleanos | `integer { mode:'boolean' }` vs `integer` 0/1 | **`integer` plano 0/1** — portable SQLite/Postgres, precedente en `movimientos.anulado` |
| M:N permisos | columna JSON en estado vs tabla `estado_acciones` | **Tabla M:N** — consultable, PK compuesta, respeta el patrón relacional del repo |
| Grupo primario | `(socio_id, es_primario)` único vs columna `grupoPrimarioId` | **Columna FK (Option B)** — query trivial, sin índice parcial, portable |
| Drop de `estado` | recrear tabla (drizzle-kit) vs `DROP COLUMN` | **`ALTER TABLE ... DROP COLUMN` manual, AL FINAL** — SQLite 3.49.2 lo soporta; la recreación rompe FKs externas con `foreign_keys=ON` |
| Resolución de permisos | 1 query por socio vs mapa batch | **Mapa `estadoId → Set<clave>` cargado 1 vez por request** — evita N+1 |
| Helper `socioPermite` | en `packages/core` vs en `api/lib` | **Predicado puro en `core` + loader batch en `packages/api/src/lib/permisos.ts`** — el loader requiere `db` (causaría ciclo `db→core→db`) |

Semillas (decisiones PO, inmutables): 4 estados — `activo` (#22c55e, todas las acciones, esActivo+esDefecto), `suspendido` (#f59e0b, solo `reportes`), `inactivo` (#9ca3af, ninguna, esBaja=0, fila propia para backfill legacy), `dado_de_baja` (#ef4444, ninguna, esBaja=1). 7 acciones con claves estables: `asistencia, aportes, pagos, multas, anulaciones, reportes, dashboard`.

## Modelo de datos (código Drizzle)

Nuevos archivos en `packages/db/src/schema/` (patrón del repo: `sqliteTable`, `text` PK, `integer` 0/1, `.references()`):

```ts
// estados-socio.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const estadosSocio = sqliteTable('estados_socio', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  color: text('color').notNull().default('#22c55e'),   // hex usado en badges/filtros
  esActivo: integer('es_activo').notNull().default(0), // 0|1
  esBaja: integer('es_baja').notNull().default(0),     // 0|1
  esDefecto: integer('es_defecto').notNull().default(0), // 0|1
  orden: integer('orden').notNull().default(0),
});
```

```ts
// acciones-socio.ts
export const accionesSocio = sqliteTable('acciones_socio', {
  id: text('id').primaryKey(),
  clave: text('clave').notNull().unique(),   // slug estable: 'asistencia', 'pagos'...
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
  orden: integer('orden').notNull().default(0),
});
```

```ts
// estado-acciones.ts
import { sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';
import { estadosSocio } from './estados-socio';
import { accionesSocio } from './acciones-socio';

export const estadoAcciones = sqliteTable('estado_acciones', {
  estadoId: text('estado_id').notNull().references(() => estadosSocio.id),
  accionId: text('accion_id').notNull().references(() => accionesSocio.id),
}, (t) => ({ pk: primaryKey({ columns: [t.estadoId, t.accionId] }) }));
```

```ts
// grupos.ts
export const grupos = sqliteTable('grupos', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
});
```

```ts
// socio-grupos.ts
import { socios } from './socios';
import { grupos } from './grupos';

export const socioGrupos = sqliteTable('socio_grupos', {
  socioId: text('socio_id').notNull().references(() => socios.id),
  grupoId: text('grupo_id').notNull().references(() => grupos.id),
}, (t) => ({ pk: primaryKey({ columns: [t.socioId, t.grupoId] }) }));
```

`packages/db/src/schema/socios.ts` — reemplaza el enum, agrega columnas (nulas: `ALTER ADD COLUMN` en SQLite no admite NOT NULL sin default; la API garantiza `estadoId`):

```ts
import { sqliteTable, text, real } from 'drizzle-orm/sqlite-core';
import { estadosSocio } from './estados-socio';
import { grupos } from './grupos';

export const socios = sqliteTable('socios', {
  id: text('id').primaryKey(),
  // ...campos existentes sin cambios (nombre, apellidos, ci, telefono, email,
  // ocupacion, direccion, fechaNac/Ing/Alta, aporteBase)...
  // - estado: text('estado', { enum: [...] }) ← ELIMINADO
  estadoId: text('estado_id').references(() => estadosSocio.id),
  grupoPrimarioId: text('grupo_primario_id').references(() => grupos.id),
  motivoBaja: text('motivo_baja'),
  fechaBaja: text('fecha_baja'),
});
```

Re-exportar en `packages/db/src/schema.ts`: `./estados-socio`, `./acciones-socio`, `./estado-acciones`, `./grupos`, `./socio-grupos`.

Tipos en `packages/core/src/index.ts`:

```ts
export type EstadoSocio = { id: string; nombre: string; color: string;
  esActivo: number; esBaja: number; esDefecto: number; orden: number;
  accionIds: string[] };                          // M:N aplanada en la respuesta
export type AccionSocio = { id: string; clave: string; nombre: string;
  descripcion: string | null; orden: number };
export type Grupo = { id: string; nombre: string; descripcion: string | null };
export type Socio = {
  // ...campos existentes...
  // estado: 'activo' | 'inactivo' | 'suspendido' ← ELIMINADO
  estadoId: string | null; estadoNombre: string | null; estadoColor: string | null;
  esActivo: number;                                 // vía join, solo en respuestas
  grupoPrimarioId: string | null;
  grupos: { id: string; nombre: string }[];         // adicionales, en respuestas
  motivoBaja: string | null; fechaBaja: string | null;
};
export type SocioInput = Omit<Socio, 'estadoNombre' | 'estadoColor' | 'esActivo' | 'grupos'> &
  { grupoAdicionalIds?: string[] };                 // payload de POST/PUT
```

## Migración

Estrategia (drizzle-kit + SQL manual; SQLite 3.49.2 soporta `DROP COLUMN`). El catálogo vive en un módulo TS compartido `packages/db/src/catalogo.ts` (7 acciones + 4 estados + M:N con **UUIDs fijos constantes**); seed.ts y el SQL de la migración usan los mismos IDs.

1. **`catalogo.ts`** (nuevo): arrays `ACCIONES_CATALOGO`, `ESTADOS_CATALOGO`, `ESTADO_ACCIONES_CATALOGO` con ids hardcodeados (ej. `est-activo`, `acc-asistencia`… o UUIDs constantes) + helper `idEstadoPorNombre(nombre)`.
2. Actualizar schema (tablas nuevas + columnas en `socios`, **manteniendo `estado` todavía**). `pnpm --filter @otb/db db:generate` → migración `0003`: `CREATE TABLE` ×5 + `ALTER TABLE socios ADD estado_id / grupo_primario_id / motivo_baja / fecha_baja`.
3. **Editar `0003` a mano** — insertar el seed del catálogo y el backfill entre el ALTER y el cierre (mismo estilo del backfill manual en `0001_material_ravenous.sql`):

```sql
INSERT INTO `acciones_socio` (id, clave, nombre, descripcion, orden) VALUES
  ('acc-asistencia', 'asistencia', 'Asistencia', NULL, 1),
  ('acc-aportes', 'aportes', 'Aportes', NULL, 2),
  ('acc-pagos', 'pagos', 'Pagos', NULL, 3),
  ('acc-multas', 'multas', 'Multas', NULL, 4),
  ('acc-anulaciones', 'anulaciones', 'Anulaciones', NULL, 5),
  ('acc-reportes', 'reportes', 'Reportes', NULL, 6),
  ('acc-dashboard', 'dashboard', 'Dashboard', NULL, 7);--> statement-breakpoint
INSERT INTO `estados_socio` (id, nombre, color, es_activo, es_baja, es_defecto, orden) VALUES
  ('est-activo', 'activo', '#22c55e', 1, 0, 1, 1),
  ('est-suspendido', 'suspendido', '#f59e0b', 0, 0, 0, 2),
  ('est-inactivo', 'inactivo', '#9ca3af', 0, 0, 0, 3),
  ('est-baja', 'dado_de_baja', '#ef4444', 0, 1, 0, 4);--> statement-breakpoint
INSERT INTO `estado_acciones` (estado_id, accion_id) SELECT 'est-activo', id FROM `acciones_socio`;--> statement-breakpoint
INSERT INTO `estado_acciones` (estado_id, accion_id) VALUES ('est-suspendido', 'acc-reportes');--> statement-breakpoint
-- Backfill por mapeo de nombres (valores limpios: sin CHECK en SQL)
UPDATE `socios` SET `estado_id` = 'est-activo'     WHERE `estado` = 'activo';--> statement-breakpoint
UPDATE `socios` SET `estado_id` = 'est-suspendido' WHERE `estado` = 'suspendido';--> statement-breakpoint
UPDATE `socios` SET `estado_id` = 'est-inactivo'   WHERE `estado` = 'inactivo';
```

4. Quitar `estado` del schema (`socios.ts`) y del seed. `pnpm db:generate` → migración `0004`: drizzle-kit emitirá recreación de tabla; **reemplazarla por** `ALTER TABLE `socios` DROP COLUMN `estado`;` (el snapshot queda igual porque refleja el schema final). Este paso es el ÚNICO irreversible — va al final.
5. Actualizar `seed.ts`: agregar tablas nuevas a la lista de DELETE; insertar catálogo desde `catalogo.ts`; `sociosData` reemplaza `estado: 'activo'` por `estadoId: idEstadoPorNombre('activo')`; generación de asistencia/aportes filtra por `esActivo` (vía mapa) en vez de `s.estado`; agregar 2–3 grupos de ejemplo + `grupoPrimarioId`/`socio_grupos` para algunos socios.
6. Rollback: migración aditiva (catálogo + backfill) reversible regenerando la DB desde seed; el drop de `estado` se revierte restaurando el schema desde git.

## Helpers / Lógica compartida

**`packages/core/src/index.ts`** — predicado puro (sin DB, testeable):

```ts
export function socioPermite(
  clavesPermitidas: ReadonlySet<string>,  // Set<clave> del estado del socio
  accionClave: string,
): boolean {
  return clavesPermitidas.has(accionClave);
}
```

**`packages/api/src/lib/permisos.ts`** (nuevo) — lado DB, evita N+1 cargando el M:N **1 sola vez por request** y resolviendo por `estadoId`:

```ts
import { db, schema } from '@otb/db';

export type MapaPermisos = Map<string, Set<string>>; // estadoId → Set<clave>

export function cargarPermisosPorEstado(): MapaPermisos {
  const filas = db.select({
    estadoId: schema.estadoAcciones.estadoId,
    clave: schema.accionesSocio.clave,
  }).from(schema.estadoAcciones)
    .innerJoin(schema.accionesSocio, eq(schema.estadoAcciones.accionId, schema.accionesSocio.id))
    .all();
  const mapa: MapaPermisos = new Map();
  for (const f of filas) {
    if (!mapa.has(f.estadoId)) mapa.set(f.estadoId, new Set());
    mapa.get(f.estadoId)!.add(f.clave);
  }
  return mapa;
}

export function permite(mapa: MapaPermisos, estadoId: string | null, accionClave: string): boolean {
  return estadoId ? (mapa.get(estadoId)?.has(accionClave) ?? false) : false;
}
export const ERROR_PERMISO = { error: 'El socio no puede realizar esta acción en su estado actual' };
```

**Consumo en rutas** (solo rutas que tocan un socio):
- **Single** (pagar/anular/editar/resumen-socio/asistencia PUT): cargar el socio con `estadoId`, `if (!permite(mapa, socio.estadoId, clave)) return c.json(ERROR_PERMISO, 409)` antes de la operación.
- **Bulk** (aportes/multas): `const permisos = cargarPermisosPorEstado()`; filtrar `socioIds` por `permite`; si el resultado queda vacío → `400`; insertar solo los permitidos.
- **Listas** (asistencia selector, reportes selector): el front filtra con el helper del store (abajo), la API solo filtra por `estadoId`/`grupoId` query.

## API

Montar en `packages/api/src/index.ts`: `api.route('/api/estados-socio', estadosSocioRouter)`, `'/api/acciones-socio'`, `'/api/grupos'`.

**Rutas nuevas — clon de tipos-actividad** (respuestas SIEMPRE lista completa; `accionIds` del estado resuelto con una query agrupada por `estadoId`):

| Ruta | Notas |
|------|-------|
| `GET /api/estados-socio` | Lista con `accionIds: string[]` aplanado; orden por `orden` |
| `POST /api/estados-socio` | Valida `nombre` (400), `color` regex hex (`/^#[0-9a-fA-F]{6}$/` → 400 `"color must be a valid hex value"`), flags 0/1; **`accionIds` opcional, default = todos**; `orden` = max+1; esDefecto/esBaja únicos (400) |
| `PUT /api/estados-socio/:id` | 404 si no existe; update parcial por spreads; revalida unicidad de esDefecto/esBaja (400); no toca `socios.estadoId` |
| `DELETE /api/estados-socio/:id` | 409 si `socios` lo referencian; 404 si no existe |
| `PUT /api/estados-socio/:id/acciones` | Body `{ accionIds }`; valida que existan (400); **reemplazo atómico en tx** (delete+insert) |
| `GET/POST/PUT/DELETE /api/acciones-socio` | POST valida `clave` no vacío; **clave duplicada → 409**; DELETE → 409 si `estado_acciones` la referencia |
| `GET/POST/PUT/DELETE /api/grupos` | Clon de tipos-actividad; DELETE → 409 si hay `socios.grupoPrimarioId` o fila en `socio_grupos` |

**`socios.ts` modificado:**
- `GET /` — filtros `search`, `estadoId`, `grupoId` (combinables). `grupoId` = `or(eq(socios.grupoPrimarioId, gid), inArray(socios.id, subquery socio_grupos por gid))` (subquery evita multiplicación de filas del join). Respuesta por socio con join a estado: `{ ...campos, estadoId, estadoNombre, estadoColor, esActivo, grupoPrimarioId, grupos: [{id, nombre}] }` — grupos adicionales con 1 query batch agrupada por `socioId`, adjuntada en memoria (sin N+1).
- `POST /` — valida `estadoId` (existe → 400 `"estadoId is invalid"`; ausente → esDefecto; sin esDefecto → 400), `grupoPrimarioId`/`grupoAdicionalIds` (existen, invariante primario∉adicionales → 400); **tx**: insert socio + insert `socio_grupos`.
- `PUT /:id` — mismas validaciones + reemplazo atómico de `socio_grupos` en tx (delete + insert; conserva `grupoPrimarioId` si no se envía).
- `POST /:id/baja` — `motivo` requerido (400 `"motivo is required"`); 404 socio; estado con `esBaja=1` (400 si no hay configurado); 400 si ya está en ese estado; set `{ estadoId: esBaja.id, motivoBaja, fechaBaja: hoy ISO }`; responde el socio.
- `DELETE /:id` — soft delete: 404 si no existe; busca estado `esBaja=1` (400 si no hay); set `estadoId` SOLO (`motivoBaja` queda null); 204.
- `GET /:id` — mismo shape enriquecido que `GET /`.

**Enforcement por acción — puntos exactos:**

| Ruta | Endpoint | Acción (`clave`) |
|------|----------|------------------|
| `aportes.ts` | `POST /`, `PUT /:id`, `POST /bulk` | `aportes` |
| `aportes.ts` | `POST /:id/pagar` | `pagos` |
| `aportes.ts` | `POST /:id/anular` | `anulaciones` |
| `multas.ts` | `POST /`, `PUT /:id`, `POST /bulk` | `multas` |
| `multas.ts` | `POST /:id/pagar` | `pagos` |
| `multas.ts` | `POST /:id/anular` | `anulaciones` |
| `asistencia.ts` | `POST /` (batch atómico: si ALGUNO no permite → 409 sin insertar), `PUT /:id` | `asistencia` |
| `reportes.ts` | `GET /resumen-socio/:id` | `reportes` (409) |

**Filtros estado/grupo en listas:** `GET /asistencia/actividad/:actividadId` (join `socios` + subquery `socio_grupos`), `GET /aportes`, `GET /multas` (mismo join, combinable con filtros existentes), `GET /reportes/libro-diario` (join `movimientos→socios`).

**`dashboard.ts`:** `totalSocios` y `morosos` pasan de `eq(socios.estado, 'activo')` a join con `estados_socio` + `eq(estadosSocio.esActivo, 1)` (reemplaza al string; la clave `dashboard` existe en el catálogo pero la decisión PO fija el conteo por `es_activo`).

**Shape GET /socios (contrato):**

```json
{ "id": "uuid", "nombre": "Juan", "apellidoPaterno": "Mamani",
  "estadoId": "est-activo", "estadoNombre": "activo", "estadoColor": "#22c55e",
  "esActivo": 1, "grupoPrimarioId": "g1",
  "grupos": [ { "id": "g2", "nombre": "Manzano B" } ],
  "motivoBaja": null, "fechaBaja": null }
```

## Store

`apps/web/src/stores/app.store.ts` — patrón full-list replace (como `addTipoActividad`):

- **Estado nuevo:** `estadosSocio: EstadoSocio[]`, `accionesSocio: AccionSocio[]`, `grupos: Grupo[]`.
- **Acciones:** `addEstadoSocio` / `updateEstadoSocio` / `removeEstadoSocio` / `setEstadoAcciones(id, accionIds)` — todas POST/PUT/DELETE y reemplazan la lista con la respuesta del server. Ídem para acciones y grupos (`addAccionSocio`, `removeAccionSocio`, `addGrupo`, `updateGrupo`, `removeGrupo`).
- **`fetchConfig`:** extiende el `Promise.all` a 5 endpoints (`/config`, `/tipos-actividad`, `/estados-socio`, `/acciones-socio`, `/grupos`), cada uno con `.catch` defensivo.
- **Socio:** `createSocio`/`updateSocio` ya tipan `Partial<SocioInput>` (reciben `estadoId`, `grupoPrimarioId`, `grupoAdicionalIds`); nueva `bajaSocio(id, motivo)` → `POST /socios/:id/baja` y reemplaza el socio en la lista.
- **Filtros:** `AporteFilters`/`MultaFilters` ganan `estadoId?`/`grupoId?`; `fetchSocios(search, estadoId?, grupoId?)`; `fetchAsistencia(actividadId, estadoId?, grupoId?)`; `fetchLibroDiario`/`fetchResumenSocio` ganan `estadoId?`/`grupoId?`.
- **Derivado UI (evita N+1):** helper en `apps/web/src/lib/permisos.ts`:
  ```ts
  export function socioPermiteUI(
    estadosSocio: EstadoSocio[], accionesSocio: AccionSocio[],
    estadoId: string | null, accionClave: string,
  ): boolean {
    const estado = estadosSocio.find((e) => e.id === estadoId);
    if (!estado) return false;
    const claves = new Set(accionesSocio.filter((a) => estado.accionIds.includes(a.id)).map((a) => a.clave));
    return claves.has(accionClave);
  }
  ```
  Reutilizado por asistencia (selector), reportes (selector), listas (deshabilitar/ocultar).

## UI

`config.tsx` — misma estructura de cards que "Tipos de Actividad" (Card + filas + form inline + modal). Tres cards nuevas:

1. **Estados de Socio** — fila por estado: dot de `color` + nombre + badges `esActivo`/`esDefecto`/`esBaja` + **toggles inline**: un `switch` por estado×acción (grid con wrap, `role="switch"`, `aria-checked`), que al cambiar hace `setEstadoAcciones(estadoId, accionIdsConmutados)` (instantáneo, botón "Guardando…" deshabilitado mientras). Form crear/editar: input `type="color"` + checkboxes de acciones **pre-marcadas todas** + checkboxes de flags. Editar/Eliminar (409 amigable si tiene socios).
2. **Acciones** — lista (clave + nombre) + form inline `clave`/`nombre`; clave duplicada → warning (409 del server).
3. **Grupos** — clon literal del bloque Tipos de Actividad (`nombre` + `descripcion` opcional).

`socios.tsx` — `socioSchema` agrega `estadoId`, `grupoPrimarioId`, `grupoAdicionalIds`; form: select de estado con dot de color (fila `● nombre`), select primario + multi-select de adicionales con chips `×` (wrap); tabla: badge de estado con `style={{ backgroundColor: estadoColor }}` (clases dinámicas Tailwind no funcionan con hex), chips de grupos, **selects de filtro estado + grupo**; "Dar de baja" → modal con textarea `motivo` requerido → `bajaSocio`; fila en baja muestra motivo/fecha; ficha (modal/expansión) muestra badge + chips + motivo de baja.

`asistencia.tsx` / `aportes.tsx` / `multas.tsx` / `reportes.tsx` — filtros estado/grupo; selectores de socio filtrados con `socioPermiteUI(s, 'asistencia'|'reportes')` (ocultar o `disabled`); reportes: resumen-socio oculta socios sin `reportes`.

**Responsive ~360px:** `flex-wrap` en chips/badges/toggles; grids `grid-cols-3` → `grid-cols-1` (`sm:` breakpoint); tablas con `overflow-x-auto` existentes se reemplazan por cards apiladas en `sm:` (fila → card con label), modal con `max-w-lg` ya adaptado.

**Componentes:** las rutas actuales usan Tailwind inline (no consumen `@otb/ui`); se sigue ese patrón. `@otb/ui` ya tiene `Button/Card/Input/cn` (estilo shadcn) disponibles; se agregan ahí, siguiendo `cva`, `Switch` (radix-free, `<button role="switch">`) y `Badge` (pill con hex inline) si se reutilizan en ≥3 páginas.

## Orden de implementación

| Slice | Alcance | Toques |
|-------|---------|--------|
| 1. Schema + catálogo + migración | `catalogo.ts`, 5 schemas nuevos, `socios.ts`, `schema.ts`, migraciones 0003/0004, `seed.ts`, `package.json` (db:reset ya cubre) | DDL + backfill + drop AL FINAL |
| 2. Core types | `packages/core/src/index.ts` | `EstadoSocio/AccionSocio/Grupo`, `Socio` reescrito, `SocioInput`, `socioPermite` puro |
| 3. API | `lib/permisos.ts`, `routes/estados-socio.ts`, `acciones-socio.ts`, `grupos.ts`, `socios.ts`, `aportes.ts`, `multas.ts`, `asistencia.ts`, `reportes.ts`, `dashboard.ts`, `index.ts` | CRUD clones + enforcement + filtros + baja |
| 4. Store | `app.store.ts`, `lib/permisos.ts` (web) | Estado/acciones, `fetchConfig` ampliado, `bajaSocio`, filtros, derivado |
| 5. UI | `config.tsx`, `socios.tsx`, `asistencia.tsx`, `aportes.tsx`, `multas.tsx`, `reportes.tsx`, `@otb/ui` (Switch/Badge) | 3 cards, form socio, badges/chips, filtros, responsive |

Verificación por slice: `pnpm typecheck` y `pnpm --filter @otb/db build`/`pnpm --filter @otb/web build` (no hay tests en el repo). El dashboard debe arrojar los MISMO totales tras la migración.

## Riesgos técnicos

| Riesgo | Prob. | Mitigación |
|--------|-------|------------|
| Drop de `estado` rompe consumidores (dashboard, seed, UI) | Media | Todos los consumidores se migran en el mismo cambio; `es_activo` preserva semántica; drop va al final |
| `db:generate` emite recreación de tabla para el drop → falla con FKs ON | Media | Reemplazar por `ALTER TABLE ... DROP COLUMN` (SQLite 3.49.2 ✓); rollback = restaurar schema desde git |
| N+1 en resolución de permisos / grupos en listas | Media | `cargarPermisosPorEstado()` y `gruposPorSocio` batch (1 query + mapa en memoria) |
| Invariante primario ∈ adicionales | Media | Validación API en POST/PUT + guard 409 en borrado de grupo |
| Unicidad esDefecto/esBaja | Baja | Validación en POST/PUT de estados (400) |
| Clave de acción duplicada rompe enforcement | Baja | `unique()` en `clave` + seed con slugs estables |
| Estados sin acción permitida para una clave | Baja | Seed garantiza `activo` con todas; warning en Config |
| Sin tests en el repo (verificación = typecheck/build) | Media | Regresión de dashboard cubierta por escenario "conteos idénticos tras migración" verificado manualmente |

## Threat Matrix

N/A — el cambio no introduce routing de shell/subprocesos, automatización VCS/PR, ni fronteras de integración de procesos.

## Open Questions

- [ ] ¿`PUT /api/estados-socio/:id` debe permitir cambiar `esBaja`/`esDefecto` (unicidad) o solo nombre/color/orden? El spec exige la validación de unicidad — se implementa con 400.
- [ ] Ficha de socio: ¿modal dedicado o expansión inline? (decisión menor de UX, sin impacto técnico)

## Decisiones PO registradas (post-diseño)

- `PUT /api/estados-socio/:id` edita TODO (nombre, color, orden, esActivo, esBaja, esDefecto, acciones) con validación de unicidad (un solo esDefecto/esBaja → 400).
- Ficha de socio: modal/drawer dedicado (mobile-first), con datos + badge de estado + chips de grupos.
