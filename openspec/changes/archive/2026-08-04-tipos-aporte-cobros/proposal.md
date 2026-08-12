# Proposal: Aportes as Dynamic Definitions with Many-to-Many Socio Assignment (tipos-aporte-cobros)

## Intent

The previously approved and implemented model — a `tipos_aporte` catalog (`montoBase` only) plus a single FK `socios.tipo_aporte_id` and separate record creation — does NOT match what the user wants. The user corrected the model (authoritative):

- **APORTE is the dynamic definition itself.** The entity previously called "tipo de aporte" becomes the aporte: `id` (internal text, e.g. `ap-mensual`), `nombre` (e.g. "Cuota Social Mensual"), `monto` (Bs), `recurrencia` (`mensual | anual | unico | extraordinario`), `inicio`/`fin` (vigencia window), `modalidadPago` (`cuotas | parciales | pago_unico`), `aplicaGrupoId` (nullable FK to `grupos`), `activo`.
- **Assignment is many-to-many** socio ↔ aporte via a join table `socio_aportes` (same pattern as `socio_grupos`). The socio form picks ONE OR MORE aportes (multiselect) when creating/replacing the socio. The socio shows read-only chips for aportes inherited via group (primary + secondary).
- **Group application is dynamic**: if `aplicaGrupoId` is set, the aporte applies automatically to ALL current AND FUTURE group members — resolved at read/generation time, NOT materialized propagation.
- **Generation**: the monthly records (table `aportes`, conceptually renamed to APORTE_REGISTRO / cobro) are generated FROM the definition: `monto` = the definition's monto, record count by recurrence (`anual` → 12, `mensual` → N, `unico`/`extraordinario` → 1) within the `inicio`/`fin` window. The manual override (old D4) and the `monto` in the creation body disappear.

This change REWORKS the just-implemented catalog+FK model (current git history: 8 commits implementing `tipos_aporte` + `socios.tipo_aporte_id`) into the corrected model, and absorbs the `ux-avanzado-otb` pendings adapted to it (payments history `GET /api/aportes/:id/pagos`, definition-driven generation instead of loose-number bulk).

## Scope

### In Scope
- **Schema rework** (`packages/db`): rework `tipos_aporte` → `aportes_definicion` (adds `monto`, `recurrencia`, `inicio`/`fin`, `modalidadPago`, `aplicaGrupoId`; keeps `id`, `nombre`, `activo`; drops the single-amount `montoBase` concept); new join table `socio_aportes` (`socioId` + `aporteId`, PK pattern of `socio_grupos`); DROP `socios.tipo_aporte_id` (and the legacy `aporte_base` loose number); `aportes` gains `aporteId` FK → `aportes_definicion.id`; drizzle migration + seed of default definitions (e.g. `ap-mensual` "Cuota Social Mensual").
- **Core types** (`packages/core`): `Aporte` (definition) and `AporteInput`; `SocioAporte` join type; `Socio`/`SocioInput` gain `aporteIds` (multiselect) and lose `tipoAporteId`/`aporteBase`; `BulkAporteRequest` loses the `monto` override field.
- **API** (`packages/api`): CRUD for aporte definitions (rework of the `tipos-aporte.ts` router; DELETE guard 409 when the definition has generated records or assignments); socio POST/PUT accept `aporteIds` multiselect; socio read shape resolves inherited aportes via group (primary + secondary) as read-only chips; generation endpoints derive records from the definition (monto from definition, count by recurrence + vigencia window, NO override, NO `monto` in body); `GET /api/aportes/:id/pagos` movement history preserved (pattern `multas`).
- **UI** (`apps/web`): **definition CRUD lives in the "Aportes" section's creation tab** (`aportes.tsx`), NOT in Config (user clarification). The tab already exists and is where aportes are created — the definition form (monto, recurrencia, inicio/fin, modalidadPago, optional aplicaGrupoId, activo) + definition list/edit live there. `config.tsx` gets NO aporte CRUD; Config is reserved for optional pre-creation helpers if any prove relevant (none confirmed yet — leave out of scope). `socios.tsx` form gains aporte multiselect (one or more) plus read-only inherited chips (group primary + secondary); `aportes.tsx` becomes the cobro/record view driven by definitions, keeping the payments history UI and the existing create tab.
- **Store** (`apps/web/src/stores/app.store.ts`): `aportes` (definitions) state + CRUD actions, loaded in `fetchConfig`; generation actions; `fetchPagosAporte` preserved.
- **Naming**: rename the concept across UI/API from "tipos de aporte" to "aportes" (definitions); generated records are referred to as APORTE_REGISTRO / cobro.
- Archive/cancel `ux-avanzado-otb` on completion.

