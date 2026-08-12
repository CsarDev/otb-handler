# Design: Aportes as Dynamic Definitions with Many-to-Many Socio Assignment

## Technical Approach

Rework the just-implemented catalog+FK model (`tipos_aporte` + `socios.tipo_aporte_id`, 8 commits) into the **corrected authoritative model**: the aporte IS the dynamic definition. `aportes_definicion` replaces `tipos_aporte` and carries the recurring configuration (`id`, `nombre`, `monto`, `recurrencia`, `inicio`/`fin`, `modalidadPago`, optional `aplicaGrupoId` FK, `activo`). Socio↔aporte assignment becomes many-to-many via a new join `socio_aportes` (clone of `socio_grupos`). Group application is **dynamic at read/generation time** — never materialized. Monthly records (`aportes` = APORTE_REGISTRO / cobro) are generated **definition-driven**: `monto` and record count come from the definition (anual→12, mensual→N within the vigencia window, unico/extra→1); the manual `monto` override and the `monto`/`tipo` in the creation body disappear. `GET /api/aportes/:id/pagos` (pattern `multas`, excludes `anulado`) and enforcement via `cargarPermisosPorEstado`/`permite(...,'aportes')` are preserved. Definition CRUD UI lives in the Aportes section's **create tab** (`aportes.tsx`) — NOT in Config (user clarification). Maps to the reworked specs `aporte-definitions`, `payments`, `socios-estados`.

Overall strategy: **rename the concept first** (core + UI label "tipo de aporte" → "aporte" definition; records → cobro / APORTE_REGISTRO), then apply the **additive-then-drop** migration `0005` (new tables/columns + backfill, DROP of `tipo_aporte_id`/`aporte_base` only after), and update every consumer (seed, routes, store, forms, lists) in the SAME change so no stale `tipoAporteId`/`aporteBase` reference survives.

