# ControlOTB — Project Knowledge & Requirements

## Project Overview

ControlOTB is a web application for Bolivian OTB (Organización Territorial de Base) membership attendance and contribution management. Originally a single-folder offline app (localStorage + Excel export). Evolved to a full-stack application with React frontend, Hono backend, Bun runtime, and PostgreSQL/Drizzle ORM. Deployable locally (Tauri desktop, single folder) or hosted (Docker Compose on a VPS). Each OTB gets its own install — NOT a multi-tenant SaaS.

Open source (MIT/Apache 2.0). All dependencies are OSS.

## Stack — Final Decision

| Layer | Technology | License | Why |
|-------|-----------|---------|-----|
| Frontend | React 19 + Vite | MIT | Lightweight, component-based, Expo for mobile |
| UI Kit | shadcn/ui + Tailwind CSS v4 | MIT | Modular (copy what you need), no heavy framework |
| State | Zustand | MIT | ~1KB, minimal boilerplate |
| Router | TanStack Router v2 | MIT | Type-safe, prefetching |
| Forms | React Hook Form + Zod | MIT | Declarative validation, less boilerplate |
| Backend | Hono + Bun | MIT | Hono is 3KB vs NestJS 300KB, Bun is one binary |
| ORM | Drizzle | MIT | ~3KB, SQL-native, auto TypeScript types |
| DB Dev | SQLite + better-sqlite3 | MIT | File-based, zero config, one .db per OTB |
| DB Prod | PostgreSQL | PostgreSQL License | Best OSS relational DB for contabilidad |
| PDF | @react-pdf/renderer | MIT | React components → PDF, reuses frontend code |
| Excel | SheetJS (xlsx) | Apache 2.0 | Import/export, industry standard |
| Auth | jose + bcrypt | MIT | JWT standard, 8KB total |
| Logging | Pino | MIT | Fastest Node.js logger, JSON structured |
| Monorepo | Nx | MIT | Dependency graph, scoped builds |
| Desktop | Tauri | MIT | Rust + web view, ~10MB binary per OTB |
| Mobile | Expo + React Native | MIT | Native mobile, shared React code |
| Testing | Vitest + Playwright | MIT | Fast unit tests, real browser E2E |
| CI/CD | GitHub Actions | MIT | Free for public repos |
| Deploy | Docker Compose | — | Single command, one VPS |

**Why not Angular + NestJS**: Angular is 3x heavier for simple OTB needs. NestJS is 300KB+ runtime overhead for an MVP. Hono is the minimal backend — if the team grows later, Hono routes migrate to NestJS controllers with zero contract changes (REST is REST).

**Why not Vue**: React + Expo gives real native mobile. Vue's mobile path (Capacitor) is a web wrapper, not native.

**Why Bun over Node.js**: Bun is a single binary (~10MB), 3x faster startup, native TypeScript, built-in bundler, and compatible with Node.js APIs. For a local OTB install, this reduces download size from ~80MB (Node + npm) to ~15MB (Bun standalone).

## Architecture

### Initial (current implementation)
- **Frontend**: Vanilla HTML/CSS/JS with IIFE modules (no framework)
- **Data layer**: `OTB.db` in `js/db.js` — localStorage-backed, with `movimientos[]` and `egresos[]` collections
- **UI**: Single `index.html` with multiple `<div class="view">` sections, nav-tab switching
- **Excel**: SheetJS from CDN for import/export

