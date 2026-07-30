# Task-01: Schema Migration — Columnas de Pago Parcial en Multas

## Description

Agregar las columnas `saldoPendiente` y `montoPagado` a la tabla `multas` en el schema de Drizzle. Crear la migración correspondiente (manual SQL ya que SQLite no soporta `ALTER TABLE ADD COLUMN` con todas las features de Drizzle Kit). Backfill: actualizar filas existentes para que `saldoPendiente = monto` en multas pendientes y `saldoPendiente = 0` en pagadas/anuladas.

**No** incluir la columna `motivo` en `movimientos` — la columna `nota` existente cubre ese propósito (decisión de diseño documentada).

## Files

- `packages/db/src/schema/multas.ts` — agregar columnas `saldoPendiente` y `montoPagado`
- `packages/db/src/seed.ts` (si existe) — actualizar seed con nuevos campos
- `packages/db/drizzle/<timestamp>_add_fine_payment_fields.sql` — migración manual SQL

## Dependencies

Ninguna. Esta tarea es la fundación del cambio.

## Acceptance Criteria

- [ ] Schema `multas` tiene columna `saldo_pendiente: real('saldo_pendiente').notNull().default(0)`
- [ ] Schema `multas` tiene columna `monto_pagado: real('monto_pagado').notNull().default(0)`
- [ ] Migración SQL creada con `ALTER TABLE multas ADD COLUMN saldo_pendiente REAL NOT NULL DEFAULT 0` y `ALTER TABLE multas ADD COLUMN monto_pagado REAL NOT NULL DEFAULT 0`
- [ ] Backfill ejecutado: `UPDATE multas SET saldo_pendiente = monto WHERE estado = 'pendiente'`
- [ ] Backfill ejecutado: `UPDATE multas SET saldo_pendiente = 0 WHERE estado != 'pendiente'`
- [ ] `pnpm typecheck` pasa sin errores
- [ ] Seed data incluye `saldoPendiente` y `montoPagado` en los inserts de multas

## Estimated Lines

35
