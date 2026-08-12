# Verification Report

**Change**: aporte-cobro-unificado
**Version**: 4-slice chain (A→B→C→D) merged to main
**Verification date**: 2026-08-05
**Artifact store mode**: both (OpenSpec file + Engram observation `sdd/aporte-cobro-unificado/verify-report`)
**Executed from**: `feat/aporte-cobro-unificado-slice-d` @ 4f324d3 (content identical to `origin/main` — `git diff HEAD origin/main` empty)

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 13 (T1.1–T5.1) |
| Tasks complete | 13 |
| Tasks incomplete | 0 |

All tasks marked `[x]` in `openspec/changes/aporte-cobro-unificado/tasks.md`. Incomplete: none.

---

## Build & Tests Execution (real execution, no cache)

**API tests** — `pnpm --filter @otb/api test`: ✅ **82 passed / 0 failed / 0 skipped** (5 files)

```
 Test Files  5 passed (5)
      Tests  82 passed (82)
```

| Suite | Tests | Result |
|-------|-------|--------|
| `test/aporte-definicion.test.ts` | 25 | ✅ |
| `test/socios-aportes.test.ts` | 22 | ✅ |
| `test/aportes-generacion.test.ts` | 12 | ✅ |
| `test/aportes-bulk-all-pagos.test.ts` | 15 | ✅ |
| `test/aporte-dedup.test.ts` | 8 | ✅ |

**Typecheck** — `pnpm typecheck --skip-nx-cache`: ✅ 13/13 projects (real tsc execution forced; first cached run also 13/13 but re-run for uncached evidence).

**Web build** — `pnpm --filter @otb/web build`: ✅ compiles (`tsc --noEmit` + `vite build`, 207 modules, dist produced). Only pre-existing warnings (vite oxc/rolldown deprecations, chunk > 500 kB) — unrelated to the change.

**Real DB migrate smoke** — non-destructive queries on `packages/db/otb.db`:
- Total `aportes` records: **219** (intact)
- Records with `aporte_id IS NOT NULL`: **0**
- Index `aporte_dedup_unico` exists: **yes**
- Duplicate `(socio_id, aporte_id, mes, gestion)` groups: **0**
- Migration `0006_burly_smiling_tiger.sql`: additive only — `CREATE UNIQUE INDEX aporte_dedup_unico ON aportes (socio_id, aporte_id, mes, gestion) WHERE aporte_id IS NOT NULL` (no drops, no rewrites)

**Coverage**: ➖ Not configured (`openspec/config.yaml` has no `rules.verify.coverage_threshold`).

---

## Spec Compliance Matrix

A scenario is COMPLIANT only when a covering test passed in the run above (all 82 passed). 49/49 delta scenarios compliant.

### aporte-definitions (23 scenarios)

