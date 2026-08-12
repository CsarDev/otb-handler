# Proposal: Multi-Group Aporte Assignment + Searchable MultiSelect (aporte-multigrupo-multiselect)

## Intent

Two coupled problems in the aporte assignment flow:

1. **Model limitation (confirmed user decision)**: a definition of aporte can only apply to ONE group (`aporta_definicion.aplica_grupo_id`, singular nullable FK). The user confirmed a definition MUST apply to SEVERAL groups at once — an M:N relationship. Today this forces workarounds (duplicate definitions per group, or direct socio assignment).

2. **UX limitation**: the "Asignar a" control is a radio (a nadie / a socios / a un grupo) + a checkbox scrollbox + a single-group `<select>`, and it only appears on CREATE — EDIT mode is field-edit only (archived D19), so assignment cannot be corrected after creation. The socio form uses pill toggles that also scale poorly with many options. The user wants ONE compact, searchable MultiSelect (filter-as-you-type + removable chips with an × icon) reused across every multi-selection form.

The archived `aporte-cobro-unificado` change (implemented and verified) is the base: decisions D12–D22 stand, and the D13 dedup invariant ("never duplicate a record for the same (socio, aporte, mes, gestion) across all generation paths") is preserved verbatim. This change supersedes D19 (PUT field-edit only → PUT edits assignments too) and D21 (Asignar a only on create → Asignar a on create AND edit).

## Scope

### In Scope
- **Schema — M:N join table** (`packages/db/src/schema/aportes-definicion-grupos.ts` NEW + `schema.ts` export + `aporta-definicion.ts` modified): `aportes_definicion_grupos (definition_id, grupo_id)` composite PK, both FKs, mirroring `socio_grupos` exactly. Additive migration `0007` (next after 0006): CREATE join table → backfill `INSERT OR IGNORE ... SELECT id, aplica_grupo_id FROM aportes_definicion WHERE aplica_grupo_id IS NOT NULL` → `ALTER TABLE aportes_definicion DROP COLUMN aplica_grupo_id` (pattern proven in 0005, which dropped FK column `tipo_aporte_id`; verified working with `foreign_keys=ON`). Empty `grupoIds` = global (current `aplicaGrupoId IS NULL` semantics).
- **Core types** (`packages/core/src/index.ts`): `Aporte.aplicaGrupoId: string | null` → `grupoIds: string[]` (empty = global); `AporteInput.aplicaGrupoId?` → `grupoIds?: string[]`; `AporteInherited` shape UNCHANGED `{ id, nombre, grupoId, grupoNombre }` (def-dedup, see R2); `Socio` shape unchanged.
- **API lib** (`packages/api/src/lib/aportes.ts`): `socioHoldsAporte` → set-intersection of `def.grupoIds` vs socio primary/additional groups; `definicionesDeGrupos(grupoIds)` → join query on the new table (`activo=1`); definition rows hydrated with `grupoIds` (batch, no N+1) wherever `Aporte` rows are returned; `generarAportes` unchanged (D13 dedup already in place).
- **API routes**:
  - `aportes-definicion.ts`: `validarAporte` accepts `grupoIds[]` (each must exist; absent/[] = global); POST target-set = union of CURRENT members of ALL `grupoIds` (primario OR adicional, dedup by socio); PUT accepts `socioIds?`/`grupoIds?` with replace-when-declared / preserve-when-omitted semantics (mirroring socios PUT), runs the dedup generator on the final set, NEVER deletes generated records, response becomes `{ definiciones, generados }` (was `Aporte[]`); GET catalog hydrates `grupoIds` + `socioIds` per definition (needed for faithful edit pre-fill); DELETE removes the definition's join rows in the same transaction (FK-owned metadata; 409 guard on `socio_aportes`/registros unchanged).
  - `socios.ts`: `aportesInheritedPorSocio` resolves through the join table with def-dedup (first matching group, stable order); POST/PUT socio logic unchanged (they consume hydrated defs).
  - `grupos.ts`: DELETE guard adds a check on `aportes_definicion_grupos.grupoId` → 409 (fixes the current orphan-FK gap: today `aplica_grupo_id` references are NOT guarded).
