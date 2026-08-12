# Proposal: Advanced Configurable Pagination (paginacion-avanzada)

## Summary

The user wants standard, configurable pagination applied to every data-heavy, filterable section of the app. Today the shared `Pagination` component (`packages/ui/src/components/pagination.tsx`, 58 lines) only renders prev/next + "Página X de Y", with no page numbers, no first/last, no ellipsis, and no user-configurable page size. As lists grow — multas, aportes, and especially the libro diario (which grows with every payment) — prev/next-only navigation becomes impractical and rows per page cannot be controlled. This change upgrades the component additively (backward compatible), makes page size user-configurable per list, and brings the libro diario report onto the same pagination contract.

## Change name

`paginacion-avanzada`

## What

**WS1 — Pagination standard** (`packages/ui`)
- Upgrade `Pagination` additively: optional props `onPageSizeChange?`, `pageSizeOptions?`, `maxSlots?` — the 2 existing call sites compile unchanged.
- Add first/last controls, page-number buttons with ellipsis window, `aria-current="page"` on the current page button.
- New pure helper `paginacion-window.ts` (`paginasVisibles(page, totalPages, maxSlots=7)`) + dedicated vitest tests.
- Native `<select>` page-size selector (`aria-label="Filas por página"`) rendered LEFT of controls, only when `onPageSizeChange` is provided.
- Responsive: app-wide `sm:` (640px) breakpoint (NOT `md:`); below `sm:` hide numbers + first/last (`hidden sm:flex`), keep prev / info / next + size select.

**WS2 — Store page size** (`apps/web`)
- New setters `setMultasPageSize(size, filters)` / `setAporteRegistrosPageSize(size, filters)` + libroDiario equivalents.
- Clamp to options, reset page to 1, refetch (server echo updates total/pageSize). Existing reset effects don't include pageSize in deps → safe.

**WS3 — Libro diario server pagination** (`packages/api`)
- `GET /api/reportes/libro-diario`: `parsePaginacion` + envelope `{items,total,page,pageSize}` + `id DESC` tiebreak on `orderBy(fecha)` for determinism (D34 pattern).
- Store state `libroDiarioPage/PageSize/Total` + setters, page-reset effect, `Pagination` render in reportes.tsx.

## Why

- Growing lists degrade: libro diario grows with every payment; multas/aportes accumulate per period.
- Standard UX: page numbers, first/last, and rows-per-page control are expected in data-dense tables; prev/next-only is impractical past a few pages.
- Responsive: mobile currently forces blind next-clicking; the `sm:` rule keeps a usable compact control.
- Honest volume: multas/aportes are bounded by monthly windows; libro diario is unbounded. No list today exceeds ~hundreds of rows — pagination here is for correctness + UX consistency, not current-scale necessity.

## Success criteria

- [ ] Changing the page-size selector refetches with the new pageSize and resets page to 1 (multas, aportes, libro diario)
- [ ] First/prev/next/last navigation works; current page button carries `aria-current="page"`
- [ ] `paginasVisibles` renders ≤7 slots for huge N, all pages when totalPages ≤ 7, ellipsis where gap > 1, and keeps rendering on out-of-range page
- [ ] `GET /api/reportes/libro-diario` returns `{items,total,page,pageSize}` with deterministic order (fecha ASC, id DESC); pageSize capped at 100
- [ ] All existing tests + new `paginacion-window` tests pass; `pnpm typecheck` clean
- [ ] The 2 existing call sites (multas.tsx, aportes.tsx) compile and render unchanged (additive API only)

## Non-goals

- Paginating socios (~17 rows), egresos (small, adopt-ready), asistencia (radio-grid harms UX), dashboard/config/definiciones/pagos-modal (bounded)
- localStorage persistence of page size (app has zero localStorage usage today; additive later)
- Paginating any endpoint beyond multas / aportes / libro diario
- Changing the envelope shape of the existing multas/aportes endpoints

## Approach

**Component contract — additive only (backward compatible):**
```ts
export type PaginationProps = {
  page: number; total: number; pageSize: number; onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;   // renders the size selector when provided
  pageSizeOptions?: number[];                       // default [10, 25, 50, 100]
  maxSlots?: number;                                // default 7
};
```

**Ellipsis algorithm** — `paginasVisibles(page, totalPages, maxSlots=7)`: visible set = `{1, totalPages, page-1, page, page+1} ∩ [1, totalPages]`, sorted; insert `…` where gap > 1; totalPages ≤ 7 → all pages; huge N → ≤7 slots; out-of-range page keeps rendering so the user can navigate back.