| # | Scenario | Test | Result |
|---|----------|------|--------|
| 1 | List returns full catalog | `aporte-definicion > lista el catálogo completo con las 4 definiciones sembradas` | ✅ COMPLIANT |
| 2 | Create a nadie → 0 records | `aporte-definicion > crea una definición "a nadie" y responde { definiciones, generados } con count 0` | ✅ COMPLIANT |
| 3 | Client-supplied id ignored, server UUID | `aporte-definicion > un id del body se IGNORA y el server genera un UUID (D14)` | ✅ COMPLIANT |
| 4 | socioIds direct generation (count 4) | `aporte-definicion > socioIds asigna directo y genera los cobros por mes de la ventana (count 4)` | ✅ COMPLIANT |
| 5 | socioIds + aplicaGrupoId union deduped (count 3) | `aporte-definicion > socioIds ∪ miembros actuales del grupo se deduplican (count 3)` | ✅ COMPLIANT |
| 6 | Non-permitted socio → assignment kept, 0 records, 201 | `aporte-definicion > un socio cuyo estado no permite aportes conserva la asignación y genera 0 (201, sin 409)` | ✅ COMPLIANT |
| 7 | Unknown socioId rejected, nothing created | `aporte-definicion > rechaza un socioId desconocido con 400 y NO crea nada` (+ `rechaza socioIds no-array con 400`) | ✅ COMPLIANT |
| 8 | Missing nombre → 400 | `aporte-definicion > rechaza POST sin nombre con 400` | ✅ COMPLIANT |
| 9 | Missing monto → 400 | `aporte-definicion > rechaza POST sin monto con 400` | ✅ COMPLIANT |
| 10 | Negative monto → 400 | `aporte-definicion > rechaza POST con monto negativo con 400` | ✅ COMPLIANT |
| 11 | Invalid recurrencia → 400 | `aporte-definicion > rechaza POST con recurrencia inválida con 400` | ✅ COMPLIANT |
| 12 | Invalid modalidadPago → 400 | `aporte-definicion > rechaza POST con modalidadPago inválida con 400` | ✅ COMPLIANT |
| 13 | Inverted vigencia window → 400 | `aporte-definicion > rechaza POST con ventana invertida (fin < inicio) con 400` | ✅ COMPLIANT |
| 14 | Nonexistent aplicaGrupoId → 400 | `aporte-definicion > rechaza POST con aplicaGrupoId desconocido con 400` | ✅ COMPLIANT |
| 15 | Group-scoped generates for current members at assignment, no socio_aportes rows | `aporte-definicion > group-scoped genera para los miembros ACTUALES al asignar y NO materializa socio_aportes` (+ `crea una definición group-scoped con aplicaGrupoId (201)`) | ✅ COMPLIANT |
| 16 | PUT updates editable fields | `aporte-definicion > actualiza campos editables y lo refleja en el catálogo (200)` | ✅ COMPLIANT |
| 17 | PUT body id does not rename | `aporte-definicion > PUT con un id en el body NO renombra la definición (D7)` | ✅ COMPLIANT |
| 18 | PUT nonexistent → 404 | `aporte-definicion > devuelve 404 al actualizar una definición inexistente` | ✅ COMPLIANT |
| 19 | DELETE unused succeeds | `aporte-definicion > elimina una definición sin uso y la quita del catálogo (200)` (+ `elimina una definición inactiva sin uso (200)`) | ✅ COMPLIANT |
| 20 | DELETE nonexistent → 404 | `aporte-definicion > devuelve 404 al eliminar una definición inexistente` | ✅ COMPLIANT |
| 21 | Group app: current members resolve + records at assignment | `aporte-definicion > group-scoped genera para los miembros ACTUALES…` + `socios-aportes > hereda del grupo primario / adicional` | ✅ COMPLIANT |
| 22 | Group app: future member receives records at membership ⚠️ INVERTED | `socios-aportes > INVERTIDO: un miembro FUTURO hereda Y recibe registros al momento de la membresía` (asserts `registros.length > 0`; git diff of f231e32/PR #12 confirms the assertion flip from "sin materializar… ni registros") | ✅ COMPLIANT |
| 23 | Removing member stops application, records never deleted | `socios-aportes > quitar al socio del grupo deja de heredar y NO borra los registros generados` | ✅ COMPLIANT |

### payments (9 scenarios)

| # | Scenario | Test | Result |
|---|----------|------|--------|
| 1 | Definition creation with assignment generates direct records | `aporte-definicion > socioIds asigna directo y genera los cobros por mes de la ventana (count 4)` | ✅ COMPLIANT |
| 2 | Socio save generates records | `socios-aportes > POST con aporteIds genera los cobros del socio en la misma transacción (D16)` (asserts 12 records, `generados.count === 12`) | ✅ COMPLIANT |
| 3 | Membership-time generation for group-scoped defs | `socios-aportes > INVERTIDO: …recibe registros al momento de la membresía` | ✅ COMPLIANT |
| 4 | Non-permitted excluded from auto-generation, no 409 | `aporte-definicion > …no permite aportes conserva la asignación y genera 0 (201, sin 409)` + `socios-aportes > POST de un socio cuyo estado no permite aportes…` | ✅ COMPLIANT |
| 5 | Re-running creation-with-assignment never duplicates | `aporte-dedup > matriz completa: definición con socioIds → re-save socio → membresía → bulk/bulk-all re-run` | ✅ COMPLIANT |
| 6 | Socio re-save idempotent | `socios-aportes > PUT sin aporteIds preserva las asignaciones existentes (re-save idempotente, count 0)` + `aporte-dedup > socio-save POST (D16) + re-save PUT idempotente` | ✅ COMPLIANT |
| 7 | Manual bulk re-run dedup-safe `{count:0,items:[]}` | `aporte-bulk-all-pagos > re-run de un bulk ya materializado es dedup-safe ({ count: 0, items: [] })` + `aporte-dedup > gestión pasada (2025): single + bulk + bulk/all re-run cross-path` | ✅ COMPLIANT |
| 8 | Single endpoint re-run dedup-safe | `aporte-generacion > re-run de una generación ya materializada es dedup-safe ({ count: 0, items: [] })` | ✅ COMPLIANT |
| 9 | Membership re-assertion does not duplicate | `socios-aportes > re-afirmar la membresía (PUT con los mismos grupos) no duplica registros` + `aporte-dedup > membresía adicional: ingresar genera una vez; re-afirmar no duplica; salir no borra; re-ingresar no duplica` | ✅ COMPLIANT |

### socios-estados (17 scenarios)

| # | Scenario | Test | Result |
|---|----------|------|--------|
| 1 | POST multiselect generates records per assignment | `socios-aportes > POST con múltiples aporteIds persiste ambas asignaciones respetando el orden` + `POST con aporteIds genera los cobros…` | ✅ COMPLIANT |
| 2 | POST without aporteIds → `aporteIds: []` | `socios-aportes > POST sin aporteIds no crea asignaciones directas (aporteIds: []) ni registros` | ✅ COMPLIANT |
| 3 | Unknown aporte id → 400 | `socios-aportes > POST con un id de aporte desconocido se rechaza con 400 y no crea el socio` | ✅ COMPLIANT |
| 4 | Inactive aporte id → 400 | `socios-aportes > POST con un aporte inactivo se rechaza con 400` | ✅ COMPLIANT |
| 5 | Non-array aporteIds → 400 | `socios-aportes > POST con aporteIds no-array se rechaza con 400` | ✅ COMPLIANT |
| 6 | Non-permitted estado → assignment kept, 0 records, no 409 | `socios-aportes > POST de un socio cuyo estado no permite aportes conserva la asignación y genera 0 (201, sin 409)` | ✅ COMPLIANT |
| 7 | PUT atomic replace without deleting records | `socios-aportes > PUT con aporteIds reemplaza el set atómicamente en la misma transacción` + `PUT reemplazo atómico NUNCA borra registros ya generados` | ✅ COMPLIANT |
| 8 | PUT without aporteIds preserves (idempotent) | `socios-aportes > PUT sin aporteIds preserva las asignaciones existentes (re-save idempotente, count 0)` | ✅ COMPLIANT |
| 9 | PUT adding aporte generates only missing | `socios-aportes > PUT agregando un aporte genera SOLO los cobros faltantes` (13 total: 12 existing + 1 new, `generados.count === 1`) | ✅ COMPLIANT |
| 10 | Full replace keeps multiselect intact | `socios-aportes > PUT full reemplazo mantiene el multiselect intacto sin duplicar cobros` | ✅ COMPLIANT |
| 11 | Inherits from primary group | `socios-aportes > hereda del grupo primario` | ✅ COMPLIANT |
| 12 | Inherits from secondary group | `socios-aportes > hereda de un grupo adicional (secundario)` | ✅ COMPLIANT |
| 13 | Inherits from both, each with source group | `socios-aportes > hereda de primario y secundario a la vez, cada uno con su grupo fuente` | ✅ COMPLIANT |
| 14 | Future member inherits AND receives records at membership ⚠️ INVERTED | `socios-aportes > INVERTIDO: un miembro FUTURO hereda Y recibe registros al momento de la membresía` (no `socio_aportes` rows, but `aportes` rows `> 0`) | ✅ COMPLIANT |
| 15 | Removing member stops inheritance, records remain | `socios-aportes > quitar al socio del grupo deja de heredar y NO borra los registros generados` (both branch: inheritance-only and direct-assigned) | ✅ COMPLIANT |
| 16 | Direct assignment deduplicates inherited chip | `socios-aportes > una asignación directa deduplica el chip heredado` | ✅ COMPLIANT |
| 17 | Inherited chips read-only | `socios-aportes > los chips heredados son read-only: PUT sin aporteIds no los altera ni los remueve` | ✅ COMPLIANT |

**Compliance summary**: **49/49 scenarios compliant** (23 + 9 + 17).

---

## Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| Definition CRUD (GET/POST/PUT/DELETE) | ✅ Implemented | `routes/aportes-definicion.ts`; PUT field-edit only (D19); DELETE keeps 409 guard (D10) |
| Server-generated UUID, body `id` ignored (D14) | ✅ Implemented | `const id = crypto.randomUUID()`; body `id` never read/validated/stored; duplicate-id 400 check removed (grep: no `already exists`/dup check) |
| `socioIds` validation → 400 before insert (D18) | ✅ Implemented | `validarSocioIds` batch `inArray` check, `{ error: "socioIds contains an invalid socio" }`, runs before `db.transaction` |
| One-transaction insert + assign + generate (D15) | ✅ Implemented | single `db.transaction`; target set = socioIds ∪ current members (primary + additional), deduped by socioId; bulk-exclusion via `permitir('aportes')`, 201 never 409/400 |
| Response `201 { definiciones, generados }` | ✅ Implemented | full catalog + `{ count, items }` of only new rows |
| Socio POST/PUT generation in same tx (D16) | ✅ Implemented | `routes/socios.ts` runs generator inside persistence tx over final sets (declared ?? preserved); both responses include `generados: { count }`; non-permitted → 0 records, no 409; removals never delete records |
| Shared dedup generator + helpers (D13/D20) | ✅ Implemented | `lib/aportes.ts`: `generarAportes` SELECT-before-INSERT + `onConflictDoNothing`; `definicionesDeGrupos`/`definicionesPorIds` filter `activo = 1` |
| Endpoint retention (D17) | ✅ Implemented | `POST /`, `/bulk`, `/bulk/all` retained, dedup-safe; `GET /socio/:socioId`, `GET /:id/pagos`, pay/anular, PUT unchanged |
| Core type deltas (T1.2) | ✅ Implemented | `AporteInput` drops `id`, gains `socioIds?`; `AporteGenerado`, `GeneracionResult`, `CrearDefinicionResponse`, `SocioConGeneracion`, `Socio.generados?` all present |
| Partial unique index (T1.1) | ✅ Implemented | drizzle `uniqueIndex('aporte_dedup_unico').on(socioId, aporteId, mes, gestion).where(aporteId IS NOT NULL)`; migration additive |
| Store/UI integration (T3.1–T3.3) | ✅ Implemented | `addAporte` returns `GeneracionResult` and replaces `definiciones`; `createSocio`/`updateSocio` return `SocioConGeneracion` + refresh `aporteRegistros`; `AporteBulkResult` removed |
| Unified form, no "Generar Cobros", no id input (D21) | ✅ Implemented | grep across `apps/web/src` for `generarForm|allSocios|selectedDefiniciones|handleGenerar|toggleDefinicion|Generar Cobros` → 0 hits; no `id` input in create form; "Asignar a" radio with `nadie` default |
| Generated-count toast (D22) | ✅ Implemented | local `CobroToast` (state + fixed banner, 3s auto-dismiss, `role="status"`/`aria-live="polite"`); "Se generaron N cobro(s)" in both `aportes.tsx` and `socios.tsx` |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D12 current-year gestion, no mes override | ✅ Yes | `new Date().getFullYear()`, no `mes` on auto paths; manual endpoints keep their own mes/gestion |
| D13 dedup: index + SELECT-before-INSERT | ✅ Yes | both layers present; raw-SQL duplicate-group check in `aporte-dedup.test.ts` empty across the whole matrix |
| D14 server UUID | ✅ Yes | see above |
| D15 one transaction POST definition | ✅ Yes | insert → socio_aportes → target set → filter → generate, all in one tx |
| D16 socio save generation | ✅ Yes | see above |
| D17 single/bulk/bulk-all retained | ✅ Yes | endpoints + contracts unchanged, now dedup-safe |
| D18 socioIds 400 | ✅ Yes | error message exactly `{ error: "socioIds contains an invalid socio" }` |
| D19 PUT field-edit only | ✅ Yes | no socioIds, no assignment change, no generation on PUT |
| D20 definicionesDeGrupos active-only | ✅ Yes | `and(inArray(aplicaGrupoId, grupoIds), eq(activo, 1))` |
| D21 exclusive "Asignar a" modes in UI | ✅ Yes | radio nadie/socios/grupo, exclusive via `handleAsignarChange` (switching mode clears the other field) |
| D22 local inline toast | ✅ Yes | no new dependency; matches zero-dep pattern |
| File Changes table | ✅ Yes | all 11 authored files match; no drift into grupos/config/seed/catalogo |

---

## Issues Found

**CRITICAL** (must fix before archive):
None.

**WARNING** (should fix):
- Read-time inheritance chips (`aportesInherited`, `routes/socios.ts:103`) do not filter `activo`, while generation (`definicionesDeGrupos`, D20) only applies active definitions — a member may see a chip for an inactive definition with no new records. This is a **pre-existing inconsistency**, explicitly documented in design.md Open Questions and kept out of scope; not introduced by this change. Confirm whether chips should filter `activo` before archive (design question, not a regression).

**SUGGESTION** (nice to have):
- Web build emits a chunk > 500 kB warning (pre-existing; unrelated to the change — no code-splitting changes made).
- Nx served typecheck from cache on the first run; verification re-ran with `--skip-nx-cache` for real evidence — consider `nx run-many --skip-nx-cache` in CI verify steps when cache is suspect.

---

## Verdict

**PASS** — 82/82 tests green, typecheck 13/13, web build compiles, real-DB migration smoke clean (219 records intact, index present, 0 duplicates), 49/49 spec scenarios compliant with passing-test evidence, both INVERTED archived behaviors re-checked and confirmed inverted in both code and test assertions (including the PR #12 diff), no scope drift.

{One-line summary: implementation matches specs/design/tasks with runtime proof on every gate.}