- **UI component** (`packages/ui/src/components/multi-select.tsx` NEW + export in `packages/ui/src/index.ts`): hand-rolled searchable MultiSelect — filter input, dropdown listbox, removable chips with lucide `X`, keyboard nav (↑/↓/Enter/Escape), ARIA (`listbox`/`option`, `aria-selected`), zero new deps (lucide-react already present). Props: `{ options: {value,label}[], selected: string[], onChange, placeholder?, searchPlaceholder?, emptyLabel?, disabled?, excludeValues? }`. Renders inside the hand-rolled z-50 modal (dropdown positioned within the control).
- **Route integration** (`apps/web/src/routes/aportes.tsx`, `apps/web/src/routes/socios.tsx`, `apps/web/src/stores/app.store.ts`): "Asignar a" becomes two MultiSelects (Socios + Grupos) shown on create AND edit (edit pre-filled from `a.grupoIds` + `a.socioIds`); socio form replaces pill toggles with the MultiSelect for `aporteIds` and `grupoAdicionalIds` (with `excludeValues=[grupoPrimarioId]`); `updateAporte` sends `socioIds`/`grupoIds` and surfaces the generated count (edit toast).
- **Tests** (`packages/api/test/`): update `helpers.ts` seed to the join table; rework the 5 existing suites' single-group scenarios (`aporte-definicion.test.ts`, `socios-aportes.test.ts`, `aporte-dedup.test.ts`, `aportes-generacion.test.ts`, `aportes-bulk-all-pagos.test.ts`); NEW coverage: multi-group assignment, PUT replace/preserve semantics, groups DELETE 409 via join, catalog hydration, definition DELETE join cleanup, chip def-dedup.
- **Specs deltas** (spec phase): modify `openspec/specs/aporte-definitions`, `openspec/specs/socios-estados`, `openspec/specs/grupos`; `payments` invariant (D13) unchanged.

### Out of Scope
- **Bulk multas `socioIds` selector** — follow-up candidate (same MultiSelect, trivial reuse) but NOT in this change.
- **Asistencia selector / reportes selectors** (balance/libro/socio-resumen filters) — follow-up candidates, NOT in this change.
- **`POST /api/aportes`, `/bulk`, `/bulk/all`** — retained as-is (dedup-safe since archived change); no UI entry point.
- **Retroactive generation** — no re-generation of past records; migration backfill covers assignment metadata only.
- **Payments / anulación / partial payment flows** — untouched.
- **Definition `id` handling, seeded slugs (`ap-mensual` etc.)** — unchanged (server UUID on create, D14).
- **Reports/dashboard/egresos/notifications/export** — untouched.

## Product Decisions Taken

- **(a) Searchable MultiSelect replaces the assignment UX.** In aportes, "Asignar a" becomes a compact filter-as-you-type MultiSelect with removable chips (× icon) — replacing the radio (a nadie/a socios/a un grupo), the checkbox scrollbox, and the single-group `<select>`. (user, req 1)
- **(b) Assignment is editable in EDIT mode.** The definition form's "Asignar a" section is shown on create AND edit; PUT now persists assignment changes (supersedes archived D19 field-edit-only). (user, req 2)
- **(c) One MultiSelect reused everywhere.** The same searchable MultiSelect replaces the socio form's pill toggles (`aporteIds`, `grupoAdicionalIds`) and becomes the standard control for other multi-selection forms. (user, req 3)
- **(d) A definition applies to SEVERAL groups (M:N).** Confirmed model decision: `grupoIds: string[]` replaces the single `aplicaGrupoId`; empty = global. A definition with multiple groups generates cobros for the union of current members at assignment, and future members at membership time (unchanged D15/D16 triggers). (user, req 4 — CONFIRMED)
- **(e) Schema via join table + additive migration 0007.** `aportes_definicion_grupos` composite-PK join (mirrors `socio_grupos`), backfill from `aplica_grupo_id`, then DROP COLUMN (single source of truth; pattern proven in 0005). (exploration rec)
- **(f) PUT assignment semantics: replace-when-declared / preserve-when-omitted.** Mirrors the socios PUT: `socioIds`/`grupoIds` declared → atomic replace; omitted → preserve current; generate missing records only (dedup D13); removal NEVER deletes generated records; grupos DELETE guard covers the join table (fixes orphan-FK gap). (exploration rec)

