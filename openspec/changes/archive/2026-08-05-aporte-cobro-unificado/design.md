# Design: Unified Aporte Definition + Assignment + Cobro Generation (aporte-cobro-unificado)

## Technical Approach

The archived `tipos-aporte-cobros` model is **correct about the schema** — `aportes_definicion` (D1), many-to-many `socio_aportes`, definition-driven generation with no override (D8), dynamic read-time inheritance chips (D5), enforcement by estado (D9) — and **wrong about the flow**, which the user corrected (authoritative): the UI split aporte creation into two disconnected steps (definition form + a separate "Generar Cobros" section), and records were only ever materialized by those manual endpoints. The corrected behavior is a **single unified form** that defines AND assigns (to socios / a group / nobody), with **automatic generation at assignment** (definition creation, socio save, membership creation) flowing through the **same shared definition-driven generator**, plus a **mandatory dedup invariant** on `(socio, aporte, mes, gestion)` across every path.

This change is a **behavior correction, not a schema rework**:

1. **Keep** the archived architecture decisions D1–D11 (definition table, snapshot columns, window representation, read-only inherited chips, definition-driven counts, enforcement, DELETE guard, config derivation) — except D7 (client-supplied slug `id`), which is **superseded** by D14 (server-generated UUID).
2. **Move** the shared generator `generarAportes` (today private to `routes/aportes.ts`) into `lib/aportes.ts` with **dedup inside the transaction**, so every trigger — definition creation, socio create/replace, membership change, and the retained single/bulk/bulk-all endpoints — goes through one code path.
3. **Add** an additive partial unique index (migration `0006_*`) on `aportes(socioId, aporteId, mes, gestion) WHERE aporteId IS NOT NULL` as the schema-level guarantee, validated against the real DB (see D13).
4. **Rework** the API transactions (`apostes-definicion.ts` POST, `socios.ts` POST/PUT) and the UI (one unified form in `aportes.tsx`, generated-count feedback in `socios.tsx`), then rework the 4 test suites and add a cross-path dedup suite.

Domain context (PROJECT_KNOWLEDGE.md): an OTB (Organización Territorial de Base) manages socios and their periodic aportes; a "cobro" (APORTE_REGISTRO) is a materialized monthly record with `estado`/`saldoPendiente` that drives the payments flow. Records are financial data: **they are never deleted** by assignment changes — only `anulado` (soft) via the payment flow.

## Architecture Decisions

### Retained from the archived design (unchanged, D1–D11)

| # | Decision | Status in this change |
|---|----------|----------------------|
| D1 | Definition table `aportes_definicion`, core type `Aporte` | Retained as-is |
| D2 | Record keeps `tipo` + `monto_base` snapshots; `aporte_id` FK lineage (nullable) | Retained; `aporte_id` becomes the dedup key column (non-null for new records) |
| D3 | Vigencia window as TEXT `YYYY-MM-DD` `inicio`/`fin`; `mensual` N = window ∩ gestion | Retained; reused by the auto-generation paths |
| D4 | `modalidadPago` default `cuotas` | Retained |
| D5 | Read-only inherited chips resolved dynamically; `socio_aportes` join never materialized for group application | Retained for the READ path. The record-generation clause is **inverted** by D15/D16 (generation is now event-driven at assignment/membership instead of only at manual generation) |
| D6 | `recurrencia` default `mensual` on POST | Retained |
| D7 | Client-supplied slug `id`, immutable | **SUPERSEDED by D14** (server-generated UUID; client `id` ignored) |
| D7b | Record type renamed `AporteRegistro` (alias `Cobro`); `Aporte` = definition | Retained |
| D8 | Generation counts: anual→12, mensual→window∩gestion, unico/extra→1; reuse transactional bulk pattern; `{ count, items }` response | Retained; the transactional pattern moves to `lib/aportes.ts` and gains dedup (D13) |
| D9 | Enforcement by estado via `cargarPermisosPorEstado`/`permite(...,'aportes')`; single create 409 | Retained for the manual endpoints. The **auto-generation paths exclude non-permitted socios silently** (assignment kept, 0 records, no 409) — see D15/D16 |
| D10 | DELETE guard 409 (socio_aportes reference OR `aportes.aporte_id` reference) | Retained as-is |
| D11 | `aporteMensualBase` derived from first active definition | Retained as-is |

### Decision: Default `gestion` for auto-generation (D12)

**Choice**: Auto-generation uses `new Date().getFullYear()` (the current calendar year) as `gestion`, with **no `mes` override** at creation.

