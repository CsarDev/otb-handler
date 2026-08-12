# Design: Multi-Group Aporte Assignment + Searchable MultiSelect (aporte-multigrupo-multiselect)

## Context

The archived `aporte-cobro-unificado` change (implemented and verified) unified definition creation, assignment, and cobro generation behind the D13 dedup invariant (`(socio, aporte, mes, gestion)` never duplicates across any generation path), with decisions D12–D22 standing. This change builds directly on it and corrects two coupled limitations the user confirmed:

1. **Model**: a definition of aporte applies to exactly ONE group (`aportes_definicion.aplica_grupo_id`, singular nullable FK). The user confirmed a definition MUST apply to SEVERAL groups at once — an M:N relationship — while keeping the "empty = global" semantics.
2. **UX**: the "Asignar a" control is a radio (a nadie / a socios / a un grupo) + checkbox scrollbox + single-group `<select>`, only on CREATE (archived D19 made EDIT field-edit-only). The socio form uses pill toggles. The user wants ONE compact searchable MultiSelect (filter-as-you-type + removable chips with ×) reused across every multi-selection form.

The specs (deltas for `aporte-definitions`, `socios-estados`, `grupos`) encode the accepted product decisions R1–R5. This design turns them into concrete architecture decisions D23–D32 that continue the archived D-numbering.

## Goals

- G1 — Make group application M:N via a join table `aportes_definicion_grupos (definition_id, grupo_id)` (composite PK, mirror of `socio_grupos`), with additive migration `0007` that backfills `aplica_grupo_id` and drops the column (single source of truth; `grupoIds: []` = global). (R1)
- G2 — Preserve the D13 dedup invariant verbatim across every generation path (POST definition, PUT definition, socio save, manual endpoints). (R1–R3)
- G3 — Make assignment editable on EDIT: `PUT /:id` accepts `socioIds?`/`grupoIds?` with replace-when-declared / preserve-when-omitted, generates only missing records, NEVER deletes generated records, responds `{ definiciones, generados }`. (R3, supersedes D19)
- G4 — Resolve read-time inheritance with def-dedup: ONE chip per definition, `AporteInherited` shape unchanged, `grupoId` = first matching group in stable order (primary first, then additional groups by `socio_grupos` rowid). (R2)
- G5 — Ship a hand-rolled, zero-dependency searchable MultiSelect (`packages/ui/src/components/multi-select.tsx`, exported from the ui index) and use it in the aporte definition form (create AND edit) and the socio form (`aporteIds`, `grupoAdicionalIds` with `excludeValues=[grupoPrimarioId]`). (R5, R4)
- G6 — Close the orphan-FK gap: `DELETE /api/grupos/:id` returns 409 when the group is referenced by `aportes_definicion_grupos`; `DELETE /api/aportes-definicion/:id` cleans its join rows in the same transaction. (R1, spec grupos)

## Non-Goals

- Bulk multas `socioIds` selector, asistencia selector, and reportes selectors (balance/libro/socio-resumen filters) — follow-up candidates for the same MultiSelect, NOT in this change. (R4)
- `POST /api/aportes`, `/bulk`, `/bulk/all` — retained as-is (already dedup-safe); no UI entry point. (archived D17)
- Retroactive re-generation of past records; migration backfill covers assignment metadata only.
- Payments / anulación / partial payment flows — untouched.
- Definition `id` handling (server UUID, archived D14) and seeded slugs (`ap-mensual`, etc.) — unchanged.
- Reports/dashboard/egresos/notifications/export — untouched.

## Technical Approach

A schema correction + a shared-UI refactor, both layered on the archived change:

1. **DB (R1)**: new join table `aportes_definicion_grupos` (Drizzle model mirroring `socio-grupos.ts`), migration `0007` additive-first: CREATE join table → backfill `INSERT OR IGNORE ... SELECT id, aplica_grupo_id` → `ALTER TABLE ... DROP COLUMN aplica_grupo_id` (pattern proven in 0005, which dropped FK column `tipo_aporte_id` with `foreign_keys=ON`). Column removed from the Drizzle model; table exported from `schema.ts`.
2. **Core types**: `Aporte.aplicaGrupoId: string | null` → `grupoIds: string[]` (empty = global); `AporteInput.aplicaGrupoId?` → `grupoIds?: string[]`; `AporteInherited` unchanged; `CrearDefinicionResponse` reused for the PUT response.
3. **API lib**: `socioHoldsAporte` becomes a set-intersection over `def.grupoIds` vs the socio's primary+additional groups; `definicionesDeGrupos` becomes a join query through the new table (`activo = 1`, dedup by definition id); new batch hydration helper `grupoIdsPorDefinicion(ids)` wired into EVERY `Aporte`-returning path (`aporteDefPorId`, `aporteDefActivoDefault`, `definicionesPorIds`, `definicionesDeGrupos`, GET catalog) so a hydrated definition always carries `grupoIds` (never `undefined`). `generarAportes` unchanged (D13).
4. **API routes**: `aportes-definicion.ts` — `validarAporte` validates `grupoIds[]` (each must exist → 400; absent/`[]` = global); POST target set = deduped union of direct `socioIds` ∪ current members (primario OR adicional) of ALL `grupoIds`; PUT becomes an assignment transaction mirroring the socios PUT; GET catalog hydrates `grupoIds` + `socioIds`; DELETE removes join rows in the same transaction. `socios.ts` — `aportesInheritedPorSocio` resolves through the join table with def-dedup + stable ordering; `grupos.ts` — DELETE guard gains the join-table check.
5. **UI**: new `MultiSelect` component (R5 contract) replaces the radio/checkbox/select block in `aportes.tsx` (create + edit, pre-filled) and the pill toggles in `socios.tsx`; `app.store.ts` `updateAporte` sends assignments and returns `generados`.
6. **Tests**: `helpers.ts` seed → join shape; the 5 existing suites reworked mechanically (`aplicaGrupoId` → `grupoIds`); NEW scenarios for multi-group POST, PUT semantics, guard, hydration, join cleanup, and chip def-dedup.

## Architecture Decisions

### Retained from the archived design (unchanged)

