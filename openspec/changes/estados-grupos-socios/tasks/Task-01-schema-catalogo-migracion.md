# Task-01: Schema, catálogo y migración 2 fases

## Description

Crear `catalogo.ts` (7 acciones + 4 estados + M:N, UUIDs fijos); 5 tablas nuevas (`estados_socio`, `acciones_socio`, `estado_acciones`, `grupos`, `socio_grupos`); modificar `socios` (quitar enum `estado` SOLO en la fase 2, agregar `estadoId`/`grupoPrimarioId`/`motivoBaja`/`fechaBaja`); migración `0003` con seed del catálogo + backfill `estadoId` por nombre; migración `0004` con `ALTER TABLE DROP COLUMN estado` AL FINAL; actualizar `seed.ts` (catálogo desde `catalogo.ts`, `esActivo` en generación de aportes/asistencia, 2-3 grupos de ejemplo).

## Requirements

- specs `socios-estados` (Migración: ambos escenarios)
- specs `grupos` (Group CRUD parcial — schema)
- specs `join-fixes`/`payments` no aplican acá

## Files

- `packages/db/src/catalogo.ts` (nuevo)
- `packages/db/src/schema/estados-socio.ts` (nuevo)
- `packages/db/src/schema/acciones-socio.ts` (nuevo)
- `packages/db/src/schema/estado-acciones.ts` (nuevo)
- `packages/db/src/schema/grupos.ts` (nuevo)
- `packages/db/src/schema/socio-grupos.ts` (nuevo)
- `packages/db/src/schema/socios.ts` (mod)
- `packages/db/src/schema.ts` (mod)
- `packages/db/drizzle/0003_*.sql` + `0004_*.sql` (editados a mano)
- `packages/db/src/seed.ts` (mod)

## Dependencies

- Ninguna

## Acceptance Criteria

- [ ] `pnpm --filter @otb/db typecheck` + `pnpm --filter @otb/db db:migrate` + `db:seed` sin error
- [ ] Columnas nuevas visibles
- [ ] `estado` aun existe tras 0003 y desaparece tras 0004
- [ ] Dashboard con MISMO totalSocios/morosos que antes de migrar

## Estimated Lines

~290
