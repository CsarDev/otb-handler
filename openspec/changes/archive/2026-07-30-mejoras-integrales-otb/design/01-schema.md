# Design: Schema Changes

## Columns

| Table | Column | Type | Constraint | Default |
|-------|--------|------|------------|---------|
| `multas` | `saldo_pendiente` | `real` | `notNull` | `monto` (set at insert) |
| `multas` | `monto_pagado` | `real` | `notNull` | 0 |
| `movimientos` | `motivo` | `text` | nullable | — |

### Design Decisions

- **No `motivo` on `movimientos`**: Not strictly required by any spec scenario. The `nota` field already serves as description. Adding `motivo` would duplicate semantics. **Decision**: skip `motivo`.
- **`saldoPendiente` default in DB is 0** (Drizzle column default), but every `INSERT` into `multas` sets `saldoPendiente = monto` in application code. The DB default is a safety net for migrations.
- **`montoPagado` tracks cumulative payments**. Avoids needing to SUM movements per multa on every read. Updated atomically inside the payment transaction.

## Drizzle Migration

```ts
// packages/db/drizzle/XXXX_add_fine_payment_fields.ts
import { sqliteTable, real } from 'drizzle-orm/sqlite-core';

export async function up(db: DrizzleDB) {
  await db.run(sql`ALTER TABLE multas ADD COLUMN saldo_pendiente REAL NOT NULL DEFAULT 0`);
  await db.run(sql`ALTER TABLE multas ADD COLUMN monto_pagado REAL NOT NULL DEFAULT 0`);
  // motivo skipped — nota field covers it
}

export async function down(db: DrizzleDB) {
  await db.run(sql`ALTER TABLE multas DROP COLUMN saldo_pendiente`);
  await db.run(sql`ALTER TABLE multas DROP COLUMN monto_pagado`);
}
```

## Files Changed

| File | Action |
|------|--------|
| `packages/db/src/schema/multas.ts` | Add `saldoPendiente`, `montoPagado` columns |
| `packages/db/src/schema/movimientos.ts` | No changes (motivo skipped) |
| `packages/db/drizzle/*.sql` | New migration |
| `packages/db/src/seed.ts` | If exists, update to include new columns |