**Alternatives considered**:
- `config.gestionActual` from `modules_config` ("otb-core") — rejected: it is a stored legacy value (currently `2025`) that the OTB must manually keep current; it drifts from reality and is not what the manual endpoints use.
- Accepting a `mes`/`gestion` field in the creation body — rejected: the spec explicitly forbids a `mes` override at creation ("for the CURRENT gestión (no `mes` override at creation)").

**Rationale**: Consistency with the existing shared generator — `validarGestionMes()` in `routes/aportes.ts` already defaults `gestion` to `new Date().getFullYear()` for single/bulk/bulk-all. Using the same default keeps every generation path (manual + auto) on identical semantics: the definition's window is evaluated against the real current year. A definition whose window does not intersect the current year legitimately generates 0 records (existing window-expired behavior); the UI surfaces this with a live count hint (see D21) and a 0-record generation is a valid success.

### Decision: Dedup guarantee — partial unique index + app-level SELECT-before-INSERT (D13)

**Choice**: **Adopt both layers**:
1. **App-level (primary)**: inside every generation transaction, `generarAportes` runs a SELECT-before-INSERT on `(socioId, aporteId, mes, gestion)` and skips existing rows; the response counts **only newly inserted rows**. Optionally the insert also uses `onConflictDoNothing()` (defense-in-depth when the index exists).
2. **Schema-level (backstop)**: additive partial unique index `aporte_dedup_unico ON aportes (socio_id, aporte_id, mes, gestion) WHERE aporte_id IS NOT NULL` via migration `0006_*`.

**Alternatives considered**:
- App-level dedup only (no index) — rejected: protects only paths that go through `generarAportes`; any future raw-SQL or missed path can still duplicate, and the invariant could not be proven at the schema level.
- Index only (no SELECT) — rejected: without the SELECT the generator would have to rely on `onConflictDoNothing` + row-count inspection to know whether a row was actually inserted; the SELECT keeps the "count only new rows" response simple and makes the code readable.
- Global unique index without `WHERE aporte_id IS NOT NULL` — rejected: existing legacy records have `aporte_id IS NULL` and may legitimately repeat `(socio_id, mes, gestion)` (pre-lineage data); the partial index deliberately scopes the guarantee to lineage-bearing records.

**Rationale**: SQLite (better-sqlite3) is a synchronous, single-connection, single-writer store — SELECT-before-INSERT inside a `db.transaction()` is **race-free**, so the app-level check alone is airtight for this stack. The index is the belt-and-suspenders guarantee that makes the invariant provable regardless of code path, and it is cheap (partial, small table). **Data validation performed against the real DB** (`packages/db/otb.db`): 219 records total, **0 with `aporte_id IS NOT NULL`**, 0 duplicate `(socio_id, aporte_id, mes, gestion)` groups → creating the index cannot conflict with existing data. The migration is purely additive and droppable at will.

### Decision: Definition `id` becomes server-generated UUID (D14 — supersedes D7)

**Choice**: `POST /api/aportes-definicion` always sets `id = crypto.randomUUID()`. A client-supplied `id` in the body is **IGNORED** (never validated, never rejected, never stored). The duplicate-id pre-check is removed. `PUT`/`DELETE` keep using the route param and `PUT` keeps ignoring a body `id` (unchanged from D7).

**Alternatives considered**: Keep the client slug (status quo, D7) — rejected by the user's authoritative decision (b): "The aporte id is generated by the server (UUID). The user never chooses a slug." Seeded slugs (`ap-mensual`, `ap-familiar`, `ap-jubilado`, `ap-honorario`) remain as the stable internal ids of the seeded definition **rows** (they are seed data, not client inputs).

**Rationale**: The UI no longer asks for an id; tests and consumers reference definitions by the id returned in the response. Ignoring (rather than rejecting) a stray `id` keeps the API backward-tolerant for old clients. `aporteDefActivoDefault()` already resolves by rowid-first-active (not slug format), so nothing in the codebase derives behavior from slug patterns.

### Decision: POST definition = one transaction: insert + assign + generate (D15)