### Out of Scope
- Partial payments per installment (already exists: `POST /api/aportes/:id/pagar`).
- Advanced reporting (balance / libro-diario / resumen-socio beyond the current gestión/mes/tipo/estado/grupo filters).
- Notifications, dashboard, egresos, PDF/Excel export, authentication/authorization.
- Retroactive migration of already-generated aporte records into definitions (existing records are preserved as-is; only the model going forward uses definitions).

## Product Decisions Taken (user, authoritative)

- **(a) The monto lives in the definition.** The socio no longer carries an amount; record generation reads `monto` from the assigned definition.
- **(b) A socio can hold MULTIPLE aportes** — many-to-many via `socio_aportes`, multiselect in the socio form at create/replace time.
- **(c) Group application is automatic, including FUTURE members.** `aplicaGrupoId` resolves dynamically (current + future members at read/generation time); NO materialized propagation.
- **(d) Generation is definition-driven.** Record count by `recurrencia` (`anual` → 12, `mensual` → N, `unico`/`extraordinario` → 1) within the `inicio`/`fin` window. Manual override and `monto` in the creation body disappear.
- **(e) Naming**: "aporte" = the dynamic definition; generated monthly records = APORTE_REGISTRO / cobro.

## Approach

1. **Data model** (`packages/db`): rework `schema/tipos-aporte.ts` → `schema/aportes-definicion.ts` with `{ id, nombre, monto, recurrencia, inicio, fin, modalidadPago, aplicaGrupoId, activo }`; new `schema/socio-aportes.ts` join (clone of `socio-grupos.ts`); `schema/socios.ts` drops `tipoAporteId` and legacy `aporteBase`; `schema/aportes.ts` gains `aporteId` FK. Additive-then-drop migration (0005) + seed of default definitions.
2. **Core types** (`packages/core`): `Aporte`, `AporteInput`, `SocioAporte`; `Socio`/`SocioInput` switch to `aporteIds`; remove `tipoAporteId`/`aporteBase` from the model; `BulkAporteRequest` loses `monto` override.
3. **API** (`packages/api`):
   - Rework `routes/tipos-aporte.ts` → definition CRUD (fields above; DELETE guard 409 when records/assignments exist); mount at the renamed path.
   - `routes/socios.ts`: `aporteIds` multiselect validation (definitions exist + `activo`) in POST/PUT; read shape resolves inherited aportes via group memberships (primary + secondary) and returns them as read-only chips alongside direct assignments.
   - `routes/aportes.ts`: generation (single/bulk) resolves `monto` from each definition and builds record count by `recurrencia` + `inicio`/`fin` window; remove override/`monto` in body; keep `GET /:id/pagos`; bulk scopes to socios whose estado permits `aportes` (reuse `cargarPermisosPorEstado`/`permite`, no hardcoded `estado='activo'`).
4. **UI** (`apps/web`):
   - `aportes.tsx`: definition form + list/edit in the existing "create" tab (monto, recurrencia, inicio/fin, modalidadPago, grupo optional, activo); cobro/record view. `config.tsx`: NO aporte CRUD (user clarification — only optional pre-creation helpers if later confirmed).
   - `socios.tsx`: multiselect of aportes at create/replace; read-only chips of group-inherited aportes (primary + secondary).
   - `aportes.tsx`: cobro/record view generated from definitions; payments history preserved.