### Target (evolved architecture)
```
otb-suite/
├── apps/
│   ├── desktop/           ← Tauri + React (binary ~10MB per OTB)
│   ├── mobile/            ← Expo + React Native
│   ├── web/               ← React 19 + Vite (PWA)
│   └── server/            ← Hono + Bun (API REST)
│
├── packages/
│   ├── core/              ← TypeScript: fórmulas, validation, tipos
│   ├── db/                ← Drizzle ORM + esquemas
│   ├── api/               ← Hono routes (sincroniza apps)
│   ├── ui/                ← shadcn/ui components
│   ├── pdf/               ← @react-pdf/renderer templates (facturas, reportes)
│   ├── excel/             ← SheetJS (export) + parsers (import)
│   ├── auth/              ← jose (JWT) + role middleware
│   ├── logger/            ← Pino (structured logging)
│   └── modules/           ← Configurable modules (see Phases below)
│       ├── core/
│       │   ├── socios/
│       │   ├── asistencia/
│       │   ├── aportes/
│       │   └── multas/
│       ├── financial/
│       │   ├── facturas/
│       │   ├── contabilidad/
│       │   └── egresos/
│       ├── hr/
│       │   ├── empleados/
│       │   └── nominas/
│       └── inventory/
│           ├── productos/
│           └── movimientos-inventario/
│
├── docker/
│   ├── docker-compose.yml
│   └── postgres/init.sql
├── nx.json
├── package.json
└── pnpm-workspace.yaml
```

### Module Config System (CMS-like)
Each OTB has a `modules_config` that enables/disables modules and defines custom fields. Modules are declarative JSON files (`module.json`) that describe models, forms, tables, and reports. Custom fields use an EAV (Entity-Attribute-Value) pattern in the DB for flexible schema extension without migrations. See `MODULE_SYSTEM.md` for the full design.

Key tables for module system:
- `custom_field_definitions` — metadata about custom fields per model per tenant
- `custom_field_values` — EAV storage for custom field values per entity

## Phased Implementation Roadmap

### Phase 1 — Match & Exceed Current Excel (MVP)
**Goal**: Everything the Excel version does, but better, more reliable, and with a real database.

| Priority | Feature | Notes |
|----------|---------|-------|
| P0 | Socios CRUD (members) | Create, edit, delete, search, filter |
| P0 | Asistencia (attendance) | Mark attendance per activity, radio buttons |
| P0 | Aportes (contributions) | Cuota generation (monthly/individual/annual), payment tracking |
| P0 | Multas (fines) | Create, pay, history, filter bar, status auto |
| P0 | Egresos (expenses) | CRUD, categories, monthly totals |
| P0 | Dashboard KPIs | Recaudado, morosos, multas pendientes, Egresos del Mes, Neto |
| P0 | Payments modal (pagoPopup) | Unified payment modal with balance, history, overpayment warning |
| P0 | Excel export/import | `buildWorkbook()` / `parseWorkbook()` — 7+ sheets |
| P0 | Config & initialization | OTB name, gestion, base amounts, activity types |
| P0 | Nav gating | Blocks views until config initialized |
| P1 | Reports with presets | Morosos, Cumpleaños, Asistencia Baja, Pagos History |
| P1 | Movement history | `movimientos[]` audit log for all payments |
| P2 | Data validation | Better error handling, input sanitization |
| P2 | Search across all views | Global search bar |

**DB**: SQLite one file per OTB. Zero config. Copy folder to USB for backup.

### Phase 2 — Desktop + Mobile Deployment
**Goal**: Installable on any device without a browser or server.

| Feature | Implementation |
|---------|---------------|
| Desktop binary | Tauri wrapper around React + Bun API, single .exe/.dmg/.AppImage |
| Mobile app | Expo + React Native, shares ~70% of frontend code |
| Offline-first | SQLite local, syncs to server when connected |
| Auto-backup | SQLite file copy to external drive/cloud folder |

### Phase 3 — Configurable Modules (CMS Layer)
**Goal**: Each OTB can enable/disable modules and add custom fields. Modules are declarative JSON.

| Feature | Details |
|---------|---------|
| Module loader | Reads `module.json` from each module directory |
| Module toggle | UI in config view to enable/disable per OTB |
| Custom fields | `custom_field_definitions` + `custom_field_values` tables (EAV) |
| Dynamic forms | `DynamicForm` renders fields from module config |
| Dynamic tables | `DynamicTable` adds custom columns to list views |
| Dynamic reports | Filters and groupings from custom field metadata |
| Module examples | financial/facturas, hr/empleados, inventory/productos |

