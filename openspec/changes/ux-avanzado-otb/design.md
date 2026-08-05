# Design: UX Avanzado OTB — Split, Batch Ops, Pagos Parciales y Anulación

## Technical Approach

Additive schema evolution (ALTER TABLE only, no DDL drops), API endpoints mirroring the existing multas partial-payment pattern, and UI decomposition into tab-based sections. Three horizontal slices: (1) Schema + Core types, (2) API routes, (3) Store + UI — each independently testable.

## Architecture Decisions

### Decision: Schema-evolution strategy for `tipo` enum extension

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Drop+recreate table with new enum | Destructive migration, data loss in SQLite | ❌ |
| Keep `text({ enum })` with old values only | Cannot insert `'unico'`/`'anual'` without DDL | ❌ |
| **Switch to `text()` without enum constraint** | DB loses type enforcement; TS union handles it in code | ✅ |

SQLite and Drizzle ORM 0.36 do not support `ALTER COLUMN` for enums. Removing the Drizzle enum constraint from the column definition makes the migration additive (`ALTER TABLE` only). Runtime validation lives in the API layer via Zod 4 schemas and TypeScript's `Aporte.tipo` union.

### Decision: Report filter mode detection

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Separate endpoints per mode | Duplicated query logic, more routes | ❌ |
| **Single endpoint with dynamic WHERE** | Slightly more complex query builder; one route, composable filters | ✅ |

Use a filter-builder pattern: detect which params are present (`gestion`, `mes`, `fechaDesde/fechaHasta`), build the WHERE clause dynamically. `gestion` alone = `strftime('%Y', fecha) = gestion` (full year). `gestion+mes` = year AND month. `fechaDesde/fechaHasta` = range. No params = all-time. `gestion` takes precedence over `fecha*` if both supplied.

### Decision: Multa `gestion` derivation

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Add `gestion` column to multas | Requires migration + backfill | ❌ |
| **Derive from `fechaGen` via SQL** | Zero schema change; `strftime('%Y', fecha_gen)` is fast | ✅ |

### Decision: Aporte pagar refactor — mirror multas pattern

The existing `POST /api/aportes/:id/pagar` ignores `body.monto`, always sets `estado='pagado'`, and never tracks incremental `montoPagado`/`saldoPendiente`. Refactor to use the exact `db.transaction()` pattern from `POST /api/multas/:id/pagar` — respecting `body.monto`, incrementing `montoPagado`, decrementing `saldoPendiente`, and setting `estado='pagado'` only when `saldoPendiente <= 0`.

### Decision: Soft-delete for voiding — never hard DELETE

Replace `DELETE /api/multas/:id` with `POST /api/multas/:id/anular`. Both multas and aportes use the same pattern: set `estado='anulado'`, store `razonAnulacion`, mark the associated movimiento with `anulado=1`. Report queries add `WHERE anulado != 1` (or `IS NULL`).

## Data Flow

```
UI (Tab Crear) ──POST /api/multas/bulk──→ API (tx loop) ──→ DB (multas table)
UI (Tab Listar) ──GET /api/multas?filtros──→ API (dynamic WHERE) ──→ DB
UI (Modal Pago) ──POST /api/:id/pagar──→ API (db.transaction) ──→ DB (movimiento + update montoPagado/saldoPendiente)
UI (Modal Anular) ──POST /api/:id/anular──→ API (db.transaction) ──→ DB (estado='anulado' + movimiento.anulado=1)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/db/src/schema/aportes.ts` | Modify | Drop enum constraint on `tipo`, add `montoPagado`, `saldoPendiente`, `razonAnulacion` |
| `packages/db/src/schema/movimientos.ts` | Modify | Add `anulado` (integer), `razonAnulacion` (text) |
| `packages/core/src/index.ts` | Modify | Extend `Aporte`, `Movimiento`, `Multa` types; add `BulkMultaRequest`, `BulkAporteRequest`, `AnularRequest`; update report types |
| `packages/api/src/routes/multas.ts` | Modify | Add `POST /bulk`, `POST /:id/anular`; extend `GET /` filters (actividadId, fechaDesde/fechaHasta, gestion); deprecate DELETE |
| `packages/api/src/routes/aportes.ts` | Modify | Add `POST /bulk`, `POST /bulk/all`, `POST /:id/anular`, `GET /:id/pagos`; refactor `POST /:id/pagar` (partial payment); extend `GET /` filters (tipo, fechaDesde/fechaHasta) |
| `packages/api/src/routes/reportes.ts` | Modify | Dynamic filter modes in balance; gestion/mes/tipo filters in libro-diario; detailed arrays + filters in resumen-socio |
| `apps/web/src/stores/app.store.ts` | Modify | Add bulk create, anular con razón, pagarAporteConMonto, fetchPagosAporte; extend filter types |
| `apps/web/src/routes/multas.tsx` | Rewrite | Split into tabs Crear/Listar; multi-socio selector; anular modal con razón |
| `apps/web/src/routes/aportes.tsx` | Rewrite | Split into tabs Crear/Pagar; batch creation UI (único/mensual/anual); pago parcial modal; anular modal |
| `apps/web/src/routes/reportes.tsx` | Modify | Flexible filter-mode selector in balance; detallado resumen-socio with action links |

## Interfaces / Contracts

```typescript
// Core types (packages/core)
type Aporte = {
  // ...existing fields...
  tipo: 'mensual' | 'extraordinario' | 'unico' | 'anual';
  montoPagado: number;
  saldoPendiente: number;
  razonAnulacion: string | null;
};

type Movimiento = {
  // ...existing fields...
  anulado: number;   // 0 | 1 (SQLite boolean)
  razonAnulacion: string | null;
};

type Multa = {
  // ...existing fields...
  razonAnulacion: string | null;
};

// Request types
type BulkMultaRequest = {
  socioIds: string[];
  concepto: string;
  monto: number;
  actividadId?: string;
  fecha?: string;
};

type BulkAporteRequest = {
  socioIds: string[];
  tipo: 'mensual' | 'unico' | 'anual';
  montoBase: number;
  gestion: number;
  mes?: number;
  meses?: number;
};

type AnularRequest = {
  razon: string;
};
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Filter builders, bulk-input validation, gestion derivation | Pure function tests (Vitest) |
| Integration | POST /bulk endpoints (count correct), POST /:id/pagar (partial amounts), POST /:id/anular (soft-delete), report filters | API request/assert against test DB |
| E2E | Full tab creation flow, multi-socio selection, modal payment, anular con razón | Playwright or vitest with MSW |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary changes.

## Migration / Rollout

1. **Migration 0002**: ADD COLUMN to `aportes` (x3), `movimientos` (x2). Backfill `saldoPendiente = montoBase WHERE saldoPendiente IS NULL`.
2. **Schema update**: Drop `{ enum }` from `tipo` column definition (Drizzle re-export only — no DDL change needed since SQLite doesn't enforce CHECK constraints by default unless explicitly added).
3. **API deployment**: New endpoints work alongside old. Existing `DELETE /:id` on multas can be kept for backward compat or redirected.
4. **Frontend**: Deploy new tab UI; old modals become unused but can coexist until next deploy.
5. Rollback: `git revert` migrations, restore old route files, redeploy frontend.

## Open Questions

None.

## Skill Resolution

paths-injected — skills read by this agent: `sdd-design`.
