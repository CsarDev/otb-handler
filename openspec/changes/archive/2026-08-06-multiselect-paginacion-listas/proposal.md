# Proposal: multiselect-paginacion-listas — Searchable MultiSelect for Multas + Pagination of Growing Lists

## Summary

The user asked to apply the proven searchable MultiSelect pattern wherever it fits and to paginate lists that grow over time. Multas creation still uses a checkbox scrollbox and bypasses the store with a raw `fetch('/api/multas/bulk')`, and it cannot charge whole groups; meanwhile GET /multas and GET /aportes return bare arrays with no limit/offset, no count, and no deterministic ORDER BY. This change brings multas assignment to parity with aportes (D32): a searchable MultiSelect for socios AND grupos, with `POST /api/multas/bulk` accepting optional `grupoIds`; and adds real pagination to the two growing lists with a shared envelope and a reusable `Pagination` component.

## Change Name

`multiselect-paginacion-listas`

## What

**WS1 — Multas assignment (MultiSelect + groups)**
- Replace checkbox scrollbox (multas.tsx:163-177) with searchable MultiSelect for socios; add a second MultiSelect for grupos.
- `POST /api/multas/bulk` accepts optional `grupoIds?: string[]`; resolves the deduped union of CURRENT members (primario OR adicional, reusing `gruposAdicionalesPorSocio` pattern from `packages/api/src/lib/aportes.ts`), applies the existing permission filter (`permite(...,'multas')`), and materializes one multa per socio via the existing bulk loop. No schema change, no migration, no DELETE-guard change. Semantics: the fine is a point-in-time charge to members at creation — NOT retroactive to later joiners.
- Move the raw `/api/multas/bulk` fetch into a store action (`createMultasBulk`).

**WS2 — Pagination (GET /multas + GET /aportes)**
- Paginated envelope `{ items, total, page, pageSize }` (limit/offset + COUNT) on GET /multas and GET /aportes.
- Deterministic ORDER BY: multas `fechaGen DESC, id DESC`; aportes `gestion DESC, mes DESC, id DESC`.
- New `Pagination` UI component in `@otb/ui` (default page size 25).
- Store holds page/pageSize/total; page resets to 1 on any filter change.

## Why

- Business: admins create fines for whole groups (e.g. a grupo that skipped an activity) — today they must hand-pick every socio; and list tabs (multas list, aportes pagar tab) degrade as rows grow.
- Honest volume assessment (from exploration): socios = 17 rows → NO pagination (out of scope); multas grows per batch and aportes = 222 cobros growing ~200+/yr → YES, paginate both; per-record payment modals are bounded → no; libro diario is borderline → defer.
- Hygiene: the raw fetch in multas.tsx bypasses the store, unlike every other flow.

## Success Criteria

- [ ] Multas can be created for a whole grupo (one multa per current member, deduped, permission-filtered) — via UI and API.
- [ ] `POST /api/multas/bulk` with `grupoIds` returns `{ count, items }` with 201; absent `grupoIds` behaves exactly as today (backward compatible).
- [ ] `GET /api/multas` and `GET /api/aportes` return `{ items, total, page, pageSize }` with deterministic order across pages (no duplicates/gaps).
- [ ] `Pagination` component renders and drives page changes; page resets to 1 on filter change.
- [ ] All 6 existing test suites pass; a new multas suite covers bulk-with-grupoIds + envelope.

## Non-Goals

- Pagination on socios (17 rows), asistencia, reportes selectors, libro diario, per-record payment modals.
- M:N `multa_grupos` tracking or retroactive group charges (rejected in exploration — high cost, point-in-time semantics chosen).
- Egresos, actividades, dashboard.
- Groups DELETE-guard changes (no new references to grupos).
- Schema changes / migrations.

## Approach

API contract shapes:

```text
GET /api/multas?page=1&pageSize=25&<existing filters>
  → 200 { items: MultaRow[], total, page, pageSize }   // ORDER BY fechaGen DESC, id DESC
GET /api/aportes?page=1&pageSize=25&<existing filters>
  → 200 { items: AporteRow[], total, page, pageSize }  // ORDER BY gestion DESC, mes DESC, id DESC
POST /api/multas/bulk { socioIds?, grupoIds?, concepto, monto, actividadId? }
  → 201 { count, items }   // grupoIds: optional; union w/ socioIds, dedup, permit-filter
```

