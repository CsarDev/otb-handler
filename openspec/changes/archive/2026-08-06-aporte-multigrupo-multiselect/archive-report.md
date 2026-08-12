# Archive Report

**Change**: aporte-multigrupo-multiselect
**Archived**: 2026-08-06
**Verdict**: PASS WITH WARNINGS (validator envelope `fail` + `blockers: 0` + `critical_findings: 0` — see Verification Evidence)
**Archive class**: intentional-with-warnings (orchestrator-approved WARNING-class carryover; no blockers, no CRITICAL)
**Artifact store mode**: both (OpenSpec files + Engram observation `sdd/aporte-multigrupo-multiselect/archive-report`)
**Archived to**: `openspec/changes/archive/2026-08-06-aporte-multigrupo-multiselect/`

---

## Summary

The change converts aporte definition→group application from a singular nullable FK (`aplica_grupo_id`) to a true M:N relationship (`aportes_definicion_grupos` join table + migration `0007`), lets definitions be assigned to MULTIPLE groups with deduped union generation (D26), adds PUT assignment semantics (replace-when-declared / preserve-when-omitted, never deletes records, `{ definiciones, generados }` response — D27), hydrates `grupoIds`+`socioIds` on every catalog read for faithful edit pre-fill (D28), applies def-dedup to `aportesInherited` with stable ordering (D29), closes the orphan-FK gap in the grupos DELETE guard (D30), and replaces the assignment UI with a hand-rolled searchable MultiSelect used on the definition form (create AND edit) and the socio form (D31/D32).

## Scope Delivered

- **Schema/migration**: `aportes_definicion_grupos` composite-PK join table; migration `0007` additive-first (CREATE join → backfill from `aplica_grupo_id` → `DROP COLUMN aplica_grupo_id`); Drizzle model + schema export; journal/snapshot in sync.
- **Core types**: `Aporte.aplicaGrupoId` → `Aporte.grupoIds: string[]`; `AporteInput.grupoIds?`; `AporteInherited`/`Socio`/`CrearDefinicionResponse` unchanged.
- **API**: `lib/aportes.ts` set-intersection predicate + join query + batch hydration (`hidratarGrupoIds` on every `Aporte`-returning path); `routes/aportes-definicion.ts` POST union across ALL groups, PUT replace/preserve, GET hydration, DELETE transactional join cleanup; `routes/socios.ts` def-dedup via join with stable ordering; `routes/grupos.ts` third 409 guard.
- **UI**: `packages/ui` `multi-select.tsx` (zero new deps, chips, filter-as-you-type, keyboard, ARIA); `routes/aportes.tsx` two MultiSelects on create/edit + per-group badges + `+N`; `routes/socios.tsx` MultiSelect with `excludeValues`; `app.store.ts` `updateAporte` returns `GeneracionResult`.
- **Tests**: helpers/5-suite mechanical rework to the M:N shape + new coverage (multi-group POST, PUT semantics, groups 409, hydration, join cleanup, chip def-dedup) + NEW `grupos.test.ts` (10 CRUD scenarios).

## Delivery — PRs (all merged to `dev`)

| PR | Slice | Content | Merge |
|----|-------|---------|-------|
| #15 | Slice A | MultiSelect component + ui index export (T3.1) | merged to `dev` |
| #16 | Slice B | Backend M:N flip — migration 0007, core types, lib helpers, all 3 API routes, test reworks + new coverage (T1.1–T2.4, T4.1, T4.2) | merged to `dev` |
| #17 | Slice C | Web integration — store, both route flips, final gate (T3.2–T3.4, T5.1) | merged to `dev` |
| #18 | Remediation | Test-only (+251 lines): `grupos.test.ts` + 2 definition-PUT tests; closes the historical CRITICAL-1 coverage blocker | merged to `dev` as `7ab27e1` (dev HEAD) |

**dev HEAD = `7ab27e1`.** The dev→main integration PR is intentionally NOT created in this phase — the maintainer will promote later (see Follow-Up).

## Verification Evidence (final, per verify-report + final-state handoff)

- **Re-verify FINAL**: PASS WITH WARNINGS — **66 COMPLIANT / 4 PARTIAL (UI-only, WARNING class) / 0 UNTESTED / 0 blockers / 0 CRITICAL**.
- Typecheck: **13/13 projects** (`pnpm nx run-many -t typecheck --skip-nx-cache`, exit 0).
- API tests: **108/108 passed (6 files)** (`pnpm --filter @otb/api test`, exit 0, `test_output_hash: sha256:501ba27d…`).
- Web build: **pass** (`pnpm nx run web:build --skip-nx-cache`, exit 0, `build_output_hash: sha256:dd3ce045…`; pre-existing >500 kB chunk warning only).
- Real-DB smoke (fresh evidence, `unset DB_URL`): migration `0007` applied (idempotent re-run) — `aplica_grupo_id` column **dropped**, **exactly 1 backfilled join row** (legacy `test` definition → "Manzano A" `51e17ab9-…`, exists, no orphan), 4 seeded definitions global (`grupoIds: []`), backfill idempotent (1→1), 222 cobro records intact, hydration invariant `grupoIds`+`socioIds` on every definition via API (5/5).
- Historical FAIL (first verification, `scenarios: 56/70`, evidence `4d9759f5…`, blockers 1 = coverage) is **superseded** by this final envelope (`scenarios: 66/70`, `test_output_hash: 501ba27d…`, `evidence_revision: 56816a5f…`).

