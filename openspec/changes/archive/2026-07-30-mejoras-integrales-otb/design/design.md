# Design: Mejoras Integrales OTB Handler

## Technical Approach

Eight coordinated change areas executed as a single wave: (1) DB schema additions, (2) new reports API module, (3) join fixes on GET endpoints, (4) atomic transactions for payments/expenses, (5) partial-payment logic for fines, (6) activity-types CRUD completion, (7) dashboard query corrections, (8) frontend form/table fixes. Each area follows existing **route-direct** Hono pattern — no service layer — with `db.transaction()` for multi-table writes.

## Architecture Decisions

### Decision: Route-direct vs. service layer

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Keep route-direct | Consistent with existing codebase; less abstraction overhead for SQLite-sized app | ✅ **Keep** |
| Extract service layer | Adds indirection without current benefit; would be premature for this codebase size | Rejected |

### Decision: Transaction pattern for SQLite

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `db.transaction((tx) => { ... })` | Drizzle native; Better-SQLite3 synchronous API works naturally with callback | ✅ **Use tx** |
| Manual begin/commit | Error-prone; no automatic rollback on exception | Rejected |

All multi-table writes (pagos, egresos PUT/DELETE) use `tx.insert()`, `tx.update()`, `tx.delete()` inside a `db.transaction()` callback.

### Decision: `motivo` column on movimientos

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Add `motivo` column | Duplicates `nota` semantics; no spec scenario exercises it | ✅ **Skip** |
| Skip | One less migration; `nota` field already serves as description | Kept |

### Decision: `montoPagado` as denormalized field

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Add `montoPagado` column | Avoids SUM over movimientos per read; updated atomically in transaction | ✅ **Add** |
| Derive from movimientos | Every GET /multas would need subquery; slower and more complex | Rejected |

### Decision: Reports route name

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `/api/reportes/...` | Consistent with existing Spanish route naming (socios, multas, egresos) | ✅ **Use** |
| `/api/reports/...` | Mixes English route in Spanish-named API | Rejected |

### Decision: Frontend tab data caching

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Local component state | Reports data is ephemeral; avoids stale cache in Zustand | ✅ **Use** |
| Zustand store | Adds boilerplate for transient report data | Rejected |

### Decision: DELETE tipos-actividad FK handling

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Return 409 on FK error | `SQLITE_CONSTRAINT_FOREIGNKEY` caught via try/catch | ✅ **Use** |
| Cascade delete | Too destructive; would silently remove historical data | Rejected |

## Data Flow

```
Browser (React SPA)
  │
  ├─ GET /api/dashboard ─────────┐
  │   └─ 6 aggregated queries     │
  │      (same month window)      │
  │                              ▼
  ├─ GET /api/multas ──────── Drizzle LEFT JOIN socios
  ├─ GET /api/aportes ─────── Drizzle LEFT JOIN socios
  ├─ GET /api/actividades ──── Drizzle LEFT JOIN tipos_actividad
  │
  ├─ POST /api/multas/:id/pagar
  │   └─ db.transaction(tx) ──→ tx.insert(movimiento)
  │                         └─→ tx.update(multa: saldo/monto/estado)
  │
  ├─ POST /api/aportes/:id/pagar
  │   └─ db.transaction(tx) ──→ tx.insert(movimiento)
  │                         └─→ tx.update(aporte: estado/fecha/recibo)
  │
  ├─ GET /api/reportes/balance
  ├─ GET /api/reportes/libro-diario
  ├─ GET /api/reportes/resumen-socio/:id
  │   └─ All: aggregated SELECT with SUM/COUNT/GROUP BY
  │
  └─ PUT|DELETE /api/egresos/:id
      └─ db.transaction(tx) ──→ tx.update|delete(egreso)
                            └─→ tx.update|delete(movimiento WHERE referenciaId)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/db/src/schema/multas.ts` | Modify | Add `saldoPendiente` + `montoPagado` columns |