### Phase 4 — Financial & Invoicing
**Goal**: Full accounting and invoicing capabilities.

| Feature | Details |
|---------|---------|
| Facturas (invoices) | Issue, PDF generation, sequential numbering |
| Contabilidad (ledger) | Libro diario, mayor, balance general |
| Presupuestos (budgets) | Create budgets vs actuals |
| PDF reports | @react-pdf/renderer for all report types |
| Email reports | Nodemailer for sending PDF reports |

### Phase 5 — Multi-OTB Hosted (Optional)
**Goal**: If the OTB federation wants a central platform.

| Feature | Details |
|---------|---------|
| PostgreSQL backend | Replace SQLite with PostgreSQL per tenant |
| Tenant isolation | `tenant_id` on every table |
| Auth + roles | jose JWT, role-based access control |
| Admin panel | Manage multiple OTBs from one dashboard |
| API server | Hono server for all apps (desktop/mobile/web) to share |
| SaaS billing | Optional: subscription per OTB for hosted version |

## Key Files — Current Implementation (Phase 1)

| File | Purpose |
|------|---------|
| `index.html` | Main HTML with all views (dashboard, socios, asistencia, aportes, multas, egresos, config, reportes) |
| `js/db.js` | Data layer: collections, `getPagado()`, `migrarMovimientos()`, `reindexIds()`, cascade delete |
| `js/app.js` | App init, nav tab binding, view switching, `createNew()`, `initDefaultData()` |
| `js/socios.js` | Socios (members) CRUD with modal form |
| `js/asistencia.js` | Asistencia (attendance) view |
| `js/actividades.js` | Actividades (activities) CRUD |
| `js/config.js` | System configuration: form binding, validation, `isInitialized()`, `tiposActividad` CRUD |
| `js/pagos.js` | Aportes (payments) view: `payAporte()` uses `OTB.pagoPopup`, `getPagado()` everywhere |
| `js/multas.js` | Multas (fines) view: filter bar, `getPagado()` for computed columns |
| `js/egresos.js` | Egresos (expenses) CRUD with filters and monthly totals |
| `js/dashboard.js` | Dashboard with KPIs: recaudado, multas pendientes, morosos, cumpleaños, Egresos del Mes, Neto |
| `js/reportes.js` | Reports: presets (Morosos, Cumpleaños, Asistencia Baja, Pagos), Excel export with egresos/neto |
| `js/excel.js` | Excel import/export: `buildWorkbook()`, `parseWorkbook()`, `buildResumenSheet()`, 7 sheets |
| `js/pago-popup.js` | `OTB.pagoPopup.open(tipo, item, onSuccess)` — unified payment modal with multi-step, movement history, overpayment warning |
| `styles.css` | All styling |

## Data Model (db.data — current localStorage version)

```
db.data = {
  config: { NombreOTB, GestionActual, AporteMensualBase, DiasGraciaAporte, ToleranciaMinutos },
  socios: [{ id, nombre, apellidoPaterno, apellidoMaterno, ci, telefono, email, ocupacion, direccion, fechaNac, fechaIng, fechaAlta, aporteBase, estado }],
  tiposActividad: [{ nombre, opciones: [], multas: [], tolerancia }],
  actividades: [{ id, tipo, fecha, hora, descripcion }],
  asistencia: [{ id, actividadId, socioId, tipoAsistencia, minutosTardanza, fechaReg }],
  aportes: [{ id, socioId, mes, gestion, tipo: 'mensual'|'individual'|'anual', montoBase, numeroRecibo, fechaPago, estado }],
  multas: [{ id, socioId, actividadId, concepto, monto, fechaGen, fechaPago, estado }],
  movimientos: [{ id, tipo: 'aporte'|'multa', referenciaId, socioId, monto, numeroRecibo, nota, fecha }],
  egresos: [{ id, categoria, beneficiario, monto, descripcion, fecha, numRecibo }],
  _nextId: { socios, actividades, asistencia, aportes, multas, movimientos, egresos },
  _modified: false
}
```