**Choice**: `POST /api/aportes-definicion` accepts `socioIds?: string[]` alongside the existing fields and runs a single `db.transaction()` that:
1. validates the body (existing `validarAporte`) **and** `socioIds` (each id MUST reference an existing socio, else `400` — D18; no definition is created);
2. inserts the definition with `id = crypto.randomUUID()` (D14);
3. inserts `socio_aportes` rows for every `socioId` (direct assignment);
4. resolves the **target set** = `socioIds` ∪ (when `aplicaGrupoId` is set) the group's **current members** (primary membership `socios.grupoPrimarioId = g` OR additional membership via `socio_grupos.grupoId = g`), deduplicated by socioId (overlap generates once);
5. loads the target socios (`id, estadoId, grupoPrimarioId`) + their additional groups, and filters to those whose estado `permite(...,'aportes')` (**bulk-exclusion**: non-permitted keep the assignment but generate 0 records; the request is `201`, never `409` — and unlike `/bulk`, **never `400`** even if none are eligible);
6. calls the shared dedup generator for **this definition only**, `gestion = new Date().getFullYear()` (D12), no `mes`, passing in-memory direct maps (direct assignees hold the def via the just-inserted `socio_aportes`; group members hold it via `socioHoldsAporte`);
7. responds `201 { definiciones, generados: { count, items } }` where `definiciones` is the **full definitions list** (keeps the catalog derivable and the store's replace-list pattern) and `generados` reports only newly inserted rows.

**Alternatives considered**: Two-step (create definition → separate generation call) — rejected by the user's authoritative decision (a): one single form, one transaction. Generating outside the transaction — rejected: assignment and records must be atomic (spec "in the same transaction").

**Rationale**: This maps the spec `aporte-definitions` scenarios one-to-one: "a nadie" (no `socioIds`/`aplicaGrupoId`) → 0 records; `socioIds` only → direct records; `socioIds` + `aplicaGrupoId` → union deduplicated; group-only → records for **current members at assignment** and **no `socio_aportes` rows** (the join stays dynamic, D5 read path); unknown `socioId` → 400 with nothing created; non-permitted → assignment kept, 0 records.

### Decision: Socio POST/PUT generate in the same transaction (D16)

**Choice**: The socio `POST` and `PUT` handlers run the dedup generator **inside the same transaction** that persists the final assignment/membership set, over the union of:
- (a) the **direct** assignments — `definicionesPorIds(final aporteIds)` (the final `aporteIds` after the atomic replace / preservation semantics), and
- (b) the **group-scoped** definitions of the final membership set — `definicionesDeGrupos(final grupoPrimarioId ∪ final grupoAdicionalIds)` (D20),

deduplicated by definition id. Generation is scoped to the socio: if its estado does not `permitir 'aportes'`, the assignment is kept and 0 records are generated (no 409 — D9 exception for auto paths). Removals (unassign, leave group) **never delete** already-generated records. The response is the standard `armarSocio` shape **plus** `generados: { count: number }` (only newly inserted rows).

For `PUT`, the "final" sets are computed in memory before the transaction: `aporteIds` = declared `aporteIds` (when present) **else** the preserved existing `socio_aportes`; `grupoAdicionalIds` = declared **else** preserved `socio_grupos`; `grupoPrimarioId` = declared **else** preserved. Because generation is deduped, a re-save with no changes is a no-op (`count: 0`), adding a new aporte/membership generates **only the missing** records, and re-asserting a membership never duplicates — matching the spec `payments`/`socios-estados` scenarios.

**Alternatives considered**: Generating only when the request explicitly declares assignments — rejected: the spec requires idempotent re-saves and membership re-assertions to be safe no-ops, and "PUT without aporteIds preserves" must still generate nothing new; running the generator unconditionally over the final set with dedup is simpler and provably safe. A separate generation endpoint after socio save — rejected (same two-step anti-pattern as D15).

**Rationale**: This is the single hook that implements "generation at membership time" for **future** members of a group-scoped definition (decision d in the proposal): membership mutations flow only through socio POST/PUT (there is no standalone group-membership endpoint — `grupos.ts` is unchanged), so the socio save transaction is the natural membership-time trigger.

### Decision: Retention of single/bulk/bulk-all endpoints (D17)

**Choice**: **Retain** `POST /api/aportes`, `/bulk`, `/bulk/all` at the API level, now **dedup-safe** (they flow through the same dedup generator). Only their UI entry point (the "Generar Cobros" section) is removed. Removal of the endpoints themselves is **deferred to the user**.

**Alternatives considered**: Remove the endpoints — rejected (deferred): tests and catch-up generation (e.g. backfilling a past gestión when a definition's window is extended) may still use them; the proposal explicitly defers the removal decision to the user.

**Rationale**: With auto-generation at assignment, direct-assignment re-runs for the current year naturally return `{ count: 0 }` (already materialized); the endpoints keep their value for **catch-up generation of other gestions** and API-level completeness. Re-running any of them must never duplicate — this is the `payments` spec dedup scenarios.

### Decision: `socioIds` validation on POST definition (D18)

**Choice**: Each entry of `socioIds` MUST reference an existing socio, else the request is rejected with `400` **before any insert** (no definition, no assignments, no records).

**Alternatives considered**: Silently ignoring unknown ids — rejected: an unknown id is a client error and silent skipping would hide typos while still creating the definition.

**Rationale**: Mirrors the existing `aporteIds` validation on socio POST/PUT ("aporteIds contains an invalid aporte" → 400) and the spec scenario "Create with an unknown socioId is rejected". Error message shape: `{ error: "socioIds contains an invalid socio" }`.

### Decision: PUT /api/aportes-definicion/:id is field-edit only (D19)

**Choice**: `PUT /:id` **only** updates the definition's editable fields (validation identical to POST per the current implementation). It does **NOT** accept `socioIds`, does **NOT** change assignments, and does **NOT** trigger generation. Assignments happen at creation or via the socio form.

**Alternatives considered**: PUT re-running generation (e.g. when `fin`/`monto` changes) — rejected: the spec is explicit ("field edit only; assignments and generation happen at creation or via the socio form") and re-generating on edit would silently materialize records for existing assignments — a scope creep with financial implications.

**Rationale**: Keeps PUT idempotent and side-effect-free; the `monto` snapshot (D2) already means editing a definition never rewrites existing records' amounts.

### Decision: `definicionesDeGrupos(grupoIds)` helper (D20)

**Choice**: New helper in `lib/aportes.ts`: `definicionesDeGrupos(grupoIds: string[]): Aporte[]` — resolves the **active** definitions whose `aplicaGrupoId` ∈ `grupoIds` (batch `inArray`, single query), used by the socio-save generation (D16) to compute the group-scoped half of the union.

**Alternatives considered**: Reusing the read-time `aportesInheritedPorSocio` (which does not filter `activo`) — rejected: generation must only apply to **active** definitions, consistent with direct-assignment rules (`validarAporteIds` rejects inactive) and `validarDefinicionesActivas`. An inactive group definition stops generating for new members while already-generated records remain (never deleted).

**Rationale**: One batch query, no N+1, reuses the `socioHoldsAporte` applicability predicate at generation time. Note (Open Questions): the read-time inheritance chips currently do NOT filter `activo` — a pre-existing inconsistency kept out of scope; with this decision a member may still see a chip for an inactive definition but no new records (same as today's behavior, minus the inversion).

### Decision: UI "Asignar a" is exclusive modes; API supports the union (D21)

**Choice**: In the unified form, the "Asignar a" section is a three-option radio group — **"a nadie"** (default; payload has neither `socioIds` nor `aplicaGrupoId`), **"a socios"** (multiselect of socios whose estado permits `aportes`, reusing the existing `permitidos` filter → `socioIds`), **"a un grupo"** (single group select → `aplicaGrupoId`). The three modes are mutually exclusive in the UI. The API keeps accepting `socioIds` and `aplicaGrupoId` **simultaneously** (union semantics, spec scenario "Create with socioIds and aplicaGrupoId").

**Alternatives considered**: A UI that allows combining socios + group — rejected: the user's product decision (a) describes three assignment intents ("to socios", "to a group", "to nobody"); a single radio keeps the form simple. The API union remains for flexibility and the spec.

**Rationale**: The union is cheap to support server-side (D15 target-set resolution dedupes overlap), and the exclusive UI matches the product intent without overloading the form.

### Decision: Generated-count feedback is a minimal local toast (D22)

**Choice**: `aportes.tsx` and `socios.tsx` show a small self-contained inline toast ("Se generaron N cobro(s)") implemented with local component state + a fixed-position banner that auto-dismisses (~3s), with `role="status"`/`aria-live="polite"`. No new dependency.

**Alternatives considered**: Adding a shared `Toast` component to `@otb/ui` — rejected for this change (no toast infra exists today; the app currently uses `alert()`); noted as a follow-up option. Keeping `alert()` — rejected: the proposal explicitly calls for a toast, and a modal alert is heavier feedback than a generated-count notification warrants.

**Rationale**: Matches the codebase's zero-dependency, component-local pattern; the count is transient, non-blocking information. Accessibility is preserved via `aria-live`.

## Data Flow

```
1) DEFINITION CREATION WITH ASSIGNMENT  (POST /api/aportes-definicion, ONE transaction)
   body { nombre, monto, recurrencia, inicio, fin, modalidadPago, aplicaGrupoId?, activo?, socioIds? }
        │  id in body → IGNORED (D14); socioIds validated → 400 if unknown (D18)
        ▼
   tx: ┌ insert aportes_definicion (id = crypto.randomUUID())
       ├ for socioId of socioIds → insert socio_aportes (socioId, newId)      [direct join]
       ├ targetSet = socioIds ∪ (aplicaGrupoId ? currentMembers(g) : ∅)        [dedup by socioId]
       ├ permitidos = filter(targetSet, permite(estadoId, 'aportes'))          [bulk-exclusion]
       ├ directos  = Map(socioId → [newId]) for direct assignees; [] for group-only members
       ├ grupos    = gruposAdicionalesPorSocio(targetSet)
       └ generarAportes(tx, permitidos, [newDef], directos, grupos, gestion = YEAR)
            └ per (socio × def held): months = mesesParaDefinicion(def, gestion)
                └ per month: SELECT-before-INSERT on (socio, def, mes, gestion) → skip if exists
   └ 201 { definiciones: [full list], generados: { count, items } }

2) SOCIO SAVE — CREATE / REPLACE  (POST|PUT /api/socios[/:id], ONE transaction)
   POST: insert socios + socio_grupos + socio_aportes (declared sets)
   PUT : update fields + replace socio_grupos (if declared) + replace socio_aportes (if declared)
        final aporteIds      = declared ?? preserved existing
        final grupoAdicional = declared ?? preserved existing
        final grupoPrimario  = declared ?? preserved existing
   defs = union( definicionesPorIds(final aporteIds)            [direct, active]
               , definicionesDeGrupos(final grupoPrimario ∪ final grupoAdicional) )   [D20]
        → dedup by definition id
   if permite(final estadoId, 'aportes'):
       generarAportes(tx, [socio], defs, Map[[id, final aporteIds]],
                      Map[[id, final grupoAdicional]], gestion = YEAR)   [dedup → only missing]
   └ response: armarSocio(...) + generados: { count }           [removals never delete records]

3) SHARED DEDUP GENERATOR  (lib/aportes.ts — single code path for every trigger)
   generarAportes(tx, socios, definiciones, directos, gruposAdicionales, gestion, mes?)
     socios ──permitted-by-estado──► per (socio × def "held": direct OR inherited-by-group)
       ──► meses = anual→1..12 | mensual→window∩gestion | unico/extra→[mes ?? 1]
       ──► per month: SELECT (socio_id, aporte_id, mes, gestion) EXISTS? ─no─► INSERT (+ onConflictDoNothing)
                                                                             └─yes─► SKIP (not counted)
     returns AporteGenerado[] (only NEW rows)

4) READ PATH (unchanged)  GET /api/socios, /:id
   aporteIds = socio_aportes (direct, editable)  +  aportesInherited (dynamic, read-only, D5)
   → chips in socios.tsx; "Generar Cobros" section in aportes.tsx REMOVED (D21)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/core/src/index.ts` | Modify | `AporteInput` **drops `id`**, gains `socioIds?: string[]`; new `AporteGenerado` (item shape) + `GeneracionResult { count, items }`; new `CrearDefinicionResponse { definiciones, generados }`; `Socio` gains optional `generados?: { count: number }` (response-only on POST/PUT saves); new `SocioConGeneracion = Socio & { generados: { count: number } }`. `BulkAporteRequest`/`CrearAporteRequest` unchanged (endpoints retained, D17) |
| `packages/api/src/lib/aportes.ts` | Modify | **Move** `generarAportes`, `mesesParaDefinicion`, `aportesDirectosPorSocio`, `gruposAdicionalesPorSocio`, `validarGestionMes`, `validarDefinicionesActivas` here from `routes/aportes.ts` (exported). `generarAportes` gains SELECT-before-INSERT dedup + `onConflictDoNothing()` (D13). **New** `definicionesDeGrupos(grupoIds)` (D20) and `definicionesPorIds(ids)` helpers. Keep `aporteDefPorId`, `aporteDefActivoDefault`, `mesesDefinicion`, `socioHoldsAporte` |
| `packages/api/src/routes/aportes.ts` | Modify | Import the shared helpers from `lib/aportes.ts`; delete the local copies. Single/bulk/bulk-all behavior unchanged except they now dedup on re-run (D17). `GET /:id/pagos`, pay/anular, PUT unchanged |
| `packages/api/src/routes/aportes-definicion.ts` | Modify | `POST`: validate `socioIds` (D18); `id = crypto.randomUUID()` ignoring body `id` (D14); one transaction insert → `socio_aportes` → resolve target set → filter permitted → dedup-generate for current year (D15); response `201 { definiciones, generados }`. `PUT`/`DELETE` unchanged (D19, D10). Remove the duplicate-id 400 check |
| `packages/api/src/routes/socios.ts` | Modify | `POST`/`PUT`: run the dedup generator inside the existing persistence transaction over the final assignment ∪ membership set (D16); compute "final" sets in memory (declared ?? preserved) for PUT; add `generados: { count }` to both responses. `baja`/`DELETE` unchanged (no generation). `validarAporteIds`/`validarGrupos` unchanged |
| `packages/db/src/schema/aportes.ts` | Modify | Declare the partial unique index (D13) via drizzle: `uniqueIndex('aporte_dedup_unico').on(t.socioId, t.aporteId, t.mes, t.gestion).where(sql\`${t.aporteId} IS NOT NULL\`)` |
| `packages/db/drizzle/0006_*.sql` | Create | Additive partial unique index (generated with `pnpm db:generate` so the journal + snapshot stay in sync) — see Migration/Rollout |
| `apps/web/src/stores/app.store.ts` | Modify | `addAporte` sends the new payload (no `id`; `socioIds`/`aplicaGrupoId`), stores `definiciones` from `{ definiciones, generados }` and **returns** `generados` (count for the toast). `createSocio`/`updateSocio` return `SocioConGeneracion` and call `fetchAporteRegistros()` after a successful save so cobros appear immediately. `AporteBulkResult` alias replaced by core `GeneracionResult`. `createAportesBulk`/`createAportesBulkAll` kept (API retention, D17) |
| `apps/web/src/routes/aportes.tsx` | Modify | The "Crear" tab becomes **one unified form**: existing definition fields + an "Asignar a" section (radio: a nadie / a socios multiselect of `permitidos` / a un grupo select) (D21); **no `id` input** (kept read-only when editing); **live cobro-count hint** for the current gestión (client-side months × target socios, dedup may reduce it) before submit; after submit a **generated-count toast** (D22), close, and `fetchAporteRegistros()` refresh. The standalone "Generar Cobros" section (generarForm, allSocios, handleGenerar, toggleDefinicion/toggleSocio) is **removed**. "Pagar" tab, definition list, edit/delete (409 guard) unchanged |
| `apps/web/src/routes/socios.tsx` | Modify | `onSubmit` reads `generados.count` from the create/update response and shows the toast "Se generaron N cobro(s)" (D22); multiselect + chips unchanged; cobro list refresh handled by the store |
| `packages/api/test/helpers.ts` | Modify | `crearDefinicion` returns the created definition (server UUID) so suites stop hardcoding `id`; note that `crearSocio` now triggers auto-generation (tests must target gestions/defs whose records were not already materialized) |
| `packages/api/test/aporte-definicion.test.ts` | Modify | Rework POST scenarios: server UUID + ignored client `id` (remove the duplicate-id 400 test), `socioIds` assignment, union direct ∪ group dedupe, "a nadie" → 0 records, unknown `socioId` → 400, non-permitted → assignment kept 0 records, group-scoped generates for current members at assignment, response shape `{ definiciones, generados }`. PUT/DELETE scenarios unchanged |
| `packages/api/test/socios-aportes.test.ts` | Modify | Response includes `generados.count`; socio-save generation scenarios; **invert** "a future member inherits without materialization" (records SHALL be generated at membership time); PUT replace never deletes records; PUT adding an aporte generates only missing; re-save idempotent (count 0) |
| `packages/api/test/aportes-generacion.test.ts` | Modify | Use server-generated definition ids (via helper) instead of hardcoded slugs; ensure each test targets a `gestion`/definition whose records were **not** auto-generated at socio creation (prefer explicit past gestions, e.g. 2025); add single re-run dedup scenario |
| `packages/api/test/aportes-bulk-all-pagos.test.ts` | Modify | Same id/gestion handling; add bulk and bulk/all re-run dedup-safe scenarios (`{ count: 0 }`, no duplicates); `/pagos` suite unchanged |
| `packages/api/test/aporte-dedup.test.ts` | Create | Cross-path dedup invariant matrix (see Testing Strategy) |
| `grupos.ts`, `config.ts`, `config.tsx`, seed, catalogo | No change | Membership mutations flow through socio POST/PUT (D16 note); config derivation unchanged (D11) |

## Interfaces / Contracts

```ts
// ── packages/core/src/index.ts (deltas only) ──────────────────────────────
/** AporteInput: id is SERVER-generated now (D14); POST accepts socioIds (D15). */
export type AporteInput = {
  nombre: string;
  monto: number;
  recurrencia?: Recurrencia;        // default 'mensual' (D6)
  inicio?: string | null;
  fin?: string | null;
  modalidadPago?: ModalidadPago;    // default 'cuotas' (D4)
  aplicaGrupoId?: string | null;    // group-scoped: current members generate at assignment
  activo?: number;                  // default 1
  socioIds?: string[];              // NEW: direct assignment (multiselect); each MUST exist (D18)
};

/** Item shape already returned by the manual generation endpoints (moved to core). */
export type AporteGenerado = {
  id: string;
  socioId: string;
  aporteId: string | null;
  mes: number;
  gestion: number;
  tipo: string;
  montoBase: number;
};
export type GeneracionResult = { count: number; items: AporteGenerado[] };

/** 201 response of POST /api/aportes-definicion (D15). */
export type CrearDefinicionResponse = {
  definiciones: Aporte[];           // FULL catalog (contains the new definition)
  generados: GeneracionResult;      // only NEW rows (D13)
};

/** Socio response on POST/PUT saves: standard shape + generated count (D16). */
export type SocioConGeneracion = Socio & { generados: { count: number } };
// `Socio` gains: generados?: { count: number }   // optional; only on save responses
```

**API contracts (behavior deltas):**

- `POST /api/aportes-definicion` — body `{ nombre, monto, recurrencia?, inicio?, fin?, modalidadPago?, aplicaGrupoId?, activo?, socioIds? }`; `id` in body IGNORED; unknown `socioId` → `400 { error: "socioIds contains an invalid socio" }` (nothing created); success `201 { definiciones, generados }`; generation scoped to socios whose estado permits `aportes`, `gestion = new Date().getFullYear()`, no `mes`.
- `POST /api/socios` / `PUT /api/socios/:id` — responses are the standard socio shape **plus** `generados: { count }`; `PUT` preserves assignments/memberships when the body omits them; removals never delete records; non-permitted estado → assignment kept, 0 records, no 409.
- `POST /api/aportes`, `/bulk`, `/bulk/all` — unchanged contracts, now dedup-safe on re-run (D17).
- `PUT /api/aportes-definicion/:id` — field edit only, no side effects (D19); `DELETE` guard 409 unchanged (D10).

**Generation semantics (unchanged from D3/D8, now also the auto paths):** `anual` → months 1..12; `mensual` → `mesesDefinicion(def, gestion, mes?)` = months in `[inicio..fin] ∩ gestion`; `unico`/`extraordinario` → `[mes ?? 1]`. A socio "holds" `d` if `d ∈ socio_aportes` OR `d.aplicaGrupoId ∈ { grupoPrimarioId ∪ additional groups }` (`socioHoldsAporte`). Records snapshot `monto → monto_base`, `recurrencia → tipo` (D2) and set `aporte_id = def.id` (dedup key).

## Testing Strategy

Infra unchanged: Vitest 2.1, better-sqlite3 `:memory:`, Hono `app.request()`, `helpers.ts` `migrarDb()` runs every `*.sql` sorted (so `0006_*` applies automatically in the in-memory DB).

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Integration (api) | POST definition: server UUID, body `id` ignored, "a nadie" → 0 records, `socioIds` direct generation with per-month count, union direct ∪ group deduped on overlap, unknown `socioId` → 400 (no definition), non-permitted socio → assignment kept + 0 records + 201 (no 409), group-scoped → records for CURRENT members at assignment + no `socio_aportes` rows, response `{ definiciones, generados }` | rework `aporte-definicion.test.ts` (remove dup-id 400; add ignored-id + assignment + generation scenarios) |
| Integration (api) | Definition PUT field-edit only (no assignment/generation side effects, id immutability, 404) and DELETE guard 409 (unchanged D10/D19) | keep in `aporte-definicion.test.ts` |
| Integration (api) | Socio POST/PUT: response `generados.count`; POST with `aporteIds` generates records; POST without → `[]`; invalid/inactive/non-array ids → 400 (unchanged); non-permitted → 0 records; PUT atomic replace without deleting records; PUT adding an aporte generates ONLY missing; re-save idempotent (count 0); membership-time generation (socio joins group with scoped definition → records; re-assert → no dupes); membership removal → no record deletion; read-only inherited chips unchanged | rework `socios-aportes.test.ts` — **invert** the "future member inherits without materialization / NO records by membership" assertions |
| Integration (api) | Single endpoint: window counts, anual 12, unico/extra 1, inherited applicability, `monto` 400, inactive 400, not-held 400, estado 409 (all unchanged); **new**: re-run for already-materialized `(socio, def, mes, gestion)` → `{ count: 0 }`, no duplicates | rework `aporte-generacion.test.ts` — use server-generated ids (helper returns the created def); target gestions not auto-generated at socio creation |
| Integration (api) | Bulk/bulk-all: definition-driven counts, estado exclusion, no-eligible 400, reject override (unchanged); **new**: bulk re-run dedup-safe `{ count: 0, items: [] }`; `/pagos` preserved (ingreso, excludes anulado, 404) | rework `aportes-bulk-all-pagos.test.ts` |
| Integration (api) | **Cross-path dedup invariant**: the same `(socio, aporte, mes, gestion)` never exists after any combination of (1) definition creation with `socioIds`, (2) socio POST/PUT re-save, (3) membership re-assertion, (4) bulk/bulk-all re-run — assert row counts and raw SQL dedup groups; "a nadie" creation → 0 records then assigned later via socio form → records appear | **new** `aporte-dedup.test.ts` (idempotency matrix) |
| Manual smoke | Unified form on `aportes.tsx` (definition fields + "Asignar a" radio, live count hint, generated-count toast, no id input, no "Generar Cobros" section); `socios.tsx` save toast + cobro list refresh; definition list/edit/delete; "Pagar" tab; ~360px wrapping | dev server |

**Known test-suite impacts (must be handled in apply):** (1) `crearDefinicion({ id: 'ap-ventana', ... })` style overrides break — the server UUID means tests must read the created definition from the response; (2) `crearSocio` now auto-generates records for the current year — generation tests must target explicit past gestions (e.g. 2025) or definitions whose window doesn't cover the current year, so the manual endpoints still have rows to create; (3) `limpiarDatos()` already clears `aportes`/`socio_aportes` before each test — no cross-test pollution.

## Migration / Rollout

**`0006_*.sql` — additive only (no drops, no data rewrites).** Declare the partial unique index in `packages/db/src/schema/aportes.ts` and generate with `pnpm db:generate` (keeps `meta/_journal.json` + snapshot in sync; the test helper `migrarDb()` picks it up automatically because it applies every `*.sql` sorted):

```sql
-- 0006_* — Dedup invariant for lineage-bearing cobro records (D13).
-- Additive: existing legacy records have aporte_id NULL and are NOT covered.
CREATE UNIQUE INDEX `aporte_dedup_unico` ON `aportes` (`socio_id`, `aporte_id`, `mes`, `gestion`) WHERE `aporte_id` IS NOT NULL;
```

**Data-dedup pre-check**: verified against the real DB (`packages/db/otb.db`): 219 records, 0 with `aporte_id IS NOT NULL`, 0 duplicate `(socio_id, aporte_id, mes, gestion)` groups → the index cannot conflict. For hypothetical installs with dupes, `CREATE UNIQUE INDEX` fails loudly (fail-fast) and the operator runs a one-off dedup before applying — documented in the migration comment. (Fresh installs: nothing to dedupe.)

**Rollout order**: schema + migration → lib generator + routes → store/UI → tests. The endpoints and UI ship together (same change), so no interim state leaves the "Generar Cobros" UI pointing at non-generating endpoints.

**Rollback** (non-destructive): revert routes/store/UI via git; the partial index is a single additive migration revert; no records are deleted by the change — cobro records created by auto-generation carry `aporteId` = UUIDs created after this change and `gestion` = the target year, so a one-off cleanup could remove them if the change is reverted (they have no payments in the window of the change).

**Not retroactive**: existing definitions/socios are NOT retroactively regenerated; generation applies to assignments made after this change (out of scope per proposal; flag if needed).

## Open Questions

- [ ] Read-time inheritance chips (`aportesInherited`) do not filter `activo`, while generation (`definicionesDeGrupos`, D20) only considers active definitions — a pre-existing inconsistency (chips may show an inactive definition with no new records). Kept out of scope; confirm whether chips should also filter `activo`.
- [ ] Removal of `POST /api/aportes`, `/bulk`, `/bulk/all` — retained (D17); deferred to the user.
- [ ] Toast implementation — minimal local inline toast (D22) chosen; adding a shared `Toast` component to `@otb/ui` is a possible follow-up.