| `packages/db/drizzle/*` | Create | Migration SQL for new columns |
| `packages/core/src/index.ts` | Modify | Add fields to Multa/Actividad/Aporte types; add BalanceReport, LibroDiarioEntry, ResumenSocioReport types |
| `packages/api/src/routes/reportes.ts` | **Create** | Three GET aggregated endpoints |
| `packages/api/src/index.ts` | Modify | Register `/api/reportes` route |
| `packages/api/src/routes/multas.ts` | Modify | LEFT JOIN, partial payment with transaction, GET /:id/pagos |
| `packages/api/src/routes/aportes.ts` | Modify | LEFT JOIN, POST /:id/pagar with transaction |
| `packages/api/src/routes/actividades.ts` | Modify | LEFT JOIN with tipos_actividad |
| `packages/api/src/routes/egresos.ts` | Modify | PUT/DELETE sync movimientos in transaction |
| `packages/api/src/routes/tipos-actividad.ts` | Modify | Add PUT /:id, DELETE /:id with FK check |
| `packages/api/src/routes/dashboard.ts` | Modify | Fix recaudado filter, multasPendientes SUM, remove cumpleañosMes |
| `apps/web/src/stores/app.store.ts` | Modify | Add reportes actions, fix addTipo/removeTipo, remove cumpleañosMes from DashboardData |
| `apps/web/src/routes/reportes.tsx` | **Rewrite** | Tabbed UI with Balance/LibroDiario/ResumenSocio |
| `apps/web/src/routes/multas.tsx` | Modify | Show socio name, saldoPendiente, partial payment modal |
| `apps/web/src/routes/aportes.tsx` | Modify | Show socio name, fix tipo select options |
| `apps/web/src/routes/actividades.tsx` | Modify | Show tipoNombre, fix select value=UUID |
| `apps/web/src/routes/config.tsx` | Modify | Add edit modal, fix addTipo (no randomUUID), fix removeTipo (by ID) |
| `apps/web/src/routes/index.tsx` | Modify | Remove cumpleañosMes from DashboardData type |

## Interfaces / Contracts

### New API Contracts

```ts
// GET /api/reportes/balance?gestion=2025&mes=6
type BalanceResponse = {
  totalIngresos: number;   // SUM movimientos WHERE tipo='ingreso' AND mes/gestion
  totalEgresos: number;    // SUM movimientos WHERE tipo='egreso' AND mes/gestion
  neto: number;            // totalIngresos - totalEgresos
  desglose: Array<{ categoria: string; monto: number }>;
};

// GET /api/reportes/libro-diario?fechaDesde=2025-01-01&fechaHasta=2025-01-31
type LibroDiarioResponse = Array<Movimiento & {
  socioNombre: string | null;
  socioApellido: string | null;
}>;

// GET /api/reportes/resumen-socio/:id
type ResumenSocioResponse = {
  totalAportado: number;
  multasPagadas: number;
  saldoPendiente: number;
  socio: { id: string; nombre: string; apellidoPaterno: string };
};

// POST /api/multas/:id/pagar { monto?: number, numeroRecibo?: string, fechaPago?: string }
type PayFineRequest = {
  monto?: number;        // default = saldoPendiente
  numeroRecibo?: string;
  fechaPago?: string;    // default = today
};
type PayFineResponse = Multa; // updated with new saldoPendiente/montoPagado/estado

// GET /api/multas/:id/pagos
type PaymentHistoryResponse = Array<Movimiento>; // WHERE referenciaId = :id AND tipo = 'ingreso'

// PUT /api/tipos-actividad/:id { nombre?, opciones?, multas?, tolerancia? }
type UpdateTipoActividadRequest = {
  nombre?: string;
  opciones?: string[];
  multas?: Record<string, number>;
  tolerancia?: number;
};
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit (core) | New type shapes compile | `pnpm typecheck` must pass across monorepo |
| Unit (api) | Transaction rollback behavior | Isolated `db.transaction()` testing with mock |
| Integration | Report queries return correct aggregations | Run against test SQLite DB with seed data |
| Integration | Partial payment scenarios | Full flow via actual API calls to test DB |
| E2E | Skip (out of scope per proposal) | — |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

1. **Schema migration first**: `pnpm db:generate && pnpm db:migrate` — adds `saldoPendiente` and `montoPagado` to multas table. Backfill existing rows: `UPDATE multas SET saldo_pendiente = monto WHERE saldo_pendiente = 0 AND estado = 'pendiente';`
2. **API changes**: All API changes are backward-compatible (additive fields in responses, new endpoints).
3. **Frontend changes**: Deploy with API — old API won't have new fields but frontend handles `undefined` gracefully.
4. **Rollback**: Revert schema migration (`ALTER TABLE multas DROP COLUMN`), revert API routes, revert frontend. Each file change is a separate commit for targeted rollback.

## Open Questions

- [ ] **Seed data**: Does `packages/db/src/seed.ts` exist? Update to include new multa columns and test data for reports.
- [ ] **Dashboard `neto` display**: Currently `DashboardPage` uses `positive`/`negative` props. Neto can be negative — verify this renders correctly with current CSS.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing multas have NULL saldoPendiente after migration | Medium | Migration must UPDATE existing rows: `saldo_pendiente = monto WHERE estado = 'pendiente'`, `saldo_pendiente = 0 WHERE estado != 'pendiente'` |
| Actividades with tipoId as a name string (existing corrupt data) | Medium | LEFT JOIN returns null tipoNombre; frontend shows "—" gracefully |
| Transaction isolation in SQLite (serialized) is safe | Low | Better-SQLite3 is synchronous and serialized by default — no concurrent write issues |
| `db.transaction` callback using `tx` object vs `db` | Low | Code review must ensure all operations inside callback use the `tx` parameter, not the module-level `db` |