## DB Schema Design (future — Drizzle + PostgreSQL)

All tables will include `tenant_id` for multi-OTB support (one server, multiple OTBs).

```sql
-- Core entities
CREATE TABLE tenants (id SERIAL PRIMARY KEY, name TEXT, created_at TIMESTAMP);
CREATE TABLE socios (id SERIAL, tenant_id INT, ...);
CREATE TABLE actividades (id SERIAL, tenant_id INT, ...);
CREATE TABLE asistencia (id SERIAL, tenant_id INT, ...);
CREATE TABLE aportes (id SERIAL, tenant_id INT, ...);
CREATE TABLE multas (id SERIAL, tenant_id INT, ...);
CREATE TABLE movimientos (id SERIAL, tenant_id INT, ...);
CREATE TABLE egresos (id SERIAL, tenant_id INT, ...);
CREATE TABLE tipos_actividad (id SERIAL, tenant_id INT, ...);

-- Module system
CREATE TABLE modules_config (id SERIAL, tenant_id INT, module_name TEXT, enabled BOOLEAN, config JSONB);
CREATE TABLE custom_field_definitions (id SERIAL, tenant_id INT, model TEXT, field_name TEXT, field_label TEXT, field_type TEXT, field_config JSONB, required BOOLEAN, ...);
CREATE TABLE custom_field_values (id SERIAL, tenant_id INT, entity_type TEXT, entity_id INT, field_name TEXT, field_value TEXT, field_value_numeric REAL, field_value_boolean BOOLEAN);

-- Financial (Phase 4)
CREATE TABLE facturas (id SERIAL, tenant_id INT, ...);
CREATE TABLE factura_items (id SERIAL, tenant_id INT, factura_id INT, ...);
CREATE TABLE presupuestos (id SERIAL, tenant_id INT, ...);
```

## Open Issues / Known Bugs (current)

- XLSX library requires `https://` (CDN). Does NOT work with `file://` protocol — must use `http://localhost:8080`
- `_resetFormState()` is a no-op (inline forms removed, no state to reset)
- `aporteTipo` defaults to `'mensual'` — no validation that a matching tipo exists in tiposActividad yet
- The `Pagos` History sheet in Excel doesn't compute balances per movimiento (just lists them flat)

## Running the App (current)

```bash
python3 -m http.server 8080 --directory /Users/csardev/Repositories/controlAsistenciaOTB
# Then open http://localhost:8080
```

## JS Syntax Validation

Always run after changes:
```bash
node --check js/FILE.js
```

## Development Patterns (current — vanilla JS IIFE)

- All JS modules are IIFEs with `'use strict'`
- `if (typeof OTB === 'undefined') window.OTB = {};` guard
- `var db = OTB.db;` for data access
- `OTB.utils.escapeHtml()` for XSS prevention
- `OTB.utils.debounce(fn, 300)` for filter input
- `OTB.app.openModal(html)` / `OTB.app.closeModal()` for modals
- `OTB.ui.saveFilterState(viewName, state)` / `loadFilterState(viewName)` for filter persistence
- `db.markModified()` to set dirty flag
- Tables: `<tbody id="xxxTable">` populated by JS, thead in HTML
- Empty state: `'<tr><td colspan="N" ...>No hay ...</td></tr>'`

## Development Patterns (future — React + Hono)