## Approach

1. **DB — migration `0007` + schema** (`packages/db/drizzle/0007_*.sql`, `packages/db/src/schema/aportes-definicion-grupos.ts`, `schema.ts`, `schema/aportes-definicion.ts`): CREATE `aportes_definicion_grupos(definition_id, grupo_id)` composite PK with FKs to `aportes_definicion(id)` and `grupos(id)`; backfill `INSERT OR IGNORE INTO aportes_definicion_grupos (definition_id, grupo_id) SELECT id, aplica_grupo_id FROM aportes_definicion WHERE aplica_grupo_id IS NOT NULL;`; then `ALTER TABLE aportes_definicion DROP COLUMN aplica_grupo_id;` (verified: DROP works on FK child columns with `foreign_keys=ON`; 0005 dropped FK column `tipo_aporte_id` the same way). Remove the column from the Drizzle `aportaDefinicion` model; export the new table from `schema.ts`.
2. **Core types** (`packages/core/src/index.ts`): `Aporte.grupoIds: string[]` (empty = global) replaces `aplicaGrupoId: string | null`; `AporteInput.grupoIds?: string[]` replaces `aplicaGrupoId?`; `AporteInherited` unchanged; `CrearDefinicionResponse` reused for the PUT response.
3. **API lib** (`packages/api/src/lib/aportes.ts`):
   - `socioHoldsAporte(socio, def, grupos)`: `def.grupoIds.some((g) => g === socio.grupoPrimarioId || grupos.includes(g))` — direct assignment check unchanged (still true regardless of groups).
   - `definicionesDeGrupos(grupoIds)`: `inArray` over the join table's `grupoId` joined to `aportes_definicion` with `activo = 1`, deduped by definition id (a def listed under several requested groups returns once).
   - Hydration helper `grupoIdsPorDefinicion(ids)`: batch map `definition_id → grupoId[]` from the join table; `aporteDefPorId`/`definicionesPorIds`/GET catalog attach it so every returned `Aporte` carries `grupoIds` (no N+1).
   - `generarAportes`: unchanged — D13 dedup (SELECT-before-INSERT + `onConflictDoNothing`) already guarantees idempotency.
4. **API routes**:
   - `aportes-definicion.ts`: `validarAporte` validates `grupoIds[]` (each id exists in `grupos`; absent/`[]` → global); POST builds the target set as the UNION of current members (primario OR adicional) across ALL `grupoIds`, deduped by socio, then the existing dedup generator runs (bulk-exclusion by estado unchanged); PUT accepts `socioIds?` + `grupoIds?` — when declared, atomically replaces `socio_aportes` / `aportes_definicion_grupos` rows for that definition in the same transaction (delete + reinsert, mirroring socios PUT), computes the final target set, runs the dedup generator (generates missing only; removals never delete records), response `{ definiciones, generados }`; GET returns `{ ...def, grupoIds, socioIds }` per definition (batch, for edit pre-fill); DELETE deletes the definition's join rows inside the transaction before deleting the definition (FK-owned metadata — with `foreign_keys=ON` a delete would otherwise throw), 409 guard unchanged.
   - `socios.ts`: `aportesInheritedPorSocio` joins through `aportes_definicion_grupos` and applies def-dedup (one chip per definition; `grupoId` = first matching group in stable order: primario first, then additional groups in `socio_grupos` rowid order); `definicionesFinales` unchanged (it consumes hydrated defs).
   - `grupos.ts`: DELETE guard adds `SELECT 1 FROM aportes_definicion_grupos WHERE grupo_id = :id` → 409 (fixes the orphan-FK gap that exists today for `aplica_grupo_id`).