5. **Store** (`apps/web/src/stores/app.store.ts`): `aportes` (definitions) state + `addAporte/updateAporte/removeAporte`, loaded in `fetchConfig`; generation actions; `fetchPagosAporte` preserved.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/db/src/schema/aportes-definicion.ts` | Rework (was `tipos-aporte.ts`) | `aportes_definicion`: id, nombre, monto, recurrencia, inicio/fin, modalidadPago, aplicaGrupoId, activo |
| `packages/db/src/schema/socio-aportes.ts` | New | Join `socio_aportes` (pattern `socio_grupos`) |
| `packages/db/src/schema/socios.ts` | Modified | DROP `tipoAporteId` + legacy `aporteBase` |
| `packages/db/src/schema/aportes.ts` | Modified | Gains `aporteId` FK; conceptual APORTE_REGISTRO / cobro |
| `packages/db/src/schema.ts` | Modified | Exports for new/reworked tables |
| `packages/db/src/seed.ts` | Modified | Seed default definitions + assignments |
| `packages/db/drizzle/0005_*.sql` | New | Additive-then-drop migration (definitions, join, `aporte_id`, drop FK) |
| `packages/core/src/index.ts` | Modified | `Aporte`, `AporteInput`, `SocioAporte`; `Socio/SocioInput.aporteIds`; `BulkAporteRequest` without `monto` |
| `packages/api/src/routes/tipos-aporte.ts` | Rework | Definition CRUD with new fields + 409 guard (renamed path) |
| `packages/api/src/routes/socios.ts` | Modified | `aporteIds` multiselect; inherited chips via group resolution |
| `packages/api/src/routes/aportes.ts` | Modified | Definition-driven generation, no override; keep `GET /:id/pagos` |
| `packages/api/src/index.ts` | Modified | Mounts for renamed/added routes |
| `apps/web/src/routes/socios.tsx` | Modified | Aporte multiselect + read-only inherited chips |
| `apps/web/src/routes/aportes.tsx` | Modified | Definition form + list/edit in the existing create tab; cobro view from definitions; payments history |
| `apps/web/src/stores/app.store.ts` | Modified | `aportes` definitions state + CRUD, generation, `fetchPagosAporte` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Rework breaks the already-implemented catalog+FK model (8 commits) and its consumers (seed, form, list, reportes, dashboard) | Med | Targeted replacement in one change; update every consumer in the same change; additive-then-drop migration; verify phase cotes against the corrected model |
| Dynamic group resolution confuses users about which aportes a socio has | Med | Separate editable direct assignments from read-only inherited chips (primary + secondary groups); tooltip explaining group inheritance |
| Dropping `socios.tipo_aporte_id`/`aporte_base` with existing data loses amounts | Med | Additive migration first (definitions + join + `aporte_id`), DROP in a later step after backfill verification; `aporte_base` preserved as legacy read during transition |
| Renaming concept/tables/endpoints breaks reportes/movimientos/UI consumers | Med | Rename concept in core/UI first; physical DDL rename only where safe; keep backward-compatible read shapes during transition |
| Definition-driven generation (N×12 per definition, many socios) creates many rows | Low | Same transactional pattern as existing bulk; response `{ count, items }`; scope generation to socios whose estado permits `aportes` |
| Bulk scoping regresses to hardcoded `estado='activo'` | Med | Reuse `cargarPermisosPorEstado`/`permite(...,'aportes')`; verify against the `/bulk` pattern |

## Rollback Plan

- **Schema**: migration is additive-first (create `aportes_definicion` + `socio_aportes` + `aportes.aporte_id`, seed definitions) and only then drops `tipo_aporte_id`/`aporte_base`; revert by keeping the old columns until verified. Generated records are never deleted.
- **API/UI**: restore routes/pages from git; the old catalog+FK read shapes are kept backward-compatible during the transition, so reverting the definition-driven generation is safe.
- **Non-destructive**: `anual`/`mensual` generation only creates records, never removes; `ux-avanzado-otb` is archived only after this change is verified.

## Dependencies

- Drizzle migrations pipeline (already configured).
- Absorbs `openspec/changes/ux-avanzado-otb` (superseded → archived on completion of this change).

## Success Criteria

- [ ] `aportes_definicion` supports `monto`, `recurrencia`, `inicio`/`fin`, `modalidadPago`, `aplicaGrupoId`, `activo`; CRUD from Config works (409 when deleting a definition with records/assignments)
- [ ] `socio_aportes` join works; the socio form allows multiselect of ONE OR MORE aportes at create/replace
- [ ] Socio read shape exposes read-only inherited chips (group primary + secondary); adding a socio to a group with `aplicaGrupoId` set inherits the aporte automatically (no materialized propagation)
- [ ] Generation is definition-driven: `monto` from the definition, `anual` → 12 records, `mensual` → N within the window, `unico`/`extraordinario` → 1; no `monto` in the creation body and no manual override
- [ ] `GET /api/aportes/:id/pagos` movement history preserved
- [ ] Concept renamed across UI/API: "tipos de aporte" no longer appears; definition = "aporte", records = cobro / APORTE_REGISTRO
- [ ] `pnpm typecheck` passes and build compiles; UI usable at ~360px
- [ ] `ux-avanzado-otb` archived/cancelled after verification

## Referencias a Specs que se reescribirán

- `specs/aporte-types/spec.md` → rework a `aporte-definitions` (NEW): definición dinámica, monto/recurrencia/ventana/modalidad, asignación many-to-many, herencia por grupo dinámica
- `specs/payments/spec.md` (MODIFICADO): generación desde definición (sin override ni `monto` en body), `GET /:id/pagos` conservado
- `specs/socios-estados/spec.md` (MODIFICADO): `aporteIds` multiselect reemplaza `tipoAporteId`; chips heredados por grupo