**Page-size selector** — native `<select>`, zero-dep, `aria-label="Filas por página"`, left of controls, only when `onPageSizeChange` provided. Options `[10, 25, 50, 100]` default 25; server cap 100 stays in sync — no extra client clamp.

**Store setters** — clamp size to options, reset page to 1, refetch; server echo keeps total/pageSize in sync.

**Libro diario API — before / after:**
```
BEFORE  GET /api/reportes/libro-diario            → 200 [ {id,tipo,monto,fecha,...} ]     (orderBy fecha only — non-deterministic)
AFTER   GET /api/reportes/libro-diario?page&pageSize → 200 { items, total, page, pageSize } (orderBy fecha ASC, id DESC)
```

**Responsive** — numbers + first/last `hidden sm:flex`; prev / info / next + size select always visible; `sm:` (640px) to match the rest of the app.

## Dependencies & impacts

| Area | Impact | Description |
|------|--------|-------------|
| `packages/ui/src/components/pagination.tsx` | Modified | Additive props, numbers/ellipsis/first/last, aria-current, size select, sm: rule |
| `packages/ui/src/lib/paginacion-window.ts` | New | Pure `paginasVisibles` helper |
| `packages/ui/src/lib/paginacion-window.test.ts` | New | Vitest for the window algorithm — packages/ui has a vitest script (`--passWithNoTests`) but ZERO test files today; this helper MUST get its own tests |
| `packages/ui/src/index.ts` | Modified | Export `paginasVisibles` |
| `apps/web/src/stores/app.store.ts` | Modified | Page-size setters + libroDiario page/pageSize/total state |
| `apps/web/src/routes/multas.tsx` | Modified | Pass `onPageSizeChange` (call site API otherwise unchanged) |
| `apps/web/src/routes/aportes.tsx` | Modified | Pass `onPageSizeChange` (call site API otherwise unchanged) |
| `apps/web/src/routes/reportes.tsx` | Modified | Libro diario: envelope unpacking, state, page-reset effect, Pagination render |
| `packages/api/src/routes/reportes.ts` | Modified | Libro diario envelope + `id DESC` tiebreak (`parsePaginacion` reused, cap 100) |
| `openspec/specs/pagination/spec.md` | Modified | Component + store requirements extended |
| `openspec/specs/reports/spec.md` | Modified | Libro diario response shape + deterministic order |

## Capabilities

> Contract with the sdd-spec phase (researched against `openspec/specs/`).

### New Capabilities
- `paginacion-window`: pure ellipsis-window function `paginasVisibles` contract — slot cap (≤7), all-pages short-circuit (≤7 pages), ellipsis on gaps, edge pages (1, totalPages), out-of-range page behavior

### Modified Capabilities
- `pagination`: component requirement gains page numbers / ellipsis / first-last / `aria-current="page"` / page-size selector; store requirement gains page-size setters (clamp to options, reset page to 1, refetch)
- `reports`: libro-diario requirement — response shape array → envelope `{items,total,page,pageSize}`, deterministic order (fecha ASC, id DESC), pageSize cap 100

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Libro diario envelope is a breaking API shape change | Med | Only in-repo consumer (reportes.tsx) updated in the same change |
| Ellipsis edge cases (near page 1 / totalPages, out-of-range) | Low | Pure function + dedicated vitest suite covering edge pages |
| Existing `pagination` spec scenarios describe the prev/next-only component | Med | Delta spec MODIFIES the component requirement, preserving backward-compat scenarios |

## Rollback plan

No schema or migration involved. Revert from git: (1) `reportes.ts` envelope → bare array + revert the web consumer; (2) delete `paginacion-window.ts` + its test and restore `pagination.tsx`; (3) revert store setters and route wiring. Additive props mean old call sites never depend on new behavior — safe, low-risk revert.

## Open questions

1. **Egresos in v1?** The egresos list is small and adopt-ready — include now or defer to a follow-up change?
2. **Socios despite ~17 rows?** Dense table — do we want the standard control anyway for consistency?
3. **localStorage persistence now or defer?** App has zero localStorage usage today; deferring keeps the change additive.
4. **Default page size 25 vs 10?** 25 matches the server default and current component; 10 shows fewer rows per screen on dense tables.

## Suggested slices (chained PRs)

- **Slice A** — backend libro diario envelope + `id DESC` tiebreak; `paginacion-window.ts` helper + vitest tests (independent, testable)
- **Slice B** — component upgrade (additive props, numbers/ellipsis/first/last, aria-current, size select, sm: rule) + store page-size setters
- **Slice C** — route wiring: multas/aportes pass `onPageSizeChange`; reportes.tsx libro diario state + Pagination render
- **Slice D** — polish/regression: responsive pass, a11y audit, full `pnpm test` + `pnpm typecheck`