## Architecture Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| D1 | Definition table name | **`aportes_definicion`** (`packages/db/src/schema/aportes-definicion.ts`), core type **`Aporte`** | Keep `tipos_aporte` + add columns | Cements the product/model shift ("tipo" ≠ "aporte"). Avoids two meaning-laden table names coexisting; aligns with the user's corrected vocabulary. |
| D2 | Legacy columns on the record table `aportes` | **Keep `tipo` and `monto_base`**; add new `aporte_id` FK → `aportes_definicion.id`. `tipo` is written from the definition's `recurrencia` at generation time; `monto_base` is a **snapshot** of the definition's `monto` at generation time | Drop `tipo`, derive via join to the definition | `reportes.ts`/`dashboard.ts` and the UI filter by `tipo` and read `monto_base` — keeping both columns means zero rework there. The snapshot preserves each record's historical amount even if the definition's `monto` is later edited (immutability of financial records). `aporte_id` is added (nullable) for lineage and the DELETE guard. |
| D3 | Vigencia window representation | **TEXT `YYYY-MM-DD`** columns `inicio`/`fin`, nullable; when both set `fin` >= `inicio` enforced by the router. `mensual` N = count of months in `[inicio..fin] ∩ gestion-year` (JSON lower bound, end-of-month upper bound) | ISO `YYYY-MM` strings; gestion+mes int pair | The codebase already uses ISO text dates everywhere (e.g. `fechaNac`, `fechaPago`). A full date keeps the window month-granular for `mensual` while being human-readable; `unico`/`extraordinario`/`anual` ignore the window. |
| D4 | `modalidadPago` default | **`cuotas`** when omitted | `pago_unico` default; required field | The existing payments flow is partial-per-installment (`POST /api/aportes/:id/pagar`), which is the `cuotas` semantic. Optional with an enum: `cuotas \| parciales \| pago_unico`; generation is unopinionated about it for now (stored metadata). |
| D5 | Read-only inherited chips | Resolved **dynamically in the socio read shape** (`aportesInherited: Array<{ id, nombre, grupoId, grupoNombre }>`), distinct from editable `aporteIds`; a definition directly assigned to a socio is deduplicated out of `aportesInherited` | Materialize `socio_aportes` rows for group members on group change | Spec `aporte-definitions`/`socios-estados` explicitly forbid materialization (future members, removal stops inheritance). Dynamic resolution keeps a single source of truth (`aplicaGrupoId`) and no propagation step. |
| D6 | `recurrencia` DEFAULT on POST | **`mensual`** when omitted | Required enum on POST | Backward-friendly: the old record default `tipo='mensual'` and the seeded default definition is `mensual`. When provided it MUST be one of `mensual\|anual\|unico\|extraordinario`. |
| D7 | Definition `id` ownership | **Client-supplied slug** (e.g. `ap-mensual`) accepted on POST; **immutable** — PUT MUST ignore `id`; duplicate id → 400 | Server-generated UUID | The seed and spec use stable human slugs (`ap-mensual`) that both the API body and `aportes_definicion` PK reference. Catalog rows historically used UUIDs, but the corrected model's definitions are referenced by stable ids in `socio_aportes` and `aporte_id`, so a readable stable id is required. |
| D7b | Record type rename (naming) | core `Aporte` (today the record) renamed **`AporteRegistro`** (alias `Cobro`); the name **`Aporte`** is reused for the definition | Keep record as `Aporte`, name definition `AporteDefinicion` | The user's naming decision (e) is authoritative: definition = "aporte", records = cobro / APORTE_REGISTRO. Repackaging the record as `AporteRegistro` and giving `Aporte` to the definition makes the three-layer vocabulary (definition → record → movimiento) unambiguous across core/API/store/UI. |
| D8 | Generation record count | `anual` → exactly 12 (mes 1..12, ignores `mes`/window); `mensual` → N via `window ∩ gestion` (D3, optional `mes` as lower bound); `unico`/`extraordinario` → 1. Reuse the existing transactional `generarAportes(tx, ...)` bulk pattern; response `{ count, items }` | Duplicate logic; client-driven `meses` | Preserves the absorbed `ux-avanzado-otb` anual→12 fix and the single-transaction bulk pattern already in `routes/aportes.ts`; count now derives from the definition instead of the body. |
| D9 | Enforcement by estado | Reuse `cargarPermisosPorEstado()`/`permite(permisos, estadoId, 'aportes')` in single, `/bulk`, `/bulk/all` — **no hardcoded `estado='activo'`** | Hardcode `activo` | Matches the existing `/bulk` and `permisos.ts` helper; spec `payments` (MODIFIED) makes this the norm and removes the type-derived amount. Single create returns 409 `ERROR_PERMISO` when the estado denies `aportes`. |
| D10 | DELETE guard | **409** when the definition is referenced by `socio_aportes.aplicaGrupoId`-eligible assignments (i.e. any `socio_aportes` row) OR any `aportes.aporte_id` record | 400; allow cleanup | Standardizes on the `tipos-actividad`/`grupos` 409 pattern; spec `aporte-definitions` requires it and the friendly message `"No se puede eliminar: hay socios o registros usando este aporte"`. |
| D11 | Config `aporteMensualBase` | Keep deriving it from the **first active definition's `monto`** in `routes/config.ts` (legacy derived read, D2-style). `config.tsx` receives **NO** aporte CRUD (user clarification) | Reconfigure store/UI to drop the field | The `OTBConfig` type and header/dashboard still read `aporteMensualBase`; keeping it a derived read avoids a second breaking change. The Config UI simply stops hosting the definitions CRUD block (moved to `aportes.tsx`). |

## Data Flow

