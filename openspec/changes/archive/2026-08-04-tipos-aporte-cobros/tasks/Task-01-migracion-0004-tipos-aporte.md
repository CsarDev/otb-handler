# Task-01: Migración 0004 — tabla tipos_aporte + columna tipoAporteId + seed/backfill

## Description

Crear `packages/db/src/schema/tipos-aporte.ts` (tabla `tipos_aporte`: `id` text PK, `nombre` text notNull, `montoBase` real notNull, `descripcion` text nullable, `activo` int default 1). Agregar `tipoAporteId` (text FK → `tipos_aporte.id`, nullable durante transición) a `socios` y comentar `aporteBase` como legacy/derivado (D2, D3). Exportar en `schema.ts`. Agregar `TIPOS_APORTE_CATALOGO` en `catalogo.ts` con ids estables (`ta-pleno/ta-familiar/ta-jubilado/ta-honorario`) compartidos por migración y seed. Migración drizzle `0004_*.sql` (generada + SQL a mano siguiendo patrón 0003): seed de los 4 tipos (Pleno 50, Familiar 30, Jubilado 25, Honorario 0) y backfill `UPDATE socios SET tipo_aporte_id = (match por aporte_base igual a un montoBase) ELSE 'ta-pleno'` — idempotente, NUNCA reescribe `aportes` existentes (solo toca `socios.tipoAporteId`). Actualizar `seed.ts` para sembrar tipos desde `catalogo.ts` y asignar `tipoAporteId` a los socios del seed.

## Requirements

- specs `aporte-types` (Seed of Default Types: escenario "Fresh seed contains exactly four types")
- specs `socios-estados` (Migration — Backfill: 4 escenarios, incl. no reescribe aportes existentes)

## Files

- `packages/db/src/schema/tipos-aporte.ts` (nuevo)
- `packages/db/src/schema/socios.ts` (mod)
- `packages/db/src/schema.ts` (mod)
- `packages/db/src/catalogo.ts` (mod)
- `packages/db/src/seed.ts` (mod)
- `packages/db/drizzle/0004_*.sql` (nuevo, drizzle + SQL a mano)

## Dependencies

- Ninguna

## Acceptance Criteria

- [ ] `pnpm --filter @otb/db typecheck` + `db:migrate` + `db:seed` sin error
- [ ] Migración idempotente: re-ejecutar seed no duplica tipos ni reescribe `tipoAporteId`/`aportes`
- [ ] Seed produce exactamente 4 tipos (50/30/25/0) y socios con `tipoAporteId` asignado
- [ ] Backfill: socio legacy `aporte_base=37` (sin match) queda con `ta-pleno`
- [ ] `drizzle-kit` no reporta drift con el schema

## Package Scope

db

## Estimated Lines

~170