- TypeScript strict mode throughout
- Component files colocated: `packages/ui/src/components/SocioForm.tsx`
- API routes: `apps/server/src/routes/socios.ts`
- Schema definitions: `packages/db/src/schema.ts`
- Each package has its own `tsconfig.json`, `package.json`, and `vitest.config.ts`
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`
- PR-based workflow with required reviews

## Key Files

| File | Purpose |
|------|---------|
| `index.html` | Main HTML with all views (dashboard, socios, asistencia, aportes, multas, egresos, config, reportes) |
| `js/db.js` | Data layer: collections, `getPagado()`, `migrarMovimientos()`, `reindexIds()`, cascade delete |
| `js/app.js` | App init, nav tab binding, view switching, `createNew()`, `initDefaultData()` |
| `js/socios.js` | Socios (members) CRUD with modal form |
| `js/asistencia.js` | Asistencia (attendance) view |
| `js/actividades.js` | Actividades (activities) CRUD |
| `js/config.js` | System configuration: form binding, validation, `isInitialized()`, `tiposActividad` CRUD |
| `js/pagos.js` | Aportes (payments) view: `payAporte()` uses `OTB.pagoPopup`, `getPagado()` everywhere |
| `js/multas.js` | Multas (fines) view: filter bar, `getPagado()` for computed columns |
| `js/egresos.js` | Egresos (expenses) CRUD with filters and monthly totals |
| `js/dashboard.js` | Dashboard with KPIs: recaudado, multas pendientes, morosos, cumpleaños, Egresos del Mes, Neto |
| `js/reportes.js` | Reports: presets (Morosos, Cumpleaños, Asistencia Baja, Pagos), Excel export with egresos/neto |
| `js/excel.js` | Excel import/export: `buildWorkbook()`, `parseWorkbook()`, `buildResumenSheet()`, 7 sheets |
| `js/pago-popup.js` | `OTB.pagoPopup.open(tipo, item, onSuccess)` — unified payment modal with multi-step, movement history, overpayment warning |
| `styles.css` | All styling |

## Data Model (db.data)

```
db.data = {
  config: { NombreOTB, GestionActual, AporteMensualBase, DiasGraciaAporte, ToleranciaMinutos },
  socios: [{ id, nombre, apellidoPaterno, apellidoMaterno, ci, telefono, email, ocupacion, direccion, fechaNac, fechaIng, fechaAlta, aporteBase, estado }],
  tiposActividad: [{ nombre, opciones: [], multas: [], tolerancia }],
  actividades: [{ id, tipo, fecha, hora, descripcion }],
  asistencia: [{ id, actividadId, socioId, tipoAsistencia, minutosTardanza, fechaReg }],
  aportes: [{ id, socioId, mes, gestion, tipo: 'mensual'|'individual'|'anual', montoBase, numeroRecibo, fechaPago, estado }],
  multas: [{ id, socioId, actividadId, concepto, monto, fechaGen, fechaPago, estado }],
  movimientos: [{ id, tipo: 'aporte'|'multa', referenciaId, socioId, monto, numeroRecibo, nota, fecha }],
  egresos: [{ id, categoria, beneficiario, monto, descripcion, fecha, numRecibo }],
  _nextId: { socios, actividades, asistencia, aportes, multas, movimientos, egresos },
  _modified: false
}
```

## Completed PRs (finanzas-movimientos-egresos change)

### PR #1 — Data Layer Foundation ✅
- Added `movimientos[]` and `egresos[]` to db data model
- `db.getPagado(tipo, referenciaId)` — sums all matching movimientos
- `db.migrarMovimientos()` — backfills movimientos from legacy paid records
- `db.reindexIds()` — includes new collections
- `db.remove()` cascade deletes movimientos for removed socios
- Migration wiring: runs after `loadFromLocal()` and `parseWorkbook()`

### PR #2 — Egresos CRUD Module ✅
- Full CRUD for expenses: create, edit, delete
- Filter bar (category, search, date range)
- Nav button "💸 Egresos"
- Monthly totals
- Validation (non-empty categoria/beneficiario/fecha, monto > 0)

### PR #3 — Unified Payment Modal ✅
- `OTB.pagoPopup.open(tipo, item, onSuccess)` — multi-step modal
- Shows item info, remaining balance, payment form
- Movement history section (existing payments for the item)
- Overpayment warning
- Creates `movimiento` records on completion
- `onSuccess` callback for UI refresh

### PR #4 — Pagos + Multas Refactor ✅
- T13: Replaced inline aporte edit with `payAporte()` → pagoPopup
- T14: Removed `renderInlineAddForm()`, `saveNewAporte()`, `#pagoInlineForm`
- T15: All display uses `db.getPagado()` instead of legacy `montoPagado`
- T16: Multas pay button uses `OTB.pagoPopup.open()`
- T17: Movement history per socio in pagos view (fixed placeholder bug)
- T18: Multas filter bar (socio, estado, fecha range, monto range)
- T19: Multas computed columns: Pagado (getPagado), Saldo Pendiente, Estado from saldo
- T20: payMulta uses pagoPopup

