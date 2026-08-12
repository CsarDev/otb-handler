# Delta for Pagination

> **Delta** from `openspec/specs/pagination/spec.md` (paginacion-avanzada): the `Pagination` component upgrade is ADDITIVE — new optional props `onPageSizeChange?`, `pageSizeOptions?`, `maxSlots?` keep the two existing call sites (multas.tsx, aportes.tsx) compiling and rendering unchanged. The component gains standard navigation (Primera/Anterior/números/Siguiente/Última with an ellipsis window computed by the NEW `paginasVisibles` helper in the `paginacion-window` capability, `aria-current="page"` on the current page), a native `<select>` page-size selector rendered LEFT of the controls only when `onPageSizeChange` is provided (options [10, 25, 50, 100], default 25, no option above the server cap of 100), and a responsive rule at the app-wide `sm:` (640px) breakpoint (numbers + first/last `hidden sm:flex`). Store page-size setters clamp to the options, reset page to 1 and refetch. The envelope, filters, store page/total state and page-reset-on-filter requirements are UNCHANGED.

> **Scenario status tags**: scenarios tagged `(IMPLEMENTED — regression)` verify pre-existing behavior that MUST be preserved; untagged scenarios are NEW and are the verify targets of this change.

## ADDED Requirements

### Requirement: Configurable Page Size

The `Pagination` component MUST render a native `<select>` page-size selector with `aria-label="Filas por página"`, positioned LEFT of the navigation controls, and SHALL render it ONLY when `onPageSizeChange` is provided (absent → no selector, backward compatible). The selector SHALL offer the options `[10, 25, 50, 100]` (default 25, overridable via `pageSizeOptions?`) and SHALL NOT offer any option above 100 (the server cap of 100 stays in sync — no extra client clamp). Changing the page size MUST reset the page to 1 and refetch the list with the new `pageSize`, keeping all active filters.

#### Scenario: Selector renders only when onPageSizeChange is provided — NEW

- GIVEN the component renders with onPageSizeChange
- THEN a native select with aria-label "Filas por página" SHALL render left of the controls
- GIVEN the component renders without onPageSizeChange
- THEN NO page-size selector SHALL render (behavior unchanged)

#### Scenario: Changing the size resets to page 1 and refetches with the new pageSize — NEW

- GIVEN the multas list is on page 3 with pageSize 25
- WHEN the user selects 50 in the page-size selector
- THEN the store SHALL reset page to 1 and refetch with pageSize=50

#### Scenario: Options are [10, 25, 50, 100] with no option above the server cap — NEW

- GIVEN the page-size selector renders
- THEN the options SHALL be exactly 10, 25, 50 and 100
- AND the selected default SHALL be 25
- AND NO option SHALL exceed 100

#### Scenario: Page-size change with active filters keeps the filters and refetches — NEW

- GIVEN filters are active (e.g. estadoId + fechaDesde) on the libro diario list
- WHEN the user changes the page size
- THEN the refetch SHALL keep the active filters
- AND total SHALL reflect the same filtered set with the new pageSize

### Requirement: Responsive Pagination

Below the `sm:` (640px) breakpoint the component MUST hide the page-number buttons and the first/last controls (`hidden sm:flex`), keeping visible: previous, "Página X de Y", next, and the page-size selector (when provided). At `sm:` and above the full navigation SHALL render. The `sm:` breakpoint MUST be used (NOT `md:`), matching the app's existing table↔cards breakpoint.

#### Scenario: Below sm: only prev/info/next and the size select render — NEW

- GIVEN a viewport narrower than 640px
- WHEN the component renders with onPageSizeChange
- THEN the page numbers and Primera/Última SHALL be hidden
- AND Anterior, "Página X de Y", Siguiente and the size selector SHALL be visible

#### Scenario: At sm: and above the full navigation renders — NEW

- GIVEN a viewport of 640px or wider
- WHEN the component renders
- THEN Primera, Anterior, page numbers, Siguiente and Última SHALL be visible

