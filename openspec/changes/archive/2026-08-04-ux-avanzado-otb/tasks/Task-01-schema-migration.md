# Task-01: Schema Migration

## Description
Agregar columnas a schema de aportes, movimientos y multas. Remover enum constraint de tipo en aportes.

## Files
- `packages/db/src/schema/aportes.ts` — agregar montoPagado, saldoPendiente, razonAnulacion; cambiar tipo a text() sin enum
- `packages/db/src/schema/movimientos.ts` — agregar anulado (integer, default 0), razonAnulacion
- `packages/db/src/schema/multas.ts` — agregar razonAnulacion
- `packages/db/src/seed.ts` — actualizar seed con nuevos campos

## Dependencies
- Ninguna

## Acceptance Criteria
- [ ] Migration generada con drizzle-kit generate
- [ ] Aportes existentes backfilled: pagados → montoPagado=montoBase, saldoPendiente=0
- [ ] Seed corre sin errores
- [ ] Typecheck pasa

## Estimated Lines
40
