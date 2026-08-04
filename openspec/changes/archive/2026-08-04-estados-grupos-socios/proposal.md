# Proposal: Configurable Socio States & Groups (estados-grupos-socios)

## Intent

Socios today have a hardcoded 3-value `estado` enum (`activo|inactivo|suspendido`), no grouping, and soft-delete maps DELETE to a fixed `inactivo`. Admins cannot model the real OTB lifecycle (e.g. "dado de baja" with motivo) or organize socios by block/manzano. This change makes socio states a catalog managed from Configuración where **each state controls which actions the socio may participate in** (asistencia, aportes, multas, reports), adds group membership (one primary + N additional) with filtering across the app, and introduces an explicit baja-with-motivo action.

**Product decision (final):** states are NOT informational — each catalog state defines the set of permitted actions. Example: a socio in "inactivo" is excluded from reuniones (asistencia) and aportes; a socio in "de baja" is excluded from every action. All modules (asistencia, aportes, multas, reports, dashboard) respect the state's action permissions.

## Scope

### In Scope
- Catalog table `estados_socio` (CRUD in Config, activity-types pattern) with `esActivo`/`esBaja`/`esDefecto` flags **and a UI `color` (hex) flag**; socio form shows a catalog-driven estado select
- **Catalog of actions `acciones_socio` + M:N `estado_acciones` covering EVERY app action that touches a socio**: asistencia, aportes, pagos, multas, anulaciones, reportes, dashboard (see seed list below). Each estado defines which actions it permits. **Action toggles appear INLINE in the estado list (switch per estado×acción, instant save) AND in the create/edit form (checkboxes, defaults pre-ticked)** — the admin enables/disables any action per estado directly from the list without opening the form. Admins can add new actions to the catalog without code changes; enforcement keys on the action's stable `clave`
- Migration of the existing `estado` enum → `estadoId` FK (map `activo/inactivo/suspendido` to seeded catalog rows)
- Baja con motivo: `motivoBaja` + `fechaBaja` columns on `socios`; `POST /api/socios/:id/baja` action endpoint (precedent: `POST /api/aportes/:id/pagar`)
- **Action enforcement across modules**: each socio-associated route (asistencia, aportes, pagos, multas, anulaciones, reportes, dashboard) filters or rejects socios whose estado does not permit that action (API + UI)
- Tables `grupos` + `socio_grupos` (Option B), CRUD in Config, group filter on the socio list and across modules, groups visible in the socio ficha
- **Filters by estado and by grupo** where relevant: socio list, asistencia, aportes, multas, reportes
- Responsive UI (wrapping chips/badges, mobile-first layout); **estado badge uses the estado's `color` everywhere in the UI**
- Dashboard counts driven by the catalog `es_activo` flag instead of hardcoded `estado='activo'`