5. **UI component** (`packages/ui/src/components/multi-select.tsx` + `src/index.ts` export): hand-rolled — text input for filter-as-you-type (case-insensitive substring over labels), dropdown listbox of remaining options, selected items as chips with lucide `X` remove buttons, `excludeValues` hidden from options (used for the primario∉adicionales invariant), keyboard nav (↑/↓ moves focus, Enter selects, Escape closes), `role="listbox"`/`role="option"` with `aria-selected`, `emptyLabel` for no matches. Zero new deps (lucide-react `^0.460.0` already in `@otb/ui`).
6. **Route integration**:
   - `aportes.tsx`: replace the "Asignar a" radio/checkbox/select block with a "Socios" MultiSelect (`permitidos` filter unchanged) and a "Grupos" MultiSelect; show the block on create AND edit (edit pre-fills socios from `a.socioIds` and groups from `a.grupoIds`); PUT payload includes `socioIds`/`grupoIds`; toast shows the generated count on edit too; the definition-list row renders one Badge per group (or a `+N` overflow) instead of the single "Grupo:" badge.
   - `socios.tsx`: replace the aporteIds and grupoAdicionalIds pill toggles with the MultiSelect (`grupoAdicionalIds` uses `excludeValues={[grupoPrimarioId]}` preserving the current invariant).
   - `app.store.ts`: `updateAporte` sends `socioIds`/`grupoIds`, handles the `{ definiciones, generados }` response, and exposes `generados` to the caller; `addAporte` unchanged apart from the `grupoIds` field name.