```
Definition CRUD (aportes.tsx crear tab)
  ─ POST/PUT/DELETE /api/aportes-definicion → aportes_definicion (definitions)
       DELETE → 409 if socio_aportes OR aportes.aporte_id reference it

Socio create/replace (socios.tsx, ONE OR MORE, active defs only)
  ─ POST/PUT /api/socios { aporteIds } → socios (…base fields)
       tx: insert socios + replace socio_aportes rows (pattern socio_grupos)
Socio read (GET /api/socios, /:id)
  ─ resolve direct aporteIds (socio_aportes) + dynamic aportesInherited
       (definitions whose aplicaGrupoId ∈ { primario, adicionales }, minus direct)

Record generation (aportes.tsx)                     [definition-driven]
  POST /api/aportes   { socioId, aporteId, gestion, mes? }
  POST /api/aportes/bulk     { socioIds, aporteIds, gestion, mes? }
  POST /api/aportes/bulk/all { aporteIds, gestion, mes? }
  → per (socio ∈ permitted-by-estado) × (definition ∈ holds(applied directly OR inherited)):
       monto = definition.monto (snapshot → monto_base)
       type  = definition.recurrencia (snapshot → tipo)
       count = anual→12 | mensual→window∩gestion | unico/extra→1
       insert aportes (tx) { ..., aporte_id = definition.id }
  Reject body.monto / body.tipo (400, no override)

Payment (aportes.tsx pagar tab)
  POST /api/aportes/:id/pagar → movimientos (ingreso) + update record
  GET  /api/aportes/:id/pagos → movimientos (referenciaId=id, tipo=ingreso, anulado=0)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/db/src/schema/aportes-definicion.ts` | Rename (was `tipos-aporte.ts`) | `aportes_definicion`: `id` (text PK slug), `nombre`, `monto` (real), `recurrencia` (text), `inicio`/`fin` (text), `modalidadPago` (text), `aplicaGrupoId` (text FK grupos nullable), `activo` (int default 1). Drops `monto_base`/`descripcion`. |
| `packages/db/src/schema/socio-aportes.ts` | Create | `socio_aportes` (`socioId` + `aporteId` composite PK, FKs) — clone of `socio-grupos.ts`. |
| `packages/db/src/schema/aportes.ts` | Modify | Add `aporteId` FK → `aportes_definicion.id` (nullable). Keep `tipo` + `monto_base` per D2. |
| `packages/db/src/schema/socios.ts` | Modify | Remove `tipoAporteId` and legacy `aporteBase` columns (drops in migration). |
| `packages/db/src/schema.ts` | Modify | Export `aportes-definicion` + `socio-aportes`; remove `tipos-aporte`. |
| `packages/db/src/catalogo.ts` | Modify | Replace `TIPOS_APORTE_CATALOGO` + `idTipoAportePorMonto` with `APORTES_DEFINICION_SEED` (4 default definitions) + `APORTE_ID_POR_TIPO` mapping (ta→ap). |
| `packages/db/src/seed.ts` | Modify | Seed definitions; insert `socio_aportes` from the old `tipoAporteId` per socio; generate records with `aporte_id`; NO `tipo_aporte_id`/`aporte_base` writes. |
| `packages/db/drizzle/0005_*.sql` | Create | Additive-then-drop: `aportes_definicion`, `socio_aportes`, `aportes.aporte_id` + seed/backfill, then DROP `socios.tipo_aporte_id`, `socios.aporte_base`, `tipos_aporte`. See Migration/Rollout. |
| `packages/core/src/index.ts` | Modify | `Aporte` (definition) + `AporteInput`; `SocioAporte` join; rename record `Aporte`→`AporteRegistro`; `Socio/SocioInput.aporteIds` + `aportesInherited`; remove `tipoAporteId`/`tipoAporteNombre`/`aporteBase`; `BulkAporteRequest` without `monto`/`tipo`, now `{ socioIds?, aporteIds, gestion, mes? }`. |
| `packages/api/src/routes/aportes-definicion.ts` | Rename (was `tipos-aporte.ts`) | Definition CRUD `GET/ POST/ PUT/:id/ DELETE/:id` on `/api/aportes-definicion`, full validation (D1, D6, D7, D10) + 409 guard. |
| `packages/api/src/routes/socios.ts` | Modify | `validarAporteIds` multiselect + atomic replace in `socio_aportes`; read shape: `aporteIds` + dynamic `aportesInherited`; drop `tipoAporteId`/`aporteBase` from shape; no default-type fallback. |
| `packages/api/src/routes/aportes.ts` | Modify | Definition-driven generation (D8): record monto/tipo/count from definition, applicability via direct+inherited, reject `monto`/`tipo` body, set `aporte_id`; keep `GET /:id/pagos`; enforcement via `permite(...,'aportes')` (D9). |
| `packages/api/src/lib/aportes.ts` | Rename/modify (was `lib/tipos-aporte.ts`) | `aporteDefPorId`, `mesesDefinicion(def, gestion, mes?)`, `aporteDefActivoDefault` (for config D11); applicability helper `socioHoldsAporte`. Remove `resolverMonto`/override logic. |
| `packages/api/src/routes/config.ts` | Modify | Derive `aporteMensualBase` from `aporteDefActivoDefault().monto` (D11). |
| `packages/api/src/index.ts` | Modify | Mount `/api/aportes-definicion`; remove `/api/tipos-aporte`. |
| `packages/api/test/helpers.ts` | Modify | `limpiarDatos` reseeds the 4 definitions + clears `socio_aportes`; `IDS` → definition slugs; `crearSocio` uses `aporteIds`. |
| `packages/api/test/aporte-definicion.test.ts` | Rename (was `tipos-aporte.test.ts`) | CRUD + validation + 409 guard on the new router/path. |
| `packages/api/test/socios-aportes.test.ts` | Rename (was `socios-tipo-aporte.test.ts`) | Multiselect POST/PUT, inheritance chips (primary/secondary/future/removal/dedup), shape without tipo/base. |
| `packages/api/test/aportes-generacion.test.ts` | Modify | Definition-driven single generation (window count, anual 12, unico, inherited, reject `monto`, inactive, outside-window, not-held). |
| `packages/api/test/aportes-bulk-all-pagos.test.ts` | Modify | Definition-driven bulk/bulk-all (per-def monto+count, estado exclusion, reject `monto`/`tipo`, no-eligible 400); `/pagos` preserved. |
| `apps/web/src/stores/app.store.ts` | Modify | `aportes: Aporte[]` (definitions) + `fetchAportes`(renamed `fetchAportesDef`)/`addAporte`/`updateAporte`/`removeAporte` loaded in `fetchConfig`; records array renamed `aporteRegistros`; `createAportesBulk`/`createAportesBulkAll` take new payload; `fetchPagosAporte` preserved; drop `tiposAporte`/`selectTiposAporteActivos`→`selectAportesActivos`. |
| `apps/web/src/routes/aportes.tsx` | Modify | "Crear" tab = definition list + form (monto, recurrencia, inicio/fin, modalidad, grupo opcional, activo) + bulk cobro-generation (pick defs/socios/gestion); "Pagar" tab = `aporteRegistros` cobro list + payments history. |
| `apps/web/src/routes/socios.tsx` | Modify | Replace single type select with multi-active-definition chips (→ `aporteIds`) + read-only `aportesInherited` chips with group legend; replace `Aporte Base` cells with direct/inherited chip summaries. |
| `apps/web/src/routes/config.tsx` | Modify | **REMOVE** the entire "Tipos de Aporte" CRUD block + handlers/state/forms (D11). Config keeps OTB/tiposActividad/estados/acciones/grupos. |