### PR #5 — Excel + Reports + Dashboard Integration ✅
- T22: Excel `buildWorkbook()` has Movimientos and Egresos sheets
- T23: `parseWorkbook()` backward compat for missing sheets
- T24: Resumen sheet: Egresos del Mes + Neto KPIs
- T25: Reports use `db.getPagado()` for payment totals
- T26-T27: Report export includes Egresos/Neto rows
- T28: Dashboard: "Egresos del Mes" KPI
- T29: Dashboard: "Neto" KPI (green if positive, red if negative)

### Additional Improvements ✅
- **B1**: Config form now works — `loadConfig()`, `saveConfig()`, `render()`
- **B2**: New file creation shows config view first (not dashboard)
- **C1**: Payment validation improved — saldo check, min > 0, overpayment confirm
- **A1**: Feature gating — nav tabs blocked until config is initialized
- **N1**: "💰 Pagos" preset in reports — dedicated payments history with filters
- **N2**: "Pagos" sheet in Excel export — accounting-style income/expense detail
- **N3**: Config typesActividad CRUD rendered in UI
- **Aportes tipo field**: monthly/individual/annual cuota type tracking
- **Socios**: email and ocupacion fields added
- **Excel Aportes sheet**: includes `tipo` column, removed legacy `montoPagado`

## Open Issues / Known Bugs

- XLSX library requires `https://` (CDN). Does NOT work with `file://` protocol — must use `http://localhost:8080`
- `_resetFormState()` is a no-op (inline forms removed, no state to reset)
- `aporteTipo` defaults to `'mensual'` — no validation that a matching tipo exists in tiposActividad yet
- The `Pagos` History sheet in Excel doesn't compute balances per movimiento (just lists them flat)

## UI Views (index.html)

- `#view-dashboard` — KPIs + monthly chart
- `#view-socios` — Member list + search + CRUD modal
- `#view-actividades` — Activities list + CRUD modal
- `#view-asistencia` — Attendance tracking (radio buttons)
- `#view-aportes` — Payments view with socio selector, payment table, fines section
- `#view-multas` — Fines view with filter bar
- `#view-egresos` — Expenses CRUD view
- `#view-config` — Configuration form + activity types CRUD
- `#view-reportes` — Reports with presets + filter bar + preview + Excel export

## Config Required Fields (isInitialized check)

`NombreOTB`, `GestionActual`, `AporteMensualBase` — all must be truthy for `isInitialized()` to return `true`.

## Running the App

```bash
python3 -m http.server 8080 --directory /Users/csardev/Repositories/controlAsistenciaOTB
# Then open http://localhost:8080
```

## JS Syntax Validation

Always run after changes:
```bash
node --check js/FILE.js
```

## Development Patterns

- All JS modules are IIFEs with `'use strict'`
- `if (typeof OTB === 'undefined') window.OTB = {};` guard
- `var db = OTB.db;` for data access
- `OTB.utils.escapeHtml()` for XSS prevention
- `OTB.utils.debounce(fn, 300)` for filter input
- `OTB.app.openModal(html)` / `OTB.app.closeModal()` for modals
- `OTB.ui.saveFilterState(viewName, state)` / `loadFilterState(viewName)` for filter persistence
- `db.markModified()` to set dirty flag
- Tables: `<tbody id="xxxTable">` populated by JS, thead in HTML
- Empty state: `'<tr><td colspan="N" ...>No hay ...</td></tr>'`