Envelope decision: **always-envelope (option C)** for these two routes — all consumers are in-repo and updated in the same change (design phase may fall back to C′ only-when-`limit` if the user objects; see Open Questions).

UI component contract: `@otb/ui` exports `Pagination { page, total, pageSize, onPageChange }`. Shared helper extracted from `lib/aportes.ts` for group-member resolution (mirrors D32).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/api/src/routes/multas.ts` | Modified | GET / envelope + ORDER BY; POST /bulk `grupoIds` expansion |
| `packages/api/src/routes/aportes.ts` | Modified | GET / envelope + ORDER BY |
| `packages/api/src/lib/aportes.ts` | Modified | Extract reusable group-member union helper |
| `packages/core/src/index.ts` | Modified | `Paginated<T>` type; filters gain page/pageSize |
| `packages/ui/src/components/pagination.tsx` | New | `Pagination` component (+ export from index) |
| `apps/web/src/routes/multas.tsx` | Modified | MultiSelect socios+grupos; paginated list; store action |
| `apps/web/src/routes/aportes.tsx` | Modified | Pagination wiring on pagar tab; reset page on filter |
| `apps/web/src/stores/app.store.ts` | Modified | `createMultasBulk`; page/pageSize/total state; envelope handling |
| `packages/api/test/multas.test.ts` | New | Bulk grupoIds + pagination envelope suite (none exists today) |
| `packages/api/test/*` (existing 6 suites) | Modified | Aportes suites gain pagination coverage; others untouched |

## Dependencies & Impacts

- Routes changed: multas (GET + POST /bulk), aportes (GET). Stores: `app.store.ts`. UI: `@otb/ui` new component.
- Tests: multas currently has **NO** suite — this change adds `packages/api/test/multas.test.ts`. Existing 6 suites: only aportes-related ones gain pagination cases; zero churn on grupos/socios suites.
- No external deps; no migration. Follows patterns from archived `aporte-multigrupo-multiselect` (D32) for group expansion and `socio_grupos` queries.

## Open Questions

1. **Page size**: default 25 (recommended) or 50? Fixed per-list or configurable?
2. **Envelope**: always `{items,total,page,pageSize}` (breaking, recommended — all consumers in-repo) vs backward-compatible only-when-`limit` (C′)?
3. **Multa-to-group semantics**: confirm point-in-time charge to CURRENT members only (a socio joining the group later is NOT retrocharged, and no M:N tracking) — main semantic.
4. **Create-form UX**: group MultiSelect optional and combinable with direct socios (union)? Wording for group-created fines (e.g. "se aplicará a todos los socios del grupo")?

## Suggested Slices (chained-PR structure)

- **Slice A — Backend**: POST /bulk `grupoIds` expansion + shared group-union helper + envelope/ORDER BY on GET /multas and GET /aportes + `Paginated<T>` + new multas test suite + aportes pagination tests.
- **Slice B — Web multas**: MultiSelect socios+grupos in create form; `createMultasBulk` store action (removes raw fetch); paginated multas list wiring + page state.
- **Slice C — Pagination UI + aportes**: `Pagination` component in `@otb/ui` + export; aportes pagar-tab wiring; shared page-reset-on-filter behavior.
- **Slice D — Tests & polish**: edge cases (empty state, last page overflow, total=0), a11y, copy, full regression.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Envelope breaks any consumer missed in-repo | Med | All consumers updated in same change; verify pass + new suite; C′ fallback reserved |
| Group membership drift surprises admins (no retrocharge) | Med | Document point-in-time semantics in UI copy + spec scenarios |
| Bare-array consumers elsewhere (e.g. dashboard) untouched | Low | Explicitly scoped — only GET /multas and GET /aportes change shape |

## Rollback Plan

- Fully additive except the two GET response shapes. Rollback = git revert of the two route handlers + store envelope handling + UI wiring; no data migration needed (no schema change). grupoIds support is optional, so POST /bulk reverts cleanly to socioIds-only.