## Interfaces / Contracts

```ts
// ── packages/core/src/index.ts ─────────────────────────────────────────
export type Recurrencia = 'mensual' | 'anual' | 'unico' | 'extraordinario';
export type ModalidadPago = 'cuotas' | 'parciales' | 'pago_unico';

/** Aporte = DEFINITION (was TipoAporte). */
export type Aporte = {
  id: string;                 // client slug, e.g. 'ap-mensual'; immutable
  nombre: string;
  monto: number;              // Bs, >= 0
  recurrencia: Recurrencia;
  inicio: string | null;      // YYYY-MM-DD
  fin: string | null;         // YYYY-MM-DD; fin >= inicio when both set
  modalidadPago: ModalidadPago;
  aplicaGrupoId: string | null; // null = global
  activo: number;             // 0|1
};
export type AporteInput = {
  id?: string;                // POST accepts slug; PUT must ignore
  nombre: string;
  monto: number;
  recurrencia?: Recurrencia;  // default 'mensual' (D6)
  inicio?: string | null;
  fin?: string | null;
  modalidadPago?: ModalidadPago; // default 'cuotas' (D4)
  aplicaGrupoId?: string | null;
  activo?: number;            // default 1
};

/** APORTE_REGISTRO / cobro (rename of the old record type `Aporte`). */
export type AporteRegistro = {
  id: string; socioId: string;
  aporteId: string | null;        // FK → aportes_definicion (lineage)
  mes: number | null; gestion: number | null;
  tipo: string;                   // denormalized from recurrencia (D2)
  montoBase: number;              // snapshot of definition.monto (D2)
  montoPagado: number; saldoPendiente: number;
  razonAnulacion: string | null; numeroRecibo: string | null; fechaPago: string | null;
  estado: 'pendiente' | 'pagado' | 'anulado';
  socioNombre?: string | null; socioApellido?: string | null; // join
};

export type SocioAporte = { socioId: string; aporteId: string };

export type AporteInherited = { id: string; nombre: string; grupoId: string; grupoNombre: string };

export type Socio = Omit<old Socio, 'tipoAporteId'|'tipoAporteNombre'|'aporteBase'> & {
  aporteIds: string[];                  // direct assignments (editable)
  aportesInherited: AporteInherited[];  // read-only, dynamic (D5)
};
export type SocioInput = Omit<Socio, 'aporteIds'|'aportesInherited'|'estadoNombre'|'estadoColor'|'esActivo'|'grupos'> & {
  aporteIds?: string[];                 // ONE OR MORE; omitted on PUT preserves
  grupoAdicionalIds?: string[];
};

/** Definition-driven; NO monto / NO tipo override (D8). */
export type BulkAporteRequest = {
  socioIds?: string[];   // omitted for /bulk/all (all permitted resolved server-side)
  aporteIds: string[];   // ONE OR MORE active definitions
  gestion: number;
  mes?: number;          // optional lower bound for mensual
};
export type CrearAporteRequest = { socioId: string; aporteId: string; gestion: number; mes?: number };
// GET /api/aportes/:id/pagos → Movimiento[] (referenciaId, tipo=ingreso, anulado=0); 404 if absent
```