## Task Completion Gate — Reconciliation Record

The persisted `tasks.md` has **13/13 tasks complete** with ONE unchecked bullet: **T5.1 #168 — manual dev-server smoke** (`- [ ] Manual dev-server smoke (if harness available)…`). Per the orchestrator's explicit final-state instruction, this is a **WARNING-class carryover, NOT a blocker**: the task is conditional ("if harness available") and the repo has **no UI test harness**, so it could not be executed. The API-level real-DB smoke + web production build cover the integration contract; the interactive behaviors remain source-verified only. The orchestrator explicitly approved archiving with this unchecked conditional verification bullet; the archive is therefore **intentional-with-warnings**. No implementation task is unchecked.

## WARNING Carryover (documented, NOT blockers)

1. **tasks.md T5.1 #168 — manual dev-server smoke unchecked** (no UI harness in the repo; conditional task). Interactive behaviors (filter-as-you-type feel, chips ×, keyboard nav, dropdown-in-modal stacking, ~360px wrap) lack runtime evidence.
2. **4 UI-behavior spec scenarios PARTIAL (source-verified only, no UI test harness)**:
   - "Edit mode pre-fills current assignments into the MultiSelects" (`openDefinicionEdit` pre-fill from D28 hydration).
   - "Filter-as-you-type narrows the dropdown options" (`visibleOptions` case-insensitive substring).
   - "The definition list renders one badge per assigned group" (Badge map + `+N` overflow).
   - "The additional-groups MultiSelect excludes the primary group" (`excludeValues={[form.watch('grupoPrimarioId')]}`).
   Same evidence class as #168 → WARNING.

## SUGGESTION (out of scope, pre-existing)

- **grupos route PUT does not validate `nombre`** on update (400 only on POST) — pre-existing, unchanged code, recorded in verify-report; candidate for a future change (see Follow-Up).

## Spec Sync Summary

| Domain | Action | Details |
|--------|--------|---------|
| `aporte-definitions` | Updated (2 ADDED, 4 MODIFIED, 1 RENAMED) | **ADDED** "M:N Join Table — `aportes_definicion_grupos` and Migration 0007" (2 scenarios) + "Searchable MultiSelect — 'Asignar a' on Create and Edit" (4 scenarios). **MODIFIED** "Definition CRUD — Aportes" (grupoIds validation, POST union across ALL groups, PUT replace/preserve + `{ definiciones, generados }`, GET hydration, DELETE join cleanup — 25 scenarios), "DELETE Guard" (join rows NOT a 409 trigger), "Seed of Default Definitions" (`grupoIds: []` global). **RENAMED + MODIFIED** "Group Application — aplicaGrupoId" → "Group Application — grupoIds (M:N, Dynamic, Generation at Assignment/Membership)" (def-dedup R2, first-match stable order — 4 scenarios). Description/Endpoints/Frontend Spec/Validation/Error States updated to the M:N state. |
| `socios-estados` | Updated (2 MODIFIED requirements) | **MODIFIED** "Socio Model — aporteIds Multiselect (Many-to-Many)" (group-scoped resolution through the join table + MultiSelect form with `excludeValues` — 12 scenarios) and "Group Inheritance — Read-Only Inherited Aportes (Dynamic)" (M:N intersection + def-dedup stable ordering — 9 scenarios). All other requirements (catalog CRUD, migración, baja, enforcement) preserved verbatim. |
| `grupos` | Updated (1 MODIFIED requirement) | **MODIFIED** "Group CRUD" — DELETE guard gains the third reference check `aportes_definicion_grupos` (orphan-FK gap fixed) + NEW scenario "Delete a group referenced by an aporte definition join row is rejected" (10 scenarios). Description + Error States 409 row updated. |
| `payments` | **Untouched** | Byte-identical (`sha256: b231b05c…` before and after); D13 dedup unchanged. |

**Merge integrity**: requirements matched/inserted by name; requirements not mentioned in the deltas preserved verbatim; delta `(Previously: …)` annotations and superseded clauses did NOT leak into main specs; scenario counts after merge = 39 (aporte-definitions) / 47 (socios-estados: 26 preserved + 21 delta) / 20 (grupos: 10 preserved + 10 delta).

## Follow-Up (not blockers)

- **grupos PUT `nombre` validation**: pre-existing gap — `PUT /api/grupos/:id` does not validate `nombre` (400 only on POST). Candidate for a future change.
- **dev→main promotion pending maintainer**: the dev→main integration PR was intentionally NOT created in this phase; the maintainer will promote `dev` (HEAD `7ab27e1`) to `main` later.
- **UI test harness**: stand up Playwright/Testing Library if interactive MultiSelect behaviors become a recurring risk surface — until then the 4 UI PARTIAL scenarios stay source-verified only (verify-report SUGGESTION 1).

## Archive Contents

- proposal.md ✅
- specs/ ✅ (aporte-definitions, socios-estados, grupos)
- design.md ✅
- tasks.md ✅ (13/13 tasks complete; 1 conditional verification bullet unchecked — WARNING carryover, orchestrator-approved)
- verify-report.md ✅
- archive-report.md ✅

## Source of Truth Updated

The following main specs now reflect the new behavior:
- `openspec/specs/aporte-definitions/spec.md`
- `openspec/specs/socios-estados/spec.md`
- `openspec/specs/grupos/spec.md`

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. Ready for the next change.