| # | Decision | Status in this change |
|---|----------|----------------------|
| D1–D4, D6, D7b, D8, D9, D11 | Definition table, snapshots, vigencia window, modalidad default, recurrencia default, `AporteRegistro` naming, generation counts, estado enforcement, `aporteMensualBase` | Retained as-is |
| D5 | Read-only inherited chips resolved dynamically; `socio_aportes` never materialized for group application | Retained; the resolution source becomes the join table (D29) |
| D7 | Client slug id | SUPERSEDED by D14 (archived) — unchanged here |
| D10 | DELETE guard 409 (socio_aportes reference OR `aportes.aporte_id` reference) | Retained; join rows explicitly do NOT trigger 409 (D28) |
| D12 | Auto-generation `gestion = new Date().getFullYear()`, no `mes` | Retained |
| D13 | Dedup invariant: partial unique index + SELECT-before-INSERT in `generarAportes` | **Retained verbatim** — the single most important invariant; every new path flows through it |
| D14 | Server-generated UUID; body `id` ignored | Retained |
| D15 | POST definition = one transaction: insert + assign + generate | Retained; target-set resolution generalizes to ALL `grupoIds` (D26) |
| D16 | Socio POST/PUT generate in the same transaction over direct ∪ group-scoped definitions | Retained; group-scoped half resolves through the join table (D25) |
| D17 | Single/bulk/bulk-all endpoints retained, dedup-safe | Retained |
| D18 | `socioIds` validation on POST definition (400 before any insert) | Retained; extended to `grupoIds` (D26) |
| D19 | PUT field-edit only | **SUPERSEDED by D27** (PUT edits assignments too) |
| D20 | `definicionesDeGrupos(grupoIds)` helper | Retained-but-reworked: join-table query with dedup by definition (D25) |
| D21 | "Asignar a" exclusive radio modes, create-only | **SUPERSEDED by D32** (two MultiSelects on create AND edit) |
| D22 | Minimal local toast with `aria-live` | Retained; now also shown after PUT (D32) |

### Decision: Join table `aportes_definicion_grupos` + migration 0007 (D23 — R1)

**Choice**: New M:N join table with composite PK `(definition_id, grupo_id)`, both FKs (`ON DELETE no action`), Drizzle model mirroring `socio-grupos.ts` exactly. Migration `0007_*.sql` is additive-first:

```sql
-- 0007_* — Aplicación M:N definición↔grupo (D23). ADITIVO primero (join table +
-- backfill); el bloque DROP (aplica_grupo_id) va AL FINAL. Patrón probado en 0005
-- (DROP COLUMN de FK con foreign_keys=ON).
CREATE TABLE `aportes_definicion_grupos` (
	`definition_id` text NOT NULL,
	`grupo_id` text NOT NULL,
	PRIMARY KEY(`definition_id`, `grupo_id`),
	FOREIGN KEY (`definition_id`) REFERENCES `aportes_definicion`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grupo_id`) REFERENCES `grupos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- BACKFILL aditivo: convierte la columna singular → filas de la join.
-- Idempotente (INSERT OR IGNORE + PK compuesta); NO toca socios ni registros.
INSERT OR IGNORE INTO `aportes_definicion_grupos` (definition_id, grupo_id)
SELECT id, aplica_grupo_id
FROM `aportes_definicion`
WHERE aplica_grupo_id IS NOT NULL;
--> statement-breakpoint
-- Bloque DROP final (tras verificar lo aditivo): columna legacy.
ALTER TABLE `aportes_definicion` DROP COLUMN `aplica_grupo_id`;
```

The migration is generated with `pnpm db:generate` (keeps `meta/_journal.json` + `0007_snapshot.json` in sync; the test helper `migrarDb()` applies every `*.sql` sorted, so the in-memory DB picks it up automatically). drizzle-kit emits the CREATE + DROP COLUMN from the schema diff; the backfill `INSERT OR IGNORE` is added manually between them (drizzle-kit does not generate data backfills — same as 0005).

**Drizzle model** — `packages/db/src/schema/aportes-definicion-grupos.ts` (NEW, mirrors `socio-grupos.ts`):

```ts
import { sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';
import { aportesDefinicion } from './aportes-definicion';
import { grupos } from './grupos';

// Aplicación M:N definición ↔ grupo (D23). Reemplaza la FK singular
// `aportes_definicion.aplica_grupo_id`; mismo patrón que `socio_grupos`.
export const aportesDefinicionGrupos = sqliteTable(
  'aportes_definicion_grupos',
  {
    definitionId: text('definition_id')
      .notNull()
      .references(() => aportesDefinicion.id),
    grupoId: text('grupo_id')
      .notNull()
      .references(() => grupos.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.definitionId, t.grupoId] }) }),
);
```

`packages/db/src/schema.ts` adds `export * from './schema/aportes-definicion-grupos';` (after the `aportes-definicion` export). `packages/db/src/schema/aportes-definicion.ts` removes the `aplicaGrupoId` column (`aplicaGrupoId: text('aplica_grupo_id').references(() => grupos.id)`) and the now-unused `grupos` import; the header comment drops the `aplica_grupo_id` clause.

**Grupos DELETE guard** (orphan-FK fix, spec grupos): the delete handler adds a THIRD reference check before the existing `primario`/`adicional` checks:

```ts
const enDefinicion = db
  .select({ definitionId: schema.aportesDefinicionGrupos.definitionId })
  .from(schema.aportesDefinicionGrupos)
  .where(eq(schema.aportesDefinicionGrupos.grupoId, id))
  .get();
if (enDefinicion) {
  return c.json({ error: 'Cannot delete: group is referenced by an aporte definition' }, 409);
}
```

**Alternatives considered**: (a) retain `aplica_grupo_id` and dual-write both — rejected: permanent divergence risk between two sources of truth (the current schema comment already flags the dual applicability sources) and the orphan-FK DELETE gap remains unless guarded anyway; (b) a JSON/CSV group list column — rejected: no relational integrity, no FK, breaks the proven `socio_grupos` pattern. **Rationale**: composite-PK join mirroring `socio_grupos` is the established codebase pattern; 0005 proved DROP COLUMN works on FK child columns with `foreign_keys=ON`; additive-first ordering (CREATE → backfill → DROP) makes rollback safe at every step.

**Real-DB validation (performed)**: `packages/db/otb.db` has 5 definitions, 1 with `aplica_grupo_id` set (a "test" definition → group `51e17ab9-…` "Manzano A", which EXISTS — no orphan) → the backfill produces exactly **1 join row**; seeded definitions are global (no rows). 222 cobro records, 0 with a conflicting dedup key. Fresh installs: nothing to backfill.