**API generation semantics (D3/D8)** — for a definition `d` and gestion `g`:
- `anual` → months [1..12] regardless of window/`mes`.
- `mensual` → `mesesDefinicion(d, g, mes?)` = months `m ∈ [1..12]` such that `(d.inicio==null || date(g,m) >= d.inicio)` AND `(d.fin==null || endOfMonth(g,m) <= d.fin)`; optional `mes` raises the lower bound to `max(1, mes)`.
- `unico`/`extraordinario` → `[mes ?? 1]`.
- A socio "holds" `d` if `d` is in its `socio_aportes` OR `d.aplicaGrupoId` ∈ { socio.grupoPrimarioId ∪ socio additional groups } (reuses the group resolution already in `socios.ts`).

## Testing Strategy

Infra unchanged: Vitest 2.1, `better-sqlite3` `:memory:` via `@otb/db`, Hono `app.request()`. `helpers.ts` is updated (sesenta definitions instead of `tipos_aporte`, `socio_aportes` cleared, `IDS`=slugs) so the whole suite runs against the corrected model.

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Integration (api) | Definition CRUD (`/api/aportes-definicion`): list/create validation (negative monto, invalid recurrencia, invalid modalidadPago, inverted window, unknown/missing aplicaGrupoId, duplicate id), update, PUT-id immutability, 404, delete-free-ok | vitest + `app.request()` (replaces `tipos-aporte.test.ts`) |
| Integration (api) | DELETE guard 409 with assignments (`socio_aportes`) and with generated records (`aportes.aporte_id`) | vitest |
| Integration (api) | Socio multiselect: POST multi, POST without → `[]`, invalid id, inactive id, non-array; PUT atomic replace / preserve; shape has no tipo/base | vitest (replaces `socios-tipo-aporte.test.ts`) |
| Integration (api) | Dynamic inheritance chips: primary, secondary, both, future-member (no materialization), removal stops unless directly assigned, direct-dedup, read-only | vitest |
| Integration (api) | Definition-driven single generation: mensual window count, anual→12, unico/extra→1, inherited-applicability, `monto`-in-body 400, inactive 400, outside-window → `{count:0}`, not-held 400, estado 409 | vitest (updates `aportes-generacion.test.ts`) |
| Integration (api) | Bulk/bulk-all definition-driven: per-def monto+count, estado exclusion, no-eligible 400, reject `monto`/`tipo`; `/pagos` preserved (ingreso, excludes anulado, 404) | vitest (updates `aportes-bulk-all-pagos.test.ts`) |
| Manual smoke | Definition form + cobro list on `aportes.tsx` crear/pagar tabs; socio multiselect + inherited chips; `config.tsx` has no aporte CRUD; ~360px wrapping | dev server |