7. **Tests** (`packages/api/test/`): `helpers.ts` seed uses the join table (no `aplica_grupo_id` column); rework the ~20+ single-group assertions across the 5 suites to the `grupoIds`/join shape; NEW suites/cases: multi-group POST (union target, dedup by socio), PUT replace-when-declared vs preserve-when-omitted, PUT generates missing / never deletes records, groups DELETE 409 via join, GET catalog `grupoIds`+`socioIds` hydration, definition DELETE removes join rows, `aportesInherited` def-dedup (2 groups → 1 chip with first group).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/db/drizzle/0007_*.sql` | New | Join table `aportes_definicion_grupos` + backfill from `aplica_grupo_id` + DROP COLUMN (additive-first, DROP last) |
| `packages/db/src/schema/aportes-definicion-grupos.ts` | New | M:N join schema (mirrors `socio-grupos.ts`), composite PK |
| `packages/db/src/schema/aportes-definicion.ts` | Modified | Remove `aplicaGrupoId` column from Drizzle model |
| `packages/db/src/schema.ts` | Modified | Export the new join table |
| `packages/core/src/index.ts` | Modified | `Aporte`/`AporteInput`: `aplicaGrupoId` → `grupoIds` |
| `packages/api/src/lib/aportes.ts` | Modified | `socioHoldsAporte` set-intersection; `definicionesDeGrupos` join; `grupoIds` hydration |
| `packages/api/src/routes/aportes-definicion.ts` | Modified | `validarAporte` grupoIds; POST union target; PUT assignment semantics + `{definiciones, generados}`; GET hydration; DELETE join cleanup |
| `packages/api/src/routes/socios.ts` | Modified | `aportesInheritedPorSocio` via join + def-dedup |
| `packages/api/src/routes/grupos.ts` | Modified | DELETE guard checks `aportes_definicion_grupos` (orphan-FK fix) |
| `packages/ui/src/components/multi-select.tsx` | New | Searchable MultiSelect (chips, filter, listbox, a11y, keyboard) |
| `packages/ui/src/index.ts` | Modified | Export `MultiSelect` |
| `apps/web/src/routes/aportes.tsx` | Modified | MultiSelect assignment on create + edit; PUT sends assignments; multi-group badges; edit toast |
| `apps/web/src/routes/socios.tsx` | Modified | MultiSelect for `aporteIds` + `grupoAdicionalIds` (exclude primario) |
| `apps/web/src/stores/app.store.ts` | Modified | `updateAporte` payload/response; `addAporte` field rename |
| `packages/api/test/*.test.ts` | Modified | 5 suites reworked; NEW multi-group/PUT/guard/hydration/dedup scenarios |
| `openspec/specs/{aporte-definitions,socios-estados,grupos}` | Modified (spec phase) | Delta merge of M:N + editable assignment + join-table guard |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| DROP COLUMN `aplica_grupo_id` fails on exotic installs (FK + `foreign_keys=ON`) | Low | Pattern proven in 0005 (dropped FK column `tipo_aporte_id`); verified in-session with better-sqlite3; migration is additive-first — DROP is last, so a failure leaves the join table + backfill intact and the column is retried/kept |
| ~20+ existing test scenarios assert single-group behavior | Med | Rework the 5 suites in the same change; mechanical `aplicaGrupoId` → `grupoIds` with join fixtures; verify phase re-checks every archived scenario |
| PUT semantics change (D19 field-edit-only) breaks consumers/tests of the archived change | Med | Replace-when-declared mirrors the already-proven socios PUT; all PUT callers (store/UI/tests) updated in the same change; response shape change handled together |
| Definition rows without `grupoIds` (hydration miss) → global semantics silently wrong | Med | Single hydration helper used by every `Aporte`-returning path (`aporteDefPorId`, `definicionesPorIds`, GET catalog); tests assert `grupoIds` present |
| `aportesInherited` chip ambiguity with M:N (which group shows) | Med | Def-dedup with stable first-group ordering (R2); documented in spec; UI chip shows "vía {grupoNombre}" of the first source group only |
| Definition DELETE with join rows throws FK violation (`foreign_keys=ON`) | Low | DELETE removes the definition's join rows in the same transaction before deleting the definition |
| Hand-rolled MultiSelect a11y/keyboard regressions | Med | ARIA listbox/option roles, `aria-selected`, ↑/↓/Enter/Escape, focus management; tested at ~360px |
| Dropdown z-stacking inside the hand-rolled z-50 modal | Low | Dropdown positioned absolutely within the control (not teleported); verified inside the modal wrapper |
| UI shape change (GET catalog now carries `grupoIds`/`socioIds`) breaks list rendering | Low | Store replaces the catalog on add/update (existing pattern); row badges updated in the same change |

## Rollback Plan

- **Schema**: migration `0007` is additive-first. Worst-case rollback = keep the `aplica_grupo_id` column (skip the final DROP statement) and treat the join table as the source of truth; full revert = reverse-backfill `UPDATE aportes_definicion SET aplica_grupo_id = (SELECT grupo_id FROM aportes_definicion_grupos WHERE definition_id = aportes_definicion.id LIMIT 1)` for single-group rows, then DROP the join table.
- **Code**: revert routes/store/UI/lib/core via git; the archived single-group behavior is recoverable by restoring the previous `validarAporte`/POST/PUT and the D21 "create-only" UI.
- **Generated records**: cobros are created additively with the D13 dedup invariant — removals NEVER delete records, so a rollback leaves no destructive footprint; any records generated by the new multi-group path are identifiable by `aporteId` and can be cleaned one-off if needed.
- **Component**: `multi-select.tsx` is a new file — removal is a plain revert; the old radio/checkbox/pill UI is restored with the route revert.

## Dependencies

- Archived sibling change `aporte-cobro-unificado` (decisions D12–D22, especially D13 dedup invariant) — this change builds on it and supersedes D19 and D21.
- Main specs to MODIFY at spec phase: `openspec/specs/aporte-definitions/spec.md`, `openspec/specs/socios-estados/spec.md`, `openspec/specs/grupos/spec.md`; `openspec/specs/payments/spec.md` invariant unchanged.
- Existing Vitest infra (`@otb/api` suites) — no external dependencies.
- SQLite >= 3.35 (DROP COLUMN; already in use — 0005 proves it).
- `lucide-react` already present in `@otb/ui` — zero new dependencies.

## Success Criteria

- [ ] A definition can be assigned to SEVERAL groups; empty selection = global; migration 0007 backfills existing `aplica_grupo_id` assignments and drops the column
- [ ] "Asignar a" uses the searchable MultiSelect (chips with ×, filter-as-you-type) on CREATE and EDIT; edit pre-fills current socios + groups
- [ ] PUT edits assignment: declared `socioIds`/`grupoIds` replace, omitted ones preserve; generates missing records only; never deletes generated records (D13)
- [ ] POST with multiple groups generates cobros for the deduped union of current members (primario OR adicional) across all groups
- [ ] `aportesInherited` shows ONE chip per definition with the first matching group in stable order (readable when a def applies via several groups)
- [ ] Socio form uses the same MultiSelect for `aporteIds` and `grupoAdicionalIds`, excluding the primary group from additional options
- [ ] Deleting a group referenced by the join table returns 409 (orphan-FK gap fixed); deleting a definition cleans its join rows
- [ ] GET `/api/aportes-definicion` returns `grupoIds` + `socioIds` per definition (batch, no N+1)
- [ ] All 5 test suites pass with the M:N shape + new scenarios (multi-group, PUT semantics, guard, hydration, dedup); `pnpm typecheck` passes
- [ ] UI usable at ~360px; no new dependencies added
- [ ] Specs updated: `aporte-definitions`, `socios-estados`, `grupos` reflect M:N + editable assignment + join guard

## Decisiones a confirmar (user can veto any)

- **R1 — Backfill/drop: DROP `aplica_grupo_id` in 0007** (recommended). Rationale: 0005 proved DROP COLUMN on FK columns with `foreign_keys=ON`; single source of truth avoids dual-write divergence (the current schema comment already warns about dual applicability sources); additive-first ordering keeps the rollback safe. Alternative: retain the column and dual-write both — safer for exotic installs but permanent divergence risk and the orphan-FK DELETE gap in `grupos.ts` remains unless guarded anyway.
- **R2 — `aportesInherited` chip semantics: def-dedup with the first matching group** (recommended). One chip per definition, `AporteInherited` shape unchanged, `grupoId` = first source group in stable order (primario first, then additional groups by membership rowid). Keeps the socio chip row readable when a def applies via several groups (UI noise avoided). Alternative: chip-per-(def×grupo) pair — more informative ("vía G1, G2, G3") but N× chips per def and heavier test churn. Test impact: single-group scenarios keep passing with the join shape; new tests assert the dedup (2 groups → 1 chip, first group wins).
- **R3 — PUT assignment semantics: replace-when-declared / preserve-when-omitted, generate missing only, never delete records** (recommended). Mirrors the proven socios PUT and is consistent with D13. Alternative: PUT replaces the whole assignment set unconditionally (destructive, breaks preserve consumers) or stays field-edit-only with a separate assignment endpoint (more API surface, contradicts user req 2).
- **R4 — MultiSelect reuse scope: core = aportes (create + edit) + socios (`aporteIds`, `grupoAdicionalIds`)** (recommended). Bulk multas `socioIds`, asistencia selector, and reportes selectors are follow-up candidates explicitly NOT in this change unless trivial. Alternative: include them now — more surface, more test churn, no user request.
- **R5 — Component placement: `packages/ui/src/components/multi-select.tsx`, exported from the ui index, zero new deps, props `{ options: {value,label}[], selected: string[], onChange, placeholder?, searchPlaceholder?, emptyLabel?, disabled?, excludeValues? }`** (pre-agreed from exploration). Alternative: a third-party combobox (cmdk / radix-popover / headlessui) — rejected: none present in the lockfile, OTB scale doesn't need it, hand-rolled matches the existing hand-rolled modal/toast patterns.