### Decision: Core type deltas (D24)

**Choice**:

```ts
export type Aporte = {
  // ...
  grupoIds: string[]; // M:N vía aportes_definicion_grupos; [] = global (antes aplicaGrupoId: string | null)
  // ...
};

export type AporteInput = {
  // ...
  grupoIds?: string[]; // ausente/[] = global; cada id DEBE existir (400 si no) — antes aplicaGrupoId?
  socioIds?: string[]; // sin cambios (D18)
  // ...
};
```

`AporteInherited` (`{ id, nombre, grupoId, grupoNombre }`) is UNCHANGED — def-dedup happens in resolution (D29), not in the type. `Socio` shape unchanged. `CrearDefinicionResponse { definiciones, generados }` is reused for the PUT response (200) — the PUT contract becomes the same shape as POST minus the status code.

**Alternatives considered**: keep `aplicaGrupoId` and add `grupoIds[]` — rejected (dual sources of truth); a `grupoIds: string[] | null` where `null` = global — rejected: `[]` already means "no group" and an empty array is the natural default for an M:N set. **Rationale**: `grupoIds: string[]` with `[] = global` maps 1:1 to the join table and to the MultiSelect's `selected: string[]` state — no nullable wrinkle anywhere in the UI.

### Decision: `lib/aportes.ts` — set-intersection predicate, join query, batch hydration (D25)

**Choice**: three changes in `packages/api/src/lib/aportes.ts`:

1. `socioHoldsAporte` becomes a set-intersection over `def.grupoIds`:

```ts
export function socioHoldsAporte(
  socio: { aporteIds: string[] | undefined; grupoPrimarioId: string | null },
  def: { id: string; grupoIds: string[] },
  grupos: string[], // grupos adicionales del socio
): boolean {
  if (socio.aporteIds?.includes(def.id)) return true;          // asignación directa (sin cambios)
  if (def.grupoIds.length === 0) return false;                 // global → nunca "held" por grupo
  const gruposDelSocio = new Set<string>();
  if (socio.grupoPrimarioId) gruposDelSocio.add(socio.grupoPrimarioId);
  for (const g of grupos) gruposDelSocio.add(g);
  return def.grupoIds.some((g) => gruposDelSocio.has(g));      // intersección de sets
}
```

2. `definicionesDeGrupos(grupoIds)` becomes a join query through the new table, deduped by definition id (a def listed under several requested groups returns once), `activo = 1`:

```ts
export function definicionesDeGrupos(grupoIds: string[]): Aporte[] {
  if (grupoIds.length === 0) return [];
  const filas = db
    .select({ def: schema.aportesDefinicion })
    .from(schema.aportesDefinicionGrupos)
    .innerJoin(
      schema.aportesDefinicion,
      eq(schema.aportesDefinicionGrupos.definitionId, schema.aportesDefinicion.id),
    )
    .where(and(inArray(schema.aportesDefinicionGrupos.grupoId, grupoIds), eq(schema.aportesDefinicion.activo, 1)))
    .all();
  const unicos = new Map<string, Aporte>();
  for (const f of filas) unicos.set(f.def.id, f.def as unknown as Aporte);
  return [...unicos.values()];
}
```

3. NEW batch hydration helper + a single internal hydrator used by every `Aporte`-returning path:

```ts
/** definition_id → grupoId[] (batch, sin N+1). */
export function grupoIdsPorDefinicion(ids: string[]): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  if (ids.length === 0) return mapa;
  const filas = db
    .select({ definitionId: schema.aportesDefinicionGrupos.definitionId, grupoId: schema.aportesDefinicionGrupos.grupoId })
    .from(schema.aportesDefinicionGrupos)
    .where(inArray(schema.aportesDefinicionGrupos.definitionId, ids))
    .all();
  for (const f of filas) {
    const arr = mapa.get(f.definitionId) ?? [];
    arr.push(f.grupoId);
    mapa.set(f.definitionId, arr);
  }
  return mapa;
}

/** Adjunta grupoIds (default []) a definiciones — ÚNICA fuente de hidratación. */
function hidratarGrupoIds(defs: Aporte[]): Aporte[] {
  const mapa = grupoIdsPorDefinicion(defs.map((d) => d.id));
  return defs.map((d) => ({ ...d, grupoIds: mapa.get(d.id) ?? [] }));
}
```

`aporteDefPorId`, `aporteDefActivoDefault`, `definicionesPorIds`, and `definicionesDeGrupos` all return `hidratarGrupoIds(...)` results. **Why this is critical**: `socioHoldsAporte` now reads `def.grupoIds` — an unhydrated def would have `grupoIds === undefined`, `length === 0`, and group-scoped generation would silently stop working. The single hydrator makes "every returned Aporte carries `grupoIds`" an enforced invariant.

**Alternatives considered**: per-row hydration in each caller — rejected (N+1); a SQL-level `GROUP_CONCAT` of group ids — rejected (muddies the drizzle model, needs string parsing). **Rationale**: one batch `inArray` query per path, assembled in memory; mirrors the existing `gruposAdicionalesPorSocio` batch pattern.

### Decision: POST target set = union across ALL `grupoIds` (D26)

**Choice**: `validarAporte` replaces the `aplicaGrupoId` block with `grupoIds` validation (mirrors `validarSocioIds`/`validarGrupos`): absent/`null`/`[]` → `[]` (global); non-array → `400 { error: 'grupoIds must be an array' }`; each id must exist in `grupos` else `400 { error: 'grupoIds contains an invalid group' }` before any insert (D18 pattern). `ValoresAporte.grupoIds: string[]` replaces `aplicaGrupoId: string | null`.

POST transaction (extending D15):

1. insert the definition (`id = crypto.randomUUID()`, D14);
2. insert `socio_aportes` for every `socioId` (direct, unchanged);
3. insert `aportes_definicion_grupos` rows for every `grupoId` (the M:N application set);
4. **target set** = `Set(socioIds)` ∪ for EACH `gid ∈ grupoIds`: current members with `grupoPrimarioId = gid` ∪ members via `socio_grupos.grupoId = gid` — deduplicated by socio (overlap across groups and direct assignment generates once);
5. load target socios (`id, estadoId, grupoPrimarioId`) + their additional groups (batch), filter to those whose estado `permite 'aportes'` (bulk-exclusion: assignment kept, 0 records, `201` never `409` — D15/D9);
6. `directos` map = `socioIds → [id]`; `defNueva = { id, ...values, grupoIds }` (hydrated); call the shared D13 dedup generator for the current `gestion` (D12);
7. respond `201 { definiciones: [full catalog, hydrated], generados: { count, items } }`.