## MODIFIED Requirements

### Requirement: Pagination Component — @otb/ui

`@otb/ui` MUST export a `Pagination` component with props `{ page, total, pageSize, onPageChange }` plus OPTIONAL `onPageSizeChange?`, `pageSizeOptions?` and `maxSlots?` (default 7); call sites that omit the new props SHALL behave exactly as before. It SHALL render standard navigation [Primera][Anterior][page numbers][Siguiente][Última] plus page information ("Página X de Y", derived from total/pageSize). The page-number window SHALL be computed with the `paginasVisibles` algorithm (maxSlots default 7) and SHALL insert an ellipsis (…) wherever the gap between consecutive page numbers is > 1. The current page button SHALL be highlighted and carry `aria-current="page"`. The previous control SHALL be disabled on page 1; the next control SHALL be disabled on the last page; first/last SHALL disable at their respective boundary pages. When `total` is 0, the component SHALL render NO pagination controls. An out-of-range `page` (server returned empty items) SHALL still render the controls so the user can navigate back. All controls SHALL be keyboard-accessible.
(Previously: prev/next-only with "Página X de Y" — no page numbers, no first/last, no ellipsis, no aria-current, no page-size selector, no maxSlots.)

#### Scenario: Component renders and drives page changes — (IMPLEMENTED — regression)

- GIVEN a list with total=60, page=1, pageSize=25
- WHEN the Pagination component renders with onPageChange
- THEN the next control SHALL be enabled
- AND activating it SHALL invoke onPageChange(2)

#### Scenario: Boundary pages disable the appropriate control — (IMPLEMENTED — regression)

- GIVEN page=1
- WHEN the component renders
- THEN the previous control SHALL be disabled
- GIVEN page=3 with total=60 and pageSize=25 (last page)
- WHEN the component renders
- THEN the next control SHALL be disabled

#### Scenario: Empty list renders no pagination controls — (IMPLEMENTED — regression)

- GIVEN total=0
- WHEN the component renders
- THEN NO pagination controls SHALL render

#### Scenario: Full navigation renders on a multi-page list — NEW

- GIVEN a list with total=60, page=2, pageSize=25 (totalPages=3)
- WHEN the component renders
- THEN Primera, Anterior, page numbers, Siguiente and Última SHALL render
- AND activating Primera SHALL invoke onPageChange(1)
- AND activating Última SHALL invoke onPageChange(3)

#### Scenario: First and last controls disable at boundary pages — NEW

- GIVEN page=1
- WHEN the component renders
- THEN the Primera and Anterior controls SHALL be disabled
- GIVEN page=3 with total=60 and pageSize=25 (last page)
- WHEN the component renders
- THEN the Última and Siguiente controls SHALL be disabled

#### Scenario: Ellipsis appears when totalPages > 7 and gap > 1 — NEW

- GIVEN total=500, pageSize=25 (totalPages=20) and page=5
- WHEN the component renders
- THEN the page-number buttons SHALL show 1 … 4 5 6 … 20 (ellipsis wherever the gap between consecutive numbers is > 1)

#### Scenario: All pages are shown when totalPages ≤ 7 — NEW

- GIVEN total=125, pageSize=25 (totalPages=5) and page=3
- WHEN the component renders
- THEN page-number buttons 1 through 5 SHALL render with NO ellipsis

#### Scenario: Current page button carries aria-current="page" — NEW

- GIVEN total=500, pageSize=25 and page=5
- WHEN the component renders
- THEN the button for page 5 SHALL be highlighted and carry aria-current="page"

#### Scenario: Out-of-range page keeps rendering controls — NEW

- GIVEN total=50, pageSize=25 (totalPages=2) and page=9 (server responded items: [])
- WHEN the component renders
- THEN Primera/Anterior/page numbers/Siguiente/Última SHALL still render so the user can navigate back