### Out of Scope
- `apps/desktop`, `apps/mobile` (stubs)
- Tests (no infra in repo; verification = typecheck + build)
- Reactivation/motivo history, event-log table, auth
- Custom per-socio permission overrides (permissions derive from the socio's estado only)
- Runtime enforcement for user-defined actions beyond the shipped ones (new actions are selectable/assignable; enforcement exists for the known `clave`s)

## Capabilities

### New Capabilities
- `socios-estados`: estados catalog CRUD (with per-action permission flags), socio estado select, baja con motivo + fecha, dashboard `es_activo`
- `grupos`: grupos CRUD (409 delete-guard), socio↔grupo association (primary + additional), filter by group

### Modified Capabilities
- `dashboard-fixes`: `totalSocios`/`morosos` MUST count via catalog `es_activo` instead of hardcoded `socios.estado='activo'`
- `join-fixes` / `asistencia`: socio selection and attendance registration MUST only include socios whose estado permits `asistencia`
- `payments` (aportes + multas): payment creation (`pagar`), bulk, edit and delete MUST reject or exclude socios whose estado does not permit `aportes`/`multas`; payment (`pagar`) additionally requires `pagos`; anulaciones require `anulaciones`
- `reports`: socio summaries and lists MUST filter by estado permission (`reportes`) and support `grupoId` + `estadoId` filters

## Approach

1. **Data model** (`packages/db`): `estados_socio` (`id` PK, `nombre` notNull, `color` text notNull default `'#22c55e'` (hex used by badges/filters), `esActivo` int 0/1, `esBaja` int, `esDefecto` int, `orden` int); **`acciones_socio`** (`id` PK, `clave` notNull unique — stable slug like `asistencia`/`aportes`/`multas`/`reportes`, `nombre` notNull, `descripcion` nullable, `orden` int); **`estado_acciones`** (`estadoId`+`accionId` composite PK, M:N) — each estado lists which actions it permits; `grupos` (`id` PK, `nombre` notNull, `descripcion` nullable); `socios` replaces `estado` enum with `estadoId` FK, adds `grupoPrimarioId` FK, `motivoBaja`, `fechaBaja`; `socio_grupos` (`socioId`+`grupoId` composite PK) for additional groups. Integer flags keep types portable across SQLite/PostgreSQL.
2. **Seed defaults — full action set** (`acciones_socio`, every app action that touches a socio): `asistencia` (registrar/editar asistencia a reuniones), `aportes` (crear/editar/bulk aportes), `pagos` (pagar aportes y multas), `multas` (crear/editar/bulk multas), `anulaciones` (anular aportes/multas), `reportes` (aparecer en reportes y resúmenes), `dashboard` (ser contado en el dashboard). Estados seed (4 rows): `activo` (green `#22c55e`, ALL actions, esActivo+esDefecto), `suspendido` (amber `#f59e0b`, only `reportes` — visible, excluded from operations), `inactivo` (gray `#9ca3af`, no actions, esBaja=0 — legacy soft-delete value), `dado_de_baja` (red `#ef4444`, no actions, esBaja). Config lists actions + per-estado toggles inline in the list and checkboxes in the form.
3. **Migration** (drizzle-kit): seed catalog rows (actions + estados + M:N); backfill `estadoId` by nombre mapping; drop `estado` column last. SQLite has no CHECK on `estado`, so values are clean.
4. **API** (`packages/api`): clone tipos-actividad routes for `estados-socio`, `acciones-socio` and `grupos` (return full list, 409 when in use); estados-socio payload includes `color` and `accionIds` (the M:N set); **POST /api/estados-socio accepts `accionIds` (defaults to all actions if omitted) so a new estado is fully defined in one shot**; **PUT /api/estados-socio/:id/acciones toggles the action set (inline list save)**; socios POST/PUT validate `estadoId`/`grupoPrimarioId`/`grupoAdicionalIds` (replace additional groups atomically in a transaction); `POST /:id/baja` requires `motivo`, sets the `esBaja` catalog state + `motivoBaja`/`fechaBaja`; DELETE keeps soft-delete mapped to the `esBaja` state; GET supports `?grupoId=` and joins estado + groups (flat `estadoNombre`, `estadoColor`, `esActivo`, `grupos`). **Action enforcement helper** `socioPermite(socio, accionClave)` resolves the estado's M:N action set; used by every socio-associated route (asistencia, aportes, pagos, multas, anulaciones, reportes, dashboard) to filter or reject (409 with friendly message) socios whose estado does not permit the action.
5. **UI** (`apps/web`): Config gains "Estados de Socio" (list with inline action toggles per estado — a switch per acción with instant save — plus create/edit form with nombre + color picker + action checkboxes, defaults pre-ticked), "Acciones" (admin can add new actions with a `clave` + nombre), and "Grupos" CRUD cards (clone the Tipos de Actividad block); socio form gains estado select (options show colored dot), primary-group select + additional multi-select; list gains group filter + **estado badge tinted with the estado's `color`**; **asistencia/aportes/multas/reportes pages gain estado+grupo filters and disable/hide socios whose estado blocks the action**; ficha (detail section/modal) shows both; mobile: wrapping chips, stacked cards.
6. **Store**: `estadosSocio`/`accionesSocio`/`grupos` state + add/update/remove (full-list replace pattern); `fetchConfig` loads all four (config + tipos + acciones + estados + grupos); socio actions carry `estadoId`/groups.

**Group modeling — Option B** (`grupoPrimarioId` column + join table): Option A's unique `(socio_id, es_primario)` is flawed as stated (would cap additional groups at 1) and needs a partial unique index; B keeps the primary trivially queryable, uses a plain M:N for additional groups, and is fully portable SQLite/Postgres. Invariant "primary ∉ additional" enforced at the API layer.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/db/src/schema/socios.ts` | Modified | `estadoId` FK, `grupoPrimarioId`, `motivoBaja`, `fechaBaja` |
| `packages/db/src/schema/estados-socio.ts`, `grupos.ts`, `socio-grupos.ts` | New | Catalog + association tables |
| `packages/db/src/seed.ts` | Modified | Seed catalog rows + example groups; generate payments only for `esActivo` |
| `packages/core/src/index.ts` | Modified | `Socio`, `EstadoSocio`, `Grupo` types |
| `packages/api/src/routes/socios.ts` | Modified | Validate estado/groups, baja action, `?grupoId` filter |
| `packages/api/src/routes/estados-socio.ts`, `grupos.ts` | New | CRUD clones + 409 guards |
| `packages/api/src/index.ts` | Modified | Mount `/api/estados-socio`, `/api/grupos` |
| `packages/api/src/routes/dashboard.ts` | Modified | `es_activo`-driven counts |
| `apps/web/src/routes/config.tsx` | Modified | 2 new CRUD cards |
| `apps/web/src/routes/socios.tsx` | Modified | Selects, chips, filter, responsive ficha |
| `apps/web/src/stores/app.store.ts` | Modified | Estados/grupos actions |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Dropping `estado` breaks dashboard/seed consumers | Med | Update all consumers in the same change; `es_activo` flag preserves semantics |
| Baja state unresolvable at runtime | Low | Exactly one catalog row flagged `esBaja`; seed guarantees it; API 400 if misconfigured |
| Option B invariant drift (primary ∈ additional) | Med | API enforces on every socio write; grupo delete-guard 409 |
| Action-permission drift (a socio participates in a blocked action) | Med | Single `socioPermite()` helper resolves the estado's M:N action set and is reused by every module route; UI mirrors with filters/disabled controls |
| Duplicate/ambiguous action `clave` breaks enforcement | Low | `clave` unique constraint + admin warning when adding an action whose clave matches an existing one; seed actions use stable slugs |
| Admin removes last permitted state for an action | Low | Warn in Config when no state permits an action; seed guarantees `activo` permits all |

## Rollback Plan

- Schema: revert drizzle migration or regenerate DB from seed — additive (catalog + backfill), no data loss; the `estado` column drop is the only irreversible step, staged last
- API/UI: restore routes/pages from git

## Dependencies

- Drizzle migrations pipeline (already configured); no external dependencies

## Success Criteria

- [ ] `acciones_socio` seeded (asistencia, aportes, pagos, multas, anulaciones, reportes, dashboard) and `estados_socio` seeded (3 rows) with M:N `estado_acciones`; `socios.estadoId` backfilled; `estado` column dropped
- [ ] CRUD of estados (inline list toggles + form with nombre, color picker, action checkboxes), acciones (admin can add new ones with clave) and grupos works from Config; delete-in-use → 409
- [ ] Socio form shows estado select + primary/additional groups; list filters by estado and by grupo; ficha shows estado badge + group chips
- [ ] `POST /api/socios/:id/baja` sets esBaja state + motivo/fecha; DELETE maps to esBaja
- [ ] A socio whose estado does not permit `asistencia`/`aportes`/`pagos`/`multas`/`anulaciones` is excluded/rejected in those modules (API + UI); reports filter by the `reportes` action and support estado+grupo filters; dashboard counts respect `dashboard` action via `es_activo`
- [ ] Dashboard totals unchanged under `es_activo` flag
- [ ] `pnpm typecheck` and build pass; UI usable at ~360px width
