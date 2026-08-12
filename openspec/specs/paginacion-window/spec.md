# Paginacion Window — `paginasVisibles` Ellipsis Window Helper

## Capability

`paginacion-window` (NEW — no existing main spec)

## Description

Pure-function contract for computing the page-number window of the `Pagination` component. The window shows the first and last pages, the pages around the current one, and an ellipsis (…) wherever the gap between consecutive page numbers is > 1, capped at `maxSlots` slots (default 7). The function is a dependency of the `pagination` capability: the component's page-number buttons and its ellipsis behavior MUST be driven by this helper. Because it is pure, it is fully unit-testable — `packages/ui` currently has ZERO test files (the vitest script runs with `--passWithNoTests`), so this helper MUST ship the package's first vitest suite.

## Endpoints / Components

| Location | Type | Description |
|----------|------|-------------|
| `packages/ui/src/lib/paginacion-window.ts` | New | Pure `paginasVisibles(page, totalPages, maxSlots?)` window helper |
| `packages/ui/src/lib/paginacion-window.test.ts` | New | First vitest suite in `packages/ui` (covers every contract case) |
| `packages/ui/src/index.ts` | Modified | Export `paginasVisibles` from `@otb/ui` |

## Requirements

### Requirement: paginasVisibles — Pure Ellipsis Window Function

`packages/ui` MUST export a pure function `paginasVisibles(page: number, totalPages: number, maxSlots?: number): (number | 'ellipsis')[]` (default `maxSlots` 7), re-exported from `@otb/ui`. The visible set SHALL be `{1, totalPages, page-1, page, page+1} ∩ [1, totalPages]`, sorted ascending, and SHALL insert the string `'ellipsis'` between consecutive numbers whose gap is > 1. When `totalPages ≤ 7` (≤ maxSlots) the function SHALL return ALL pages with NO ellipsis. For any input the returned array SHALL NEVER exceed `maxSlots` elements. When `page` is out of range (page < 1 or page > totalPages) the function SHALL keep a navigable window — at minimum page 1 and totalPages, with ellipsis where the gap demands it — so the user can navigate back. The function SHALL be deterministic and side-effect free (no I/O, no state).

#### Scenario: All pages when totalPages ≤ 7 — NEW

- GIVEN totalPages=5
- WHEN paginasVisibles(3, 5) is called
- THEN it SHALL return [1, 2, 3, 4, 5] (all pages, NO ellipsis)

#### Scenario: Window around a middle page — NEW

- GIVEN totalPages=20 and page=5
- WHEN paginasVisibles(5, 20) is called
- THEN it SHALL return [1, 'ellipsis', 4, 5, 6, 'ellipsis', 20]

#### Scenario: Edge page 1 — NEW

- GIVEN totalPages=20 and page=1
- WHEN paginasVisibles(1, 20) is called
- THEN it SHALL return [1, 2, 'ellipsis', 20]

#### Scenario: Edge page totalPages — NEW

- GIVEN totalPages=20 and page=20
- WHEN paginasVisibles(20, 20) is called
- THEN it SHALL return [1, 'ellipsis', 19, 20]

#### Scenario: Ellipsis on both sides when far from the edges — NEW

- GIVEN totalPages=20 and page=10
- WHEN paginasVisibles(10, 20) is called
- THEN it SHALL return [1, 'ellipsis', 9, 10, 11, 'ellipsis', 20]

#### Scenario: Out-of-range page returns a navigable window — NEW

- GIVEN totalPages=2 and page=9 (page > totalPages)
- WHEN paginasVisibles(9, 2) is called
- THEN it SHALL return [1, 2] (the user can navigate back to page 1)
- GIVEN totalPages=20 and page=30
- WHEN paginasVisibles(30, 20) is called
- THEN it SHALL return [1, 'ellipsis', 20] (page 1 and totalPages always present)

#### Scenario: maxSlots is never exceeded — NEW

- GIVEN totalPages=10_000 and page=5_000
- WHEN paginasVisibles(page, totalPages) is called (and swept over pages 1..totalPages)
- THEN the returned array length SHALL be ≤ 7 in every case

### Requirement: Dedicated Vitest Suite

The helper MUST ship a dedicated vitest suite at `packages/ui/src/lib/paginacion-window.test.ts` covering every contract case above. `packages/ui` currently has ZERO test files; this suite SHALL be the package's first test file and SHALL be executed by the existing vitest script (currently running with `--passWithNoTests`).

#### Scenario: The suite runs under the existing vitest script — NEW

- GIVEN `packages/ui` has a vitest script (with --passWithNoTests)
- WHEN the script runs (e.g. `pnpm --filter @otb/ui test`)
- THEN the paginacion-window.test.ts suite SHALL execute with real tests (not skipped by passWithNoTests)

#### Scenario: Every contract case has a test — NEW

- GIVEN the contract cases (all-pages short-circuit, middle window, pages 1 and N, ellipsis both sides, out-of-range, maxSlots cap)
- WHEN the suite runs
- THEN each case SHALL have at least one test asserting the exact output array
