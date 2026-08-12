```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:56816a5f205cd9cdc674b5efe5127e88f6ca3034e621a27c25cb5d822ea23a14
verdict: fail
blockers: 0
critical_findings: 0
requirements: 9/9
scenarios: 66/70
test_command: pnpm --filter @otb/api test
test_exit_code: 0
test_output_hash: sha256:501ba27d90d3eb83fa400e681a586307476e2be4ae2f220c47ff08e795adbe13
build_command: pnpm nx run web:build --skip-nx-cache
build_exit_code: 0
build_output_hash: sha256:dd3ce045e44a0403499952f4cf78b8eedee11d453161fa8a8dbfdd45ac125f42
```

## Verification Report

**Change**: aporte-multigrupo-multiselect
**Version**: delta specs (aporte-definitions / socios-estados / grupos) + design.md (D23–D32) + tasks.md
**Mode**: Standard (Strict TDD not active)
**Delivery**: 3 chained PRs merged to `dev` — #15 Slice A (MultiSelect), #16 Slice B (backend M:N), #17 Slice C (web integration) — plus remediation PR **#18** (test-only, merged as `7ab27e1`, +12 API tests closing the CRITICAL-1 coverage blocker).
**Report status**: FINAL — re-verification after remediation. The historical FAIL finding (CRITICAL 1: test coverage) is superseded by this report (see "Re-verification (post-remediation)").