**Alternatives considered**: keep the single-group UI mode but allow multiple groups server-side — rejected (the product decision is one MultiSelect; the API union is what the spec scenarios assert); restrict POST to one group — rejected (contradicts the M:N requirement). **Rationale**: the union of current members across ALL groups with socio-dedup is the natural generalization of the archived single-group target-set code (the `if (grupoId)` block becomes a `for (gid of grupoIds)` loop), and it maps 1:1 to spec scenarios "union of direct ∪ group members" and "multiple grupoIds → deduped union".

### Decision: PUT assignment semantics — replace-when-declared / preserve-when-omitted (D27 — SUPERSEDES D19)

**Choice**: `PUT /api/aportes-definicion/:id` mirrors the proven socios PUT transaction. It still updates the editable fields (validation identical to POST), and additionally accepts `socioIds?` and `grupoIds?` with replace-when-declared / preserve-when-omitted semantics:

```
finalSocioIds = body.socioIds !== undefined ? validated(body.socioIds) : current socio_aportes ids for :id
finalGrupoIds = body.grupoIds !== undefined ? validated(body.grupoIds) : current join ids for :id
```

One `db.transaction()`:
1. update the definition's scalar fields (validated via `validarAporte`; `grupoIds` is NOT a column anymore — it is persisted via the join);
2. if `socioIds` declared: `tx.delete(socio_aportes).where(aporteId = id)` then insert `finalSocioIds` (atomic replace — same as socios PUT);
3. if `grupoIds` declared: `tx.delete(aportes_definicion_grupos).where(definitionId = id)` then insert `finalGrupoIds`;
4. resolve the target set = `finalSocioIds` ∪ current members of ALL `finalGrupoIds` (deduped);
5. filter permitted; `defNueva = { ...updatedFields, grupoIds: finalGrupoIds }` (hydrated from the FINAL join state so `socioHoldsAporte` evaluates correctly for group-only members);
6. run the D13 dedup generator → **generates only MISSING records**; removals NEVER delete generated records (the `aportes` table is only ever inserted to, never touched by assignment changes);
7. respond `200 { definiciones: [full catalog, hydrated], generados: { count, items } }` — reusing `CrearDefinicionResponse` (D24).

A PUT with neither assignment field (pure field edit) preserves both sets and re-runs the generator over the preserved set — a no-op thanks to dedup (`count: 0`), matching "PUT without an assignment field preserves it".

**Alternatives considered**: (a) PUT replaces the whole assignment set unconditionally — rejected (destructive; breaks preserve consumers); (b) keep field-edit-only and add a separate assignment endpoint — rejected (more API surface, contradicts user req 2); (c) PUT regenerates from scratch — rejected (violates "never delete records", D13). **Rationale**: replace-when-declared / preserve-when-omitted is already proven in `socios.ts` PUT, is consistent with the D13 invariant, and satisfies the spec scenarios "PUT replaces a declared assignment set atomically", "PUT without an assignment field preserves it", and "PUT adding a new group generates only the missing records".

### Decision: GET catalog hydration + DELETE join cleanup (D28)

**Choice**: two route changes in `aportes-definicion.ts`:

1. `GET /` hydrates EVERY definition with `grupoIds` AND `socioIds` (batch, no N+1) — required for faithful edit pre-fill (spec scenario "Edit mode pre-fills current assignments"):

```ts
const defs = db.select().from(schema.aportesDefinicion).all() as unknown as Aporte[];
const ids = defs.map((d) => d.id);
const grupoIdsPorDef = grupoIdsPorDefinicion(ids);            // 1 query batch
const socioIdsPorDef = socioIdsPorDefinicion(ids);            // 1 query batch sobre socio_aportes
return c.json(defs.map((d) => ({
  ...d,
  grupoIds: grupoIdsPorDef.get(d.id) ?? [],
  socioIds: socioIdsPorDef.get(d.id) ?? [],
})));
```

(`socioIdsPorDefinicion` is a small sibling batch helper — `aporteId → socioId[]` from `socio_aportes` — local to the route or in `lib/aportes.ts` next to `grupoIdsPorDefinicion`.) The POST/PUT responses reuse this same hydrated list for `definiciones`.

2. `DELETE /:id` — the 409 guard is UNCHANGED (D10: `socio_aportes` reference OR `aportes.aporte_id` reference). The definition's join rows are FK-owned metadata and do NOT trigger 409; they are removed in the SAME transaction before deleting the definition (with `foreign_keys=ON` and `ON DELETE no action`, deleting the parent with join rows would throw):

```ts
db.transaction((tx) => {
  tx.delete(schema.aportesDefinicionGrupos).where(eq(schema.aportesDefinicionGrupos.definitionId, id)).run();
  tx.delete(schema.aportesDefinicion).where(eq(schema.aportesDefinicion.id, id)).run();
});
```