## Migration / Rollout

Follows the existing drizzle progression (0003/0004 used generated SQL + hand seed/backfill). **`0005_*.sql` is additive-then-drop**: the additive statements run FIRST, the DROP statements are the final block (a team may split the DROP into a separate `0006` if a manual verification checkpoint is desired between them — the default is one file, drops last).

```sql
-- 1) ADDITIVE: definitions
CREATE TABLE `aportes_definicion` (
  `id` text PRIMARY KEY NOT NULL,
  `nombre` text NOT NULL,
  `monto` real NOT NULL,
  `recurrencia` text DEFAULT 'mensual' NOT NULL,
  `inicio` text,
  `fin` text,
  `modalidad_pago` text DEFAULT 'cuotas' NOT NULL,
  `aplica_grupo_id` text REFERENCES grupos(id),
  `activo` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
-- 2) Seed default definitions from the 4 legacy types (same ids forged in catalogo.ts)
INSERT OR IGNORE INTO `aportes_definicion`
  (id, nombre, monto, recurrencia, inicio, fin, modalidad_pago, aplica_grupo_id, activo)
  VALUES
  ('ap-mensual',  'Cuota Social Mensual', 50, 'mensual', NULL, NULL, 'cuotas', NULL, 1),
  ('ap-familiar', 'Aporte Familiar',      30, 'mensual', NULL, NULL, 'cuotas', NULL, 1),
  ('ap-jubilado', 'Aporte Jubilado',      25, 'mensual', NULL, NULL, 'cuotas', NULL, 1),
  ('ap-honorario','Aporte Honorario',      0, 'mensual', NULL, NULL, 'cuotas', NULL, 1);
--> statement-breakpoint
-- 3) ADDITIVE: M:N join
CREATE TABLE `socio_aportes` (
  `socio_id` text NOT NULL REFERENCES socios(id),
  `aporte_id` text NOT NULL REFERENCES aportes_definicion(id),
  PRIMARY KEY(`socio_id`, `aporte_id`)
);
--> statement-breakpoint
-- 4) ADDITIVE: lineage FK on records (nullable; existing records stay NULL per spec)
ALTER TABLE `aportes` ADD `aporte_id` text REFERENCES aportes_definicion(id);
--> statement-breakpoint
-- 5) ADDITIVE-first BACKFILL: convert socios.tipo_aporte_id → socio_aportes rows
INSERT OR IGNORE INTO `socio_aportes` (socio_id, aporte_id)
SELECT s.id,
  CASE s.tipo_aporte_id
    WHEN 'ta-pleno' THEN 'ap-mensual'
    WHEN 'ta-familiar' THEN 'ap-familiar'
    WHEN 'ta-jubilado' THEN 'ap-jubilado'
    WHEN 'ta-honorario' THEN 'ap-honorario'
  END
FROM `socios` s
WHERE s.tipo_aporte_id IS NOT NULL;
--> statement-breakpoint
-- 6) ADDITIVE-then-DROP (final block, after verification):
ALTER TABLE `socios` DROP COLUMN `tipo_aporte_id`;
ALTER TABLE `socios` DROP COLUMN `aporte_base`;
DROP TABLE `tipos_aporte`;
```

Rollback: reverting `0005` restores `tipos_aporte`, `socio_aportes`, the old `socios` columns; existing `aportes` records are never deleted or rewritten, so `/pagos` and financial data survive both directions. `ux-avanzado-otb` is archived only after this change verifies.

## Open Questions

- [ ] Confirm the DROP block stays inside `0005` or moves to a separate `0006` (team preference on a verification checkpoint between additive and destructive steps; default = one file, drops last).
- [ ] Confirm whether `mes` (optional lower bound for `mensual`) should remain in the API at all, given every spec scenario derives the month set purely from the vigencia window (keeping it is backward-friendly and harmless).