> **Envelope note**: `verdict: fail` with `blockers: 0` / `critical_findings: 0` is the validator-consistent machine shape: the validator accepts `pass` only when the scenarios numerator equals the total (70/70); with 4 WARNING-class UI-only PARTIAL scenarios the honest numerator is 66/70, so the only valid envelope is `fail` — same convention as the prior report. The human verdict is **PASS WITH WARNINGS** (see Verdict).

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 13 (T1.1–T5.1) |
| Tasks complete | 13 |
| Tasks incomplete | 0 (T5.1 bullet #168 manual dev-server smoke unchecked — conditional, no UI harness; WARNING, not CRITICAL) |
| Requirements (delta specs) | 9/9 |
| Spec scenarios | 66 COMPLIANT / 4 PARTIAL (UI-only, WARNING class) / 0 UNTESTED = 70 total |

### Build & Tests Execution

**Typecheck** — ✅ Passed (13/13 projects)
```text
> pnpm nx run-many -t typecheck --skip-nx-cache
NX   Successfully ran target typecheck for 13 projects
(exit 0)  [typecheck_output_hash: sha256:f3567261055bd640e7ed8022efa95dbee9130ccdabfaf08d223c10812f0ccc71]
```

**API tests** — ✅ 108 passed / 0 failed / 0 skipped (6 files)
```text
> pnpm --filter @otb/api test
 Test Files  6 passed (6)
      Tests  108 passed (108)
   Duration  825ms (transform 278ms, setup 0ms, collect 3.04s, tests 399ms, environment 0ms, prepare 215ms)
(exit 0)  [test_output_hash: sha256:501ba27d90d3eb83fa400e681a586307476e2be4ae2f220c47ff08e795adbe13]
```

**Web build** — ✅ Passed
```text
> pnpm nx run web:build --skip-nx-cache   # tsc --noEmit && vite build
✓ 1757 modules transformed.
✓ built in 136ms
NX   Successfully ran target build for project @otb/web
(exit 0; pre-existing chunk-size warning >500 kB only)  [build_output_hash: sha256:dd3ce045e44a0403499952f4cf78b8eedee11d453161fa8a8dbfdd45ac125f42]
```

**Coverage**: ➖ Not configured in this repo (no coverage threshold).

### Real-DB Smoke (fresh evidence, `unset DB_URL` — better-sqlite3 empty-string trap)

`pnpm db:migrate` (packages/db) → `migrations applied successfully!` (0007 already journaled → idempotent re-run).

Direct DB query against `packages/db/otb.db` (better-sqlite3):

```text
aportes_definicion columns: ["id","nombre","monto","recurrencia","inicio","fin","modalidad_pago","activo"]
aplica_grupo_id column present: false
definitions count: 5
  ap-mensual     | grupoIds=[] | socioIds=4
  ap-familiar    | grupoIds=[] | socioIds=7
  ap-jubilado    | grupoIds=[] | socioIds=4
  ap-honorario   | grupoIds=[] | socioIds=2
  ea69dfd1-…     | grupoIds=["51e17ab9-e27c-4109-93e1-238831dc2f25"] | socioIds=0
aportes_definicion_grupos rows: [{"definition_id":"ea69dfd1-d0a6-4734-84e6-26d8adbdaf08","grupo_id":"51e17ab9-e27c-4109-93e1-238831dc2f25"}]
cobro records (aportes): 222
backfill idempotency: rows before 1 | after re-run 1 | unchanged: true
```

API-level hydration check (API booted against the real DB, `DB_URL=.../packages/db/otb.db`):

```text
GET /api/aportes-definicion status: 200
definitions count: 5
  ap-mensual | grupoIds=[] | socioIds=4 | activo=1
  ap-familiar | grupoIds=[] | socioIds=7 | activo=1
  ap-jubilado | grupoIds=[] | socioIds=4 | activo=1
  ap-honorario | grupoIds=[] | socioIds=2 | activo=1
  ea69dfd1-… | grupoIds=["51e17ab9-e27c-4109-93e1-238831dc2f25"] | socioIds=0 | activo=1
hydration invariant (grupoIds+socioIds on every def): true
```

Real-DB findings: exactly **1 backfilled join row** (legacy `test` definition → "Manzano A" `51e17ab9-…`, exists — no orphan); all 4 seeded definitions global (`grupoIds: []`); `aplica_grupo_id` column **dropped**; `socioIds` + `grupoIds` hydrated on every definition via the API; 222 cobro records intact; re-running the backfill inserts nothing (idempotent 1→1).

### Spec Compliance Matrix — grupos (10 scenarios, all now COMPLIANT)

| # | Scenario | Test | Result |
|---|----------|------|--------|
| R1 | Create a group | `grupos.test.ts > POST (creación) > crea un grupo con descripcion y responde 201 con la lista completa` | ✅ COMPLIANT |
| R1 | Create a group without nombre is rejected | `> rechaza POST sin nombre con 400` | ✅ COMPLIANT |
| R1 | Create a group without descripcion defaults to null | `> crea un grupo sin descripcion con descripcion=null` | ✅ COMPLIANT |
| R1 | Update a group | `> PUT (actualización) > renombra un grupo y responde 200 con la lista completa` | ✅ COMPLIANT |
| R1 | Update a nonexistent group returns 404 | `> devuelve 404 al actualizar un grupo inexistente` | ✅ COMPLIANT |
| R1 | Delete a group with socios is rejected (409) | `> DELETE (guard 409) > rechaza DELETE de un grupo que es el primario de un socio (409)` | ✅ COMPLIANT |
| R1 | Delete a group used only as additional is rejected (409) | `> rechaza DELETE de un grupo usado solo como adicional (socio_grupos) (409)` | ✅ COMPLIANT |
| R1 | Delete a group referenced by an aporte definition join row is rejected (409, D30 orphan-FK) | `> rechaza DELETE de un grupo referenciado por una definición de aporte (409, D30)` | ✅ COMPLIANT |
| R1 | Delete an unused group succeeds | `> elimina un grupo sin referencias y lo quita del catálogo (200)` | ✅ COMPLIANT |
| R1 | Delete a nonexistent group returns 404 | `> devuelve 404 al eliminar un grupo inexistente` | ✅ COMPLIANT |

### Spec Compliance Matrix — aporte-definitions (39 scenarios)

| # | Scenario | Test | Result |
|---|----------|------|--------|
| R1/Mig | Migration 0007 backfills single-group assignments and drops the column | `aporte-definicion.test.ts > Migración 0007 > crea la tabla de join con PK compuesta` + `> dropea la columna legacy` + `> las definiciones del seed quedan GLOBALES` + real-DB smoke | ✅ COMPLIANT |
| R1/Mig | Re-running the backfill does not duplicate join rows | `> el backfill es idempotente` (INSERT OR IGNORE SELECT) + real-DB pair re-run (1→1) | ✅ COMPLIANT |
| R5 | Edit mode pre-fills current assignments into the MultiSelects | `apps/web/src/routes/aportes.tsx` `openDefinicionEdit` (socioIds/grupoIds pre-fill from D28 hydration); no UI harness | ⚠️ PARTIAL |
| R5 | Filter-as-you-type narrows the dropdown options | `packages/ui/src/components/multi-select.tsx` `visibleOptions` (case-insensitive substring); no UI harness | ⚠️ PARTIAL |
| R5 | Removing all group chips saves the definition as global | **NEW (remediation #18)**: `> T4.2 PUT con grupoIds: [] deja la definición GLOBAL (D24/D25)` — definition persists `grupoIds: []`, no join rows, no socio inherits it via group, already-generated records REMAIN; the UI submit path always declares both arrays (T3.2, source-verified) | ✅ COMPLIANT |
| R5 | The definition list renders one badge per assigned group | `aportes.tsx` per-group Badge map + `+N` overflow (>3 → first 2 + `+N`); no UI harness | ⚠️ PARTIAL |
| R3 | List returns the full catalog of definitions with hydration | `GET > lista el catálogo completo` (asserts `grupoIds: []` AND `socioIds: []` per def) + real-DB smoke (all 5 hydrated) | ✅ COMPLIANT |
| R3 | Create a definition without assignment (a nadie) | `POST > crea una definición "a nadie" ... count 0` (line 48) | ✅ COMPLIANT |
| R3 | Create with a client-supplied id ignores it, server UUID | `POST > un id del body se IGNORA ... (D14)` (line 78) | ✅ COMPLIANT |
| R3 | Create with socioIds assignment generates records (count 4) | `POST > socioIds asigna directo ... (count 4)` (line 91) | ✅ COMPLIANT |
| R3 | Create with socioIds + grupoIds → union deduped (count 3) | `POST > socioIds ∪ miembros actuales ... (count 3)` (line 124) | ✅ COMPLIANT |
| R3 | Create with multiple grupoIds → deduped union (s3 once, count 3) | `POST > T4.2 multi-grupo ... UNA sola fila` (line 142) | ✅ COMPLIANT |
| R3 | Create assigned to a non-permitted socio → 201, kept, 0 records | `POST > un socio cuyo estado no permite aportes ... (201, sin 409)` (line 160) | ✅ COMPLIANT |
| R3 | Create with an unknown socioId is rejected (400, nothing created) | `POST > rechaza un socioId desconocido con 400 y NO crea nada` (line 176) | ✅ COMPLIANT |
| R3 | Create with an unknown grupoId is rejected (400, nothing created) | `POST > rechaza POST con grupoIds desconocido con 400` (line 295) | ✅ COMPLIANT |
| R3 | Create without nombre is rejected | `POST > rechaza POST sin nombre con 400` (line 241) | ✅ COMPLIANT |
| R3 | Create without monto is rejected | `POST > rechaza POST sin monto con 400` (line 250) | ✅ COMPLIANT |
| R3 | Create with a negative monto is rejected | `POST > rechaza POST con monto negativo con 400` (line 259) | ✅ COMPLIANT |
| R3 | Create with an invalid recurrencia is rejected | `POST > rechaza POST con recurrencia inválida con 400` (line 268) | ✅ COMPLIANT |
| R3 | Create with an invalid modalidadPago is rejected | `POST > rechaza POST con modalidadPago inválida con 400` (line 277) | ✅ COMPLIANT |
| R3 | Create with an inverted vigencia window is rejected | `POST > rechaza POST con ventana invertida (fin < inicio) con 400` (line 286) | ✅ COMPLIANT |
| R3 | Create a group-scoped definition generates for CURRENT members, no `socio_aportes` rows | `POST > group-scoped genera para los miembros ACTUALES ... NO materializa socio_aportes` (line 202) + `crea una definición group-scoped con grupoIds` (line 224, join rows asserted) | ✅ COMPLIANT |
| R3 | Update editable fields via PUT | `PUT > actualiza campos editables ... (200)` (line 315) | ✅ COMPLIANT |
| R3 | PUT with an id field does not change the definition id | `PUT > PUT con un id en el body NO renombra la definición (D7)` (line 325) | ✅ COMPLIANT |
| R3 | PUT replaces a declared assignment set atomically, records REMAIN | `PUT > grupoIds DECLARADOS reemplaza la aplicación M:N (D27)` (line 346) + **NEW (remediation #18)**: `> T4.2 PUT con socioIds DECLARADOS reemplaza el set atómicamente y NUNCA borra registros (D27)` (socio_aportes exactly (s3,id), join exactly (id,g2), s1/s2/g1-member records REMAIN, generados.count 24) — both halves now covered | ✅ COMPLIANT |
| R3 | PUT without an assignment field preserves it (re-save no-op) | `PUT > sin grupoIds declarados PRESERVA la aplicación M:N actual (D27)` (line 363) + `PUT > actualiza campos editables` (200, no re-generation asserted in definition PUT — count 0 proven on the socios route, line 108) | ✅ COMPLIANT |
| R3 | PUT adding a new group generates only the missing records | `PUT > T4.2 PUT que AGREGA un grupo genera SOLO para los miembros faltantes` (line 376; count 12 = only s2's 12 months) | ✅ COMPLIANT |
| R3 | Update a nonexistent definition returns 404 | `PUT > devuelve 404 al actualizar una definición inexistente` (line 337) | ✅ COMPLIANT |
| R3 | Delete an unused definition succeeds | `DELETE > elimina una definición sin uso ... (200)` (line 404) | ✅ COMPLIANT |
| R3 | Delete a definition with group join rows cleans them in the same transaction | `DELETE > elimina una definición group-scoped y limpia la join M:N (200, sin 409)` (line 424, join rows asserted 0 after) | ✅ COMPLIANT |
| R3 | Delete a nonexistent definition returns 404 | `DELETE > devuelve 404 al eliminar una definición inexistente` (line 474) | ✅ COMPLIANT |
| R4 | Delete a definition with assignments is rejected (409, catalog kept) | `DELETE > rechaza DELETE ... con asignaciones socio_aportes (409) y la conserva` (line 440) | ✅ COMPLIANT |
| R4 | Delete a definition with generated records is rejected (409, catalog kept) | `DELETE > rechaza DELETE ... con registros generados (409) y la conserva` (line 453) | ✅ COMPLIANT |
| R4 | Delete a definition referenced only by an inactive status succeeds | `DELETE > elimina una definición inactiva sin uso (200)` (line 414) | ✅ COMPLIANT |
| R3 | Fresh seed contains `ap-mensual` as global (`grupoIds: []`) | `GET > lista el catálogo completo` (line 26–38) + migration seed-global assert (line 508) + helpers seed | ✅ COMPLIANT |
| R2 | Group-scoped definition applies to current members at resolution + records at assignment | `POST > group-scoped genera para los miembros ACTUALES` (line 202) + `socios-aportes.test.ts > hereda del grupo primario` (line 199) | ✅ COMPLIANT |
| R2 | Future members inherit + generate at membership | `socios-aportes.test.ts > INVERTIDO: un miembro FUTURO hereda Y recibe registros al momento de la membresía` (line 277) | ✅ COMPLIANT |
| R2 | Removing a member stops the group application without deleting generated records | `socios-aportes.test.ts > quitar al socio del grupo deja de heredar y NO borra los registros generados` (line 312) | ✅ COMPLIANT |
| R2 | A multi-group definition resolves once per socio with the first matching group | `socios-aportes.test.ts > D29: ... UN chip, atribuido al primario` (line 240) | ✅ COMPLIANT |

### Spec Compliance Matrix — socios-estados (21 scenarios)

| # | Scenario | Test | Result |
|---|----------|------|--------|
| R3 | POST socio with a multiselect of aportes generates records per assignment | `socios-aportes.test.ts > POST con múltiples aporteIds persiste ambas asignaciones` (13) + `POST con aporteIds genera los cobros ... en la misma transacción (D16)` (34) | ✅ COMPLIANT |
| R3 | POST socio without aporteIds has no direct assignments | `> POST sin aporteIds no crea asignaciones directas (aporteIds: []) ni registros` (24) | ✅ COMPLIANT |
| R3 | POST with an unknown aporte id is rejected | `> POST con un id de aporte desconocido se rechaza con 400 y no crea el socio` (46) | ✅ COMPLIANT |
| R3 | POST with an inactive aporte id is rejected | `> POST con un aporte inactivo se rechaza con 400` (54) | ✅ COMPLIANT |
| R3 | POST with a non-array aporteIds is rejected | `> POST con aporteIds no-array se rechaza con 400` (62) | ✅ COMPLIANT |
| R3 | POST socio whose estado does not permit aportes → 201, kept, 0 records | `> POST de un socio cuyo estado no permite aportes conserva la asignación y genera 0 (201, sin 409)` (69) | ✅ COMPLIANT |
| R3 | PUT replaces the assignment set atomically without deleting records | `> PUT con aporteIds reemplaza el set atómicamente` (91) + `> PUT reemplazo atómico NUNCA borra registros ya generados` (126) | ✅ COMPLIANT |
| R3 | PUT without aporteIds preserves existing assignments (idempotent re-save) | `> PUT sin aporteIds preserva ... (re-save idempotente, count 0)` (108) | ✅ COMPLIANT |
| R3 | PUT adding a new aporte generates only the missing records | `> PUT agregando un aporte genera SOLO los cobros faltantes` (145) | ✅ COMPLIANT |
| R3 | Full replace of a socio keeps the multiselect intact | `> PUT full reemplazo mantiene el multiselect intacto sin duplicar cobros` (166) | ✅ COMPLIANT |
| R3 | Socio save generates records for group-scoped defs of the final membership through the join table | `> INVERTIDO: un miembro FUTURO hereda Y recibe registros` (277) + `> hereda de primario y secundario` (224, both defs resolved through the join) | ✅ COMPLIANT |
| R5 | The additional-groups MultiSelect excludes the primary group | `apps/web/src/routes/socios.tsx` `excludeValues={[form.watch('grupoPrimarioId')]}` (D32 invariant); no UI harness | ⚠️ PARTIAL |
| R2 | Inherits from the primary group | `> hereda del grupo primario` (199) | ✅ COMPLIANT |
| R2 | Inherits from a secondary group | `> hereda de un grupo adicional (secundario)` (212) | ✅ COMPLIANT |
| R2 | Inherits from both primary and secondary groups (two definitions) | `> hereda de primario y secundario a la vez, cada uno con su grupo fuente` (224) | ✅ COMPLIANT |
| R2 | Def-dedup — multi-group definition renders ONE chip with the primary group | `> D29: una definición que aplica a VARIOS grupos del socio = UN chip, atribuido al primario` (240) | ✅ COMPLIANT |
| R2 | Def-dedup — with no primary match the earliest additional membership wins | `> D29: sin grupo primario, el chip se atribuye al grupo adicional con menor rowid` (259) | ✅ COMPLIANT |
| R2 | A future member inherits automatically and receives records at membership time | `> INVERTIDO: un miembro FUTURO hereda Y recibe registros al momento de la membresía` (277) | ✅ COMPLIANT |
| R2 | Removing a member stops inheritance unless directly assigned, without deleting records | `> quitar al socio del grupo deja de heredar y NO borra los registros generados` (312 — both s1 no-direct and s2 direct halves) | ✅ COMPLIANT |
| R2 | Direct assignment deduplicates the inherited chip | `> una asignación directa deduplica el chip heredado` (338) | ✅ COMPLIANT |
| R2 | Inherited chips are read-only | `> los chips heredados son read-only: PUT sin aporteIds no los altera ni los remueve` (349) | ✅ COMPLIANT |

**Compliance summary**: 66/70 scenarios fully compliant; 4 PARTIAL (UI-behavior scenarios with no UI test harness in the repo — WARNING class); **0 UNTESTED**. All 8 previously-UNTESTED grupos CRUD scenarios, the definition-PUT `socioIds` half of S25, and the explicit `PUT grupoIds: []` → global scenario are now covered by passing runtime tests (remediation PR #18, merged `7ab27e1`).

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| R1 — M:N join table + migration 0007 (D23) | ✅ Implemented | `aportes-definicion-grupos.ts` mirrors `socio-grupos.ts` (composite PK, both FKs); 0007 additive-first CREATE→backfill→DROP; native `ALTER TABLE ... DROP COLUMN` (drizzle-kit's table-recreate breaks under one-transaction migrate with `foreign_keys=ON` — comment documents this); column removed from schema + seed catalog; journal/snapshot in sync |
| R1 — grupos DELETE guard via join (D30) | ✅ Implemented | Third guard branch before membership checks; 409 with definition-specific message |
| R2 — def-dedup stable ordering (D29) | ✅ Implemented | Stable order `[primario, ...adicionales por rowid]`; first-match-wins map; 3 batch queries, no N+1; `gruposPorSocio` gains `.orderBy(rowid)` |
| R3 — POST union across ALL grupoIds (D26) | ✅ Implemented | target = Set(socioIds) ∪ primarios ∪ adicionales per gid, socio-deduped; bulk-exclusion preserved; `201 { definiciones, generados }` |
| R3 — PUT replace/preserve + never-delete (D27) | ✅ Implemented | finals computed before tx; atomic delete+reinsert per declared field; D13 generator over final set (missing-only); `200 { definiciones, generados }` |
| R3 — GET hydration (D28) | ✅ Implemented | `catalogoHidratado()` batch via `grupoIdsPorDefinicion` + `socioIdsPorDefinicion`; POST/PUT responses reuse it |
| R3 — DELETE join cleanup (D28) | ✅ Implemented | Same-transaction delete of join rows before parent; 409 guard unchanged (join rows not a 409 trigger) |
| R4 — scope: core only | ✅ Implemented | Only `aportes.tsx`, `socios.tsx`, `app.store.ts` touched; bulk multas/asistencia/reportes untouched (verified diff) |
| R5 — MultiSelect (D31) | ✅ Implemented | Full props contract, filter-as-you-type, chips + lucide `X`, ↑/↓/Enter/Escape, ARIA listbox/option/aria-selected, `excludeValues`, absolute dropdown inside control, zero new deps; exported from ui index |
| R5 — web integration (D32) | ✅ Implemented | Two MultiSelects on create AND edit with pre-fill; zod drops `aplicaGrupoId`; submit always declares both arrays; edit toast + `fetchAporteRegistros`; per-group badges + `+N`; live hint over deduped union; socios form `excludeValues` |

### Coherence (Design D23–D32)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D23 — join table + migration 0007 additive-first | ✅ Yes | Exact CREATE/backfill/DROP order; deviates only in using native DROP COLUMN instead of drizzle-kit's recreate (documented, proven necessary on the real DB) |
| D24 — core type deltas (`grupoIds`, `AporteInput.grupoIds?`) | ✅ Yes | `AporteInherited`/`Socio`/`CrearDefinicionResponse` unchanged |
| D25 — set-intersection predicate + join query + batch hydration | ✅ Yes | `socioHoldsAporte` set-intersection; `definicionesDeGrupos` join deduped by def; `hidratarGrupoIds` wired into all 4 Aporte-returning paths |
| D26 — POST target union across ALL grupoIds | ✅ Yes | Per-gid loop primario ∪ adicionales + socioIds, deduped; hydrated `defNueva` |
| D27 — PUT replace/preserve + `{ definiciones, generados }` | ✅ Yes | Mirrors socios PUT; preserves on omission; generates missing only; never deletes |
| D28 — GET hydration + DELETE join cleanup | ✅ Yes | Batch hydration on every catalog response; transactional join cleanup |
| D29 — `aportesInherited` def-dedup stable order | ✅ Yes | Primary first, additional by rowid; first match wins |
| D30 — grupos DELETE guard via join | ✅ Yes | 409 with definition-specific message, before membership checks |
| D31 — MultiSelect contract | ✅ Yes | All props/behavior/ARIA/styling per design |
| D32 — UI integration scope (2 routes + store) | ✅ Yes | R4 core scope respected; store `updateAporte` returns `GeneracionResult` |

### Issues Found

**CRITICAL (blocker)**:

None. The single historical CRITICAL (1 — spec-scenario coverage: 10 scenarios without a fully-passing covering test) is **resolved** by remediation PR #18 (merged to `dev` as `7ab27e1`, test-only, +251 lines): NEW `packages/api/test/grupos.test.ts` (10/10 grupos CRUD scenarios) + 2 definition-PUT tests in `aporte-definicion.test.ts` (PUT `socioIds` atomic replace with records-remain asserted — S25 full coverage; PUT `grupoIds: []` → global). 0 UNTESTED scenarios remain.

**WARNING**:

1. **tasks.md T5.1 #168 — manual dev-server smoke unchecked** (conditional task, no UI harness in the repo). Per orchestrator pre-classification: WARNING, not CRITICAL. The API-level real-DB smoke + web production build cover the integration contract (D28 hydration pre-fill data, PUT `{ definiciones, generados }` response, MultiSelect compilation through vite), but interactive behaviors (filter-as-you-type feel, chips ×, keyboard nav, dropdown-in-modal stacking, ~360px wrap) lack runtime evidence.
2. **4 UI-behavior spec scenarios PARTIAL (no UI test harness)**: "Edit mode pre-fills current assignments into the MultiSelects" (`openDefinicionEdit` pre-fill — source-verified), "Filter-as-you-type narrows the dropdown options" (`visibleOptions` filter — source-verified), "The definition list renders one badge per assigned group" (Badge map + `+N` — source-verified), "The additional-groups MultiSelect excludes the primary group" (`excludeValues={[form.watch('grupoPrimarioId')]}` — source-verified). Same evidence class as #168 → WARNING.

**SUGGESTION**:

1. Stand up a UI test harness (e.g. Playwright/Testing Library) if interactive MultiSelect behaviors become a recurring risk surface — until then the 4 UI PARTIAL scenarios stay source-verified only.
2. `multi-select.tsx` uses `aria-placeholder` (non-standard on an input) for `searchPlaceholder` — consider using it as the visible `placeholder` when provided, or dropping the attribute.
3. Pre-existing: web bundle 814 kB chunk-size warning — out of scope, worth a future code-splitting pass.
4. Pre-existing, unchanged, out of scope (noted in remediation): the grupos route's PUT does not validate `nombre` (400 only on POST) — archived spec gap in unchanged code.

### Re-verification (post-remediation) — supersedes the historical FAIL

The first verification (PRs #15/#16/#17, evidence `4d9759f5…`, verdict FAIL, blockers 1) found **no functional defect** — the blocker was strict spec-scenario coverage: 8 grupos CRUD scenarios UNTESTED (no `grupos.test.ts` ever existed), the definition-PUT `socioIds` half of S25 untested, and no explicit `PUT grupoIds: []` → global test (14/70 scenarios not fully runtime-covered; 96/96 tests passing).

Remediation (PR #18, merged to `dev` as `7ab27e1`, test-only, +251 lines): closed every API-testable gap. Re-verification with fresh evidence (`--skip-nx-cache`, no cached results):

| Check | Before | After (fresh) |
|-------|--------|---------------|
| API test files | 5 | **6** |
| API tests | 96 | **108** |
| Requirements | 9/9 | **9/9** |
| Scenarios compliant | 56/70 | **66/70** |
| Scenarios UNTESTED | 8 | **0** |
| Typecheck | 13/13 | **13/13** |
| Web build | pass | **pass** |
| Real-DB smoke | green | **green** (migrate idempotent, 5 defs hydrated, `aplica_grupo_id` dropped, 1 join row, 222 cobros intact) |

The historical `fail` envelope (`scenarios: 56/70`, `test_output_hash: 20b74f7d…`, 96-test run) is retained in the prior report revision and is **superseded** by this final envelope (`scenarios: 66/70`, `test_output_hash: 501ba27d…`, 108-test run, `evidence_revision: 56816a5f…`).

### Verdict

**PASS WITH WARNINGS** (validator envelope `fail` + `blockers: 0` + `critical_findings: 0` — the validator's binary rule admits `pass` only at 70/70; with 4 WARNING-class UI-only PARTIAL scenarios the honest numerator is 66/70, so `fail` with zero blockers/criticals is the validator-consistent shape, same convention as the prior report).

CRITICAL 1 (test coverage) is **resolved** by remediation PR #18: 0 UNTESTED, 108/108 API tests, 13/13 typecheck, web build green, real-DB smoke green, no failing tests, no data risk, D13 dedup invariant intact. The only remaining findings are WARNING-class by orchestrator pre-classification: tasks.md #168 manual dev-server smoke (no UI harness) and 4 UI-behavior scenarios PARTIAL (source-verified, no UI test harness). **Archive-ready** — no blockers, no CRITICAL, no UNTESTED scenarios remain.