**Alternatives considered**: relying on `ON DELETE CASCADE` — rejected (the codebase uses `no action` everywhere and explicit transactional cleanup is the established pattern); loading join rows into the 409 guard — rejected (spec explicitly says join rows are definition-owned metadata, not a 409 trigger). **Rationale**: hydration is a single batch per list rendering (the store's replace-list pattern already refreshes the catalog), and transactional join cleanup keeps the delete atomic with the parent.

### Decision: `aportesInherited` def-dedup with stable first-group ordering (D29 — R2)

**Choice**: `aportesInheritedPorSocio` (in `socios.ts`) resolves group-scoped definitions through the join table and applies def-dedup with a deterministic attribution order. Per socio:

1. build the socio's group id list in STABLE order: `[grupoPrimarioId?]` first, then additional groups in `socio_grupos` rowid order (the existing `gruposPorSocio` membresias query gains `.orderBy(sql\`rowid\`)` so insertion order is deterministic — the order the client sent in POST);
2. one batch query over the join table: `SELECT definition_id, grupo_id FROM aportes_definicion_grupos WHERE grupo_id IN (socioGroupIds)` (+ one batch for definition names, one for group names — 3 queries total, no N+1);
3. iterate the socio's groups in stable order; for each group, for each join row of that group, add the definition to the result map **only if not already present** (`if (!set.has(d.id)) set.set(d.id, { id, nombre, grupoId, grupoNombre })`) — the FIRST matching group in stable order wins.

This yields ONE chip per definition (`AporteInherited` shape unchanged), attributed to the primary group when it matches, else the earliest additional membership — matching spec scenarios "Def-dedup — a multi-group definition renders ONE chip with the primary group" and "with no primary match the earliest additional membership wins". The existing direct-assignment dedup in `armarSocio` (`inherited.filter((i) => !directos.has(i.id))`) is unchanged.

**Alternatives considered**: chip-per-(definition × group) pair — rejected (N× chips per def, noisier UI, heavier test churn; proposal R2 recommends dedup); LAST matching group wins (current `Map.set` overwrite behavior) — rejected (nondeterministic attribution across group iteration order). **Rationale**: the stable ordering makes the chip deterministic and readable, and single-group scenarios keep their exact archived semantics through the join table.

### Decision: grupos DELETE guard via join table (D30)

**Choice**: `DELETE /api/grupos/:id` adds the `aportes_definicion_grupos.grupoId` reference check → `409 { error: 'Cannot delete: group is referenced by an aporte definition' }` (D23 snippet). The existing primary-membership and `socio_grupos` checks are unchanged.

**Alternatives considered**: leave the guard as-is — rejected (the archived `aplica_grupo_id` FK was unguarded, so deleting a group pinned by a definition left an orphan; the join table is the single source of truth now and MUST be guarded); a `ON DELETE SET NULL`/`CASCADE` FK — rejected (silent data loss vs. loud 409, and it would break the definition's assignment silently). **Rationale**: the spec's groups delta is additive — no archived scenario changes behavior, only a new guard branch closes the orphan-FK gap.

### Decision: MultiSelect component (D31 — R5)

**Choice**: hand-rolled `packages/ui/src/components/multi-select.tsx`, exported from `packages/ui/src/index.ts` as `MultiSelect`. Zero new dependencies (lucide-react `X` is already in `@otb/ui`). Contract:

```ts
export type MultiSelectOption = { value: string; label: string };

export type MultiSelectProps = {
  options: MultiSelectOption[];
  selected: string[];                       // valores seleccionados (controlado)
  onChange: (values: string[]) => void;
  placeholder?: string;                     // texto del input de filtro
  searchPlaceholder?: string;               // placeholder ARIA del input
  emptyLabel?: string;                      // "sin coincidencias"
  disabled?: boolean;
  excludeValues?: string[];                 // ocultos de las opciones (invariante primario ∉ adicionales)
};
```

Behavior:
- **Filter-as-you-type**: case-insensitive substring match over `label`; the dropdown lists only remaining options — those not `selected` and not in `excludeValues`; typing resets the active index.
- **Chips**: selected values render as removable chips, each with a lucide `X` button (removes via `onChange`); chips wrap (`flex flex-wrap`) for ~360px.
- **Dropdown**: absolutely positioned INSIDE the control (relative wrapper, `absolute z-10` above the listbox content) — deliberately NOT teleported, so it stacks correctly inside the hand-rolled `z-50` modal (existing risk mitigation).
- **Keyboard**: `↑`/`↓` move the highlighted option (`aria-activedescendant`), `Enter` toggles selection of the highlighted option (or opens the dropdown when closed), `Escape` closes; focus returns to the filter input on close.
- **ARIA**: container `role="combobox"` with `aria-expanded` + `aria-controls`; the filter input carries `aria-autocomplete="list"` + `aria-activedescendant`; the dropdown is `role="listbox"` with `id`; each option is `role="option"` with `aria-selected`; no-match shows `emptyLabel` with `role="status"`.
- **Styling**: reuse the existing `Input`-aligned classes (`border-gray-300 rounded-md text-sm focus-visible:ring-blue-600`), chips in the blue pill style already used in `socios.tsx` (`border-blue-200 bg-blue-50 text-blue-700`), `disabled` state mirrors `Input` (`disabled:cursor-not-allowed disabled:opacity-50`).

**Alternatives considered**: third-party combobox (cmdk / radix-popover / headlessui) — rejected (none in the lockfile; OTB scale doesn't need it; hand-rolled matches the existing hand-rolled modal/toast pattern); the existing pill-toggle pattern everywhere — rejected (scales poorly with many options, no filter). **Rationale**: R5 is pre-agreed from exploration; the contract is deliberately small and controlled so every consumer (aportes ×2, socios ×2) uses it identically.

### Decision: UI integration scope (D32 — R4, SUPERSEDES D21)

**Choice**: the shared MultiSelect is used in exactly two places (R4 core scope):

- **`apps/web/src/routes/aportes.tsx`** — the "Asignar a" radio/checkbox/single-select block (D21) is REPLACED by two MultiSelects shown on CREATE **AND** EDIT: a **Socios** MultiSelect (options = the existing `permitidos` filter — socios whose estado permits `aportes` — unchanged) and a **Grupos** MultiSelect (options = `grupos`). Component state replaces the radio mode: `selectedSocioIds: string[]` + `selectedGrupoIds: string[]`; `openDefinicionEdit` pre-fills them from `a.socioIds`/`a.grupoIds` (requires D28 hydration), `openDefinicionCreate` resets both to `[]`. The definition form's zod schema drops `aplicaGrupoId`. Submit always declares both arrays (replace semantics; `[]` = cleared/global): create and edit payloads both carry `socioIds` + `grupoIds`. After edit, the PUT returns `generados` → the D22 toast shows "Se generaron N cobro(s)" and `fetchAporteRegistros()` refreshes (same as create). The definition list row renders one Badge per assigned group, with a `+N` overflow badge when the count exceeds 3 (first 2 + `+N`). The live cobro-count hint computes the deduped union of members across ALL selected groups ∪ selected socios (kept).
- **`apps/web/src/routes/socios.tsx`** — the pill toggles for `aporteIds` and `grupoAdicionalIds` are REPLACED by the MultiSelect: `aporteIds` options = `selectAportesActivos(aportes)` (active definitions only); `grupoAdicionalIds` options = `grupos` with `excludeValues={[form.watch('grupoPrimarioId')]}` (preserves the "primary ∉ additional" invariant; the existing `handlePrimaryChange` cleanup stays as defense-in-depth).
- **`apps/web/src/stores/app.store.ts`** — `updateAporte: (id, data: Partial<AporteInput>) => Promise<GeneracionResult>`: parses the new `{ definiciones, generados }` PUT response, `set({ aportes: definiciones })`, returns `generados` (caller toasts). `addAporte` unchanged apart from the `grupoIds` field name passing through.

Out of scope (explicit follow-ups): bulk multas `socioIds`, asistencia selector, reportes selectors — trivial reuse of the same component later.

**Alternatives considered**: include the follow-up selectors now — rejected (more surface, more test churn, no user request); a single shared assignment component in the UI kit — rejected (the definition and socio forms have different option sources and invariants; two MultiSelects per form is the minimal composition). **Rationale**: R4/R5 are pre-agreed; the UI always declaring both arrays means replace-when-declared is what the app exercises, while preserve-when-omitted remains available to API consumers and tests (and is covered by the socios-form behavior).

## Data Flow

```
1) DEFINITION CREATE (POST /api/aportes-definicion, ONE tx — D26)
   body { nombre, monto, recurrencia?, inicio?, fin?, modalidadPago?, grupoIds?, activo?, socioIds? }
     │  id → IGNORED (D14); socioIds validated (D18); grupoIds validated (cada id existe → 400)
     ▼
   tx: ┌ insert aportes_definicion (id = crypto.randomUUID())
       ├ socio_aportes ← socioIds (directos)
       ├ aportes_definicion_grupos ← grupoIds (M:N join)
       ├ targetSet = socioIds ∪ Σ currentMembers(g) for g ∈ grupoIds        [dedup por socio]
       ├ permitidos = filter(targetSet, permite(estadoId, 'aportes'))        [bulk-exclusion]
       ├ defNueva = { ...fields, grupoIds } (hidratada)
       └ generarAportes(tx, permitidos, [defNueva], directos, gruposAdic., gestion = YEAR)  [D13]
   └ 201 { definiciones: [catálogo hidratado con grupoIds+socioIds], generados: { count, items } }

2) DEFINITION EDIT (PUT /api/aportes-definicion/:id, ONE tx — D27)
   body { ...campos, socioIds?, grupoIds? }
     │  finalSocioIds = declarado ?? preservado (socio_aportes de :id)
     │  finalGrupoIds = declarado ?? preservado (join de :id)
     ▼
   tx: ┌ update campos escalares
       ├ if socioIds declarado: delete+reinsert socio_aportes (:id)
       ├ if grupoIds declarado: delete+reinsert aportes_definicion_grupos (:id)
       ├ targetSet = finalSocioIds ∪ Σ currentMembers(g) for g ∈ finalGrupoIds
       ├ defNueva = { ...actualizado, grupoIds: finalGrupoIds }
       └ generarAportes(...)  → solo FALTANTES (D13); removals NUNCA borran registros
   └ 200 { definiciones, generados }       [mismo shape que POST, D24]

3) SOCIO SAVE (POST|PUT /api/socios[/:id], ONE tx — D16 unchanged)
   defs = union( definicionesPorIds(final aporteIds)            [directas, activas, hidratadas]
               , definicionesDeGrupos(final primario ∪ adicionales) )  [join table, dedup por def]
        → socioHoldsAporte usa grupoIds (set-intersection, D25)
   └ generados = solo filas NUEVAS; removals nunca borran

4) READ PATH
   GET /api/aportes-definicion → defs + grupoIds + socioIds (batch, D28)   [edit pre-fill]
   GET /api/socios → aportesInherited via join table + def-dedup orden estable (D29)
     └ primer grupo en orden estable (primario → adicionales por rowid) atribuye el chip
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/db/drizzle/0007_*.sql` | Create | Join table CREATE + backfill `INSERT OR IGNORE ... SELECT` + `DROP COLUMN aplica_grupo_id` (additive-first, D23). Generated via `pnpm db:generate`; backfill added manually |
| `packages/db/src/schema/aportes-definicion-grupos.ts` | Create | Drizzle M:N join model (composite PK, mirrors `socio-grupos.ts`) |
| `packages/db/src/schema/aportes-definicion.ts` | Modify | Remove `aplicaGrupoId` column + `grupos` import; update header comment |
| `packages/db/src/schema.ts` | Modify | Add `export * from './schema/aportes-definicion-grupos';` |
| `packages/core/src/index.ts` | Modify | `Aporte.aplicaGrupoId: string \| null` → `grupoIds: string[]`; `AporteInput.aplicaGrupoId?` → `grupoIds?: string[]`; `AporteInherited`/`Socio`/`CrearDefinicionResponse` unchanged (reused for PUT) |
| `packages/api/src/lib/aportes.ts` | Modify | `socioHoldsAporte` set-intersection over `grupoIds`; `definicionesDeGrupos` join query (activo=1, dedup por def); NEW `grupoIdsPorDefinicion(ids)` + internal `hidratarGrupoIds` wired into `aporteDefPorId`/`aporteDefActivoDefault`/`definicionesPorIds`/`definicionesDeGrupos` |
| `packages/api/src/routes/aportes-definicion.ts` | Modify | `validarAporte` `grupoIds` (array, each exists → 400, absent/[] = global); POST inserts join rows + target union across ALL `grupoIds` (D26); PUT assignment transaction replace/preserve + `{ definiciones, generados }` (D27, supersedes D19); GET hydration `grupoIds`+`socioIds` (D28); DELETE join cleanup in same tx (D28); POST/PUT responses use the hydrated catalog |
| `packages/api/src/routes/socios.ts` | Modify | `aportesInheritedPorSocio` via join table + def-dedup stable order (D29); `gruposPorSocio` membresias query gains `.orderBy(sql\`rowid\`)`; `definicionesFinales` unchanged (consumes hydrated defs) |
| `packages/api/src/routes/grupos.ts` | Modify | DELETE guard adds `aportes_definicion_grupos.grupoId` check → 409 with definition-specific message (D30, orphan-FK fix) |
| `packages/ui/src/components/multi-select.tsx` | Create | Hand-rolled searchable MultiSelect (D31): chips + ×, filter input, dropdown listbox, keyboard, ARIA, `excludeValues`, zero deps |
| `packages/ui/src/index.ts` | Modify | Export `MultiSelect` |
| `apps/web/src/routes/aportes.tsx` | Modify | Two MultiSelects ("Socios" + "Grupos") on create AND edit, pre-filled (D32); zod schema drops `aplicaGrupoId`; PUT payload sends assignments + toast/refresh on edit; per-group badges with `+N`; live hint over the multi-group union |
| `apps/web/src/routes/socios.tsx` | Modify | MultiSelect for `aporteIds` (active defs) and `grupoAdicionalIds` (`excludeValues=[grupoPrimarioId]`) replacing pill toggles (D32) |
| `apps/web/src/stores/app.store.ts` | Modify | `updateAporte` returns `Promise<GeneracionResult>` from `{ definiciones, generados }`; `addAporte` passes `grupoIds` through |
| `packages/api/test/helpers.ts` | Modify | `limpiarDatos()` deletes `aportes_definicion_grupos`; seed INSERT drops the `aplica_grupo_id` column; `crearDefinicion` overrides use `grupoIds` |
| `packages/api/test/aporte-definicion.test.ts` | Modify | `aplicaGrupoId` → `grupoIds`; NEW: multi-group POST union, PUT replace/preserve, PUT missing-only, catalog hydration, DELETE join cleanup |
| `packages/api/test/socios-aportes.test.ts` | Modify | `aplicaGrupoId` → `grupoIds`; NEW: chip def-dedup (2 groups → 1 chip, primary wins; earliest additional wins) |
| `packages/api/test/aporte-dedup.test.ts` | Modify | `aplicaGrupoId` → `grupoIds`; NEW: multi-group dedup + PUT re-save idempotency |
| `packages/api/test/aportes-generacion.test.ts` | Modify | `aplicaGrupoId` → `grupoIds` (mechanical) |
| `packages/api/test/aportes-bulk-all-pagos.test.ts` | Modify | `aplicaGrupoId` → `grupoIds` if group fixtures are used (mechanical) |

## Interfaces / Contracts

```ts
// ── packages/core/src/index.ts (deltas only) ──────────────────────────────
/** Aporte = definición de aporte. `grupoIds` reemplaza `aplicaGrupoId` (D24). */
export type Aporte = {
  id: string;
  nombre: string;
  monto: number;
  recurrencia: Recurrencia;
  inicio: string | null;
  fin: string | null;
  modalidadPago: ModalidadPago;
  grupoIds: string[];           // M:N vía aportes_definicion_grupos; [] = global
  activo: number;
};

export type AporteInput = {
  nombre: string;
  monto: number;
  recurrencia?: Recurrencia;
  inicio?: string | null;
  fin?: string | null;
  modalidadPago?: ModalidadPago;
  grupoIds?: string[];          // ausente/[] = global; cada id DEBE existir (400)
  activo?: number;
  socioIds?: string[];          // sin cambios (D18)
};

// AporteInherited y Socio: SIN cambios. CrearDefinicionResponse: REUTILIZADA para PUT (D24).
export type AporteInherited = { id: string; nombre: string; grupoId: string; grupoNombre: string };
export type CrearDefinicionResponse = { definiciones: Aporte[]; generados: GeneracionResult };

// ── packages/ui/src/components/multi-select.tsx (D31) ─────────────────────
export type MultiSelectOption = { value: string; label: string };
export type MultiSelectProps = {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  excludeValues?: string[];
};
export const MultiSelect: React.FC<MultiSelectProps>;   // exportada desde packages/ui/src/index.ts
```

**API contracts (behavior deltas):**

- `POST /api/aportes-definicion` — body gains `grupoIds?: string[]` (absent/`[]` = global; each id MUST exist else `400 { error: "grupoIds contains an invalid group" }` before any insert); `aplicaGrupoId` is no longer accepted. Target set = deduped union of `socioIds` ∪ current members (primario OR adicional) of ALL `grupoIds`. Response `201 { definiciones, generados }` with hydrated definitions.
- `PUT /api/aportes-definicion/:id` — accepts `socioIds?`/`grupoIds?`; replace-when-declared / preserve-when-omitted (mirror socios PUT); runs the dedup generator over the final set (missing only); NEVER deletes generated records; response `200 { definiciones, generados }` (was `Aporte[]`). (Supersedes D19.)
- `GET /api/aportes-definicion` — each definition carries `grupoIds: string[]` AND `socioIds: string[]` (batch).
- `DELETE /api/aportes-definicion/:id` — 409 guard unchanged (socio_aportes / aportes.aporte_id); join rows removed in the same transaction.
- `DELETE /api/grupos/:id` — new 409 branch when `aportes_definicion_grupos` references the group (`"Cannot delete: group is referenced by an aporte definition"`).
- `POST /api/socios` / `PUT /api/socios/:id` — contracts unchanged; group-scoped generation and inheritance now resolve through the join table (same observable behavior).
- `POST /api/aportes`, `/bulk`, `/bulk/all` — unchanged (retained, D17).

**Generation semantics (unchanged):** `anual` → 1..12; `mensual` → window ∩ gestión; `unico`/`extraordinario` → `[mes ?? 1]`. A socio "holds" `d` if `d ∈ socio_aportes` OR `d.grupoIds ∩ {grupoPrimarioId ∪ adicionales} ≠ ∅` (`socioHoldsAporte`, D25). Records snapshot `monto → monto_base`, `recurrencia → tipo` (D2), `aporte_id = def.id` (dedup key, D13).

## Testing Strategy

Infra unchanged: Vitest 2.1, better-sqlite3 `:memory:`, Hono `app.request()`, `helpers.ts` `migrarDb()` applies every `*.sql` sorted (0007 applies automatically).

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Migration | 0007: join table created; backfill moves `aplica_grupo_id` → join rows; re-running the backfill inserts nothing (`INSERT OR IGNORE`); column dropped; seeded defs have no join rows (global) | `filas()` raw-SQL asserts in `aporte-definicion.test.ts` + the existing `migrarDb()` bootstrap |
| Integration (api) | POST: `grupoIds: [g1]` group-scoped → records for CURRENT members at assignment + join rows + NO `socio_aportes` rows; multi-group `grupoIds: [g1, g2]` → deduped union of members (s3 in both groups → ONE record, `generados.count === 3`); `grupoIds` + `socioIds` union deduped on overlap; unknown `grupoId` → 400 (nothing created); non-array → 400; absent/`[]` → global | rework `aporte-definicion.test.ts` (replace `aplicaGrupoId` fixtures; add multi-group + union scenarios from the spec) |
| Integration (api) | PUT: replace-when-declared (both sets atomically replaced, old rows removed, already-generated records REMAIN); preserve-when-omitted (`{ monto: 80 }` keeps sets, re-save no-op `count: 0`); adding a group generates ONLY missing (existing months not duplicated, count reflects only new); id immutability; 404; response shape `{ definiciones, generados }` | NEW PUT scenarios in `aporte-definicion.test.ts` |
| Integration (api) | GET catalog: every def carries `grupoIds` + `socioIds` (batch); "d-g1" → `{ grupoIds: ["g1"], socioIds: ["s1"] }`; `ap-mensual` → `{ grupoIds: [] }` | NEW hydration scenario in `aporte-definicion.test.ts` |
| Integration (api) | DELETE: definition with join rows but no assignments/records → 200, join rows gone (no FK violation); definition with assignments/records → 409 unchanged; 404 | rework/extend DELETE scenarios in `aporte-definicion.test.ts` |
| Integration (api) | grupos DELETE: group referenced by `aportes_definicion_grupos` (no socios) → 409 with definition-specific message; unused group → 200 | NEW scenario in the groups coverage (or a focused block in `aporte-definicion.test.ts`) |
| Integration (api) | Inheritance: `aportesInherited` via join table — primary group, secondary group, both groups (two defs), def-dedup 2 groups → ONE chip with primary, def-dedup no-primary → earliest additional membership (rowid order), direct-assignment dedup, read-only chips | rework `socios-aportes.test.ts` (join fixtures + the 2 dedup scenarios from the spec) |
| Integration (api) | Socio save generation through the join table: POST socio with membership to a multi-group def → records for current gestión; re-assert → no dupes; removals never delete | extend `socios-aportes.test.ts` |
| Integration (api) | Cross-path dedup with M:N: same `(socio, aporte, mes, gestion)` never duplicated across (1) multi-group POST, (2) PUT assignment replace, (3) PUT re-save, (4) socio re-save — assert row counts + raw SQL dedup groups | extend `aporte-dedup.test.ts` |
| Integration (api) | Manual endpoints via group-scoped defs (single/bulk/bulk-all re-run dedup-safe `{ count: 0 }`) | mechanical rework in `aportes-generacion.test.ts` + `aportes-bulk-all-pagos.test.ts` |
| Manual smoke | MultiSelect in the definition modal (create + edit pre-fill, filter-as-you-type, chips + ×, keyboard, ~360px wrap, dropdown inside z-50 modal); per-group badges + `+N`; socios form MultiSelects with `excludeValues`; edit toast + cobro list refresh | dev server |

**Known suite impacts (apply must handle):** (1) every `crearDefinicion({ aplicaGrupoId: g1 })` override becomes `grupoIds: [g1]` and assertions move from `def.aplicaGrupoId` to `def.grupoIds` (helpers return the hydrated def); (2) `limpiarDatos()` must also `DELETE FROM aportes_definicion_grupos` and the seed INSERT drops the dropped column; (3) generation tests keep targeting explicit past gestions so manual endpoints still have rows to create (unchanged from the archived change); (4) `validarAporte`'s `'aplicaGrupoId is invalid'` test becomes `'grupoIds contains an invalid group'`.

## Migration / Rollout

**`0007_*.sql` — additive-first (CREATE → backfill → DROP last).** Generated with `pnpm db:generate` from the schema diff (join table + column removal); the backfill `INSERT OR IGNORE ... SELECT` is inserted manually between the CREATE and the DROP (drizzle-kit does not emit data backfills). `migrarDb()` in tests applies it automatically.

**Real-DB validation (performed, D23):** `packages/db/otb.db` — 5 definitions, 1 with `aplica_grupo_id` set (test def → group `51e17ab9-…` "Manzano A", exists → no orphan) → backfill produces exactly **1 join row**; the 4 seeded definitions are global and produce none. 222 cobro records, no dedup-key conflicts. Existing definitions all global or single-group — the DROP cannot orphan anything because the backfill ran first.

**Rollout order:** schema + migration → lib helpers → routes (definition/socios/grupos) → store/UI → tests. Everything ships in the same change — no interim state leaves the old UI pointing at a schema without `aplica_grupo_id` (the UI and routes flip together).

**Rollback (non-destructive):**
- Schema: the migration is additive-first — worst-case, skip the final DROP and keep `aplica_grupo_id` (the join table + backfill are already applied and become the source of truth); full revert = reverse-backfill `UPDATE aportes_definicion SET aplica_grupo_id = (SELECT grupo_id FROM aportes_definicion_grupos WHERE definition_id = aportes_definicion.id LIMIT 1)` for single-group rows, then DROP the join table.
- Code: revert routes/store/UI/lib/core via git; the archived single-group behavior is recoverable by restoring `validarAporte`/POST/PUT and the D21 create-only UI.
- Generated records: cobros are created additively with D13 dedup — removals NEVER delete records, so rollback leaves no destructive footprint; records generated by the new multi-group path are identifiable by `aporteId` (server UUIDs from after this change).
- Component: `multi-select.tsx` is a new file — removal is a plain revert; the old radio/checkbox/pill UI returns with the route revert.

## Open Questions

- [ ] Read-time inheritance chips (`aportesInherited`) do not filter `activo`, while generation (`definicionesDeGrupos`, D25) only considers active definitions — pre-existing inconsistency carried from the archived design (D20 note). Kept out of scope; confirm whether chips should filter `activo`.
- [ ] Definition-list badge overflow threshold chosen as "up to 3 badges, then `+N`" — trivial, adjustable at UI review.
- [ ] The UI always declares both `socioIds` and `grupoIds` on submit (replace-when-declared everywhere); preserve-when-omitted remains an API/tests contract. Confirm this is acceptable product behavior for the edit form (it matches the existing socios form, which also always declares).
- [ ] Follow-up candidates (not in this change, R4): bulk multas `socioIds`, asistencia selector, reportes selectors — same MultiSelect, trivial reuse.
