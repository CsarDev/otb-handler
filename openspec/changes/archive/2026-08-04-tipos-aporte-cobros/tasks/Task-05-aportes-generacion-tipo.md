# Task-05: Generación de aportes — monto del tipo, override, fix anual=12

## Description

En `packages/api/src/routes/aportes.ts`: extraer helper compartido `resolverMonto(socio, tipo, monto?)` (D6) que devuelve el `montoBase` del tipo del socio, o el override `monto` SOLO si `tipo` es `unico`/`extraordinario` (D4 — para `mensual`/`anual` IGNORA el override). **FIX bug absorvido**: cuando `tipo='anual'`, forzar exactamente 12 registros con `mes=1..12` IGNORANDO `body.meses` (hoy usa `body.meses`). `mensual` = N registros desde el mes inicial; `unico` = 1 registro. Aplicar `resolverMonto` en `POST /api/aportes` (single) y `POST /api/aportes/bulk`. Sin cambios al comportamiento transaccional por acción (`permite`/estado enforcement existente se mantiene).

## Requirements

- specs `payments` (Bulk Aportes — Monto Derivado: 3 escenarios mensual/anual/unico; Override Opcional: 3 escenarios single unico override, single mensual ignore 999, bulk extraordinario override)

## Files

- `packages/api/src/routes/aportes.ts` (mod)
- `packages/api/src/routes/config.ts` (mod — derivar `aporteMensualBase` del catálogo, campo global legacy)

## Dependencies

- Task-02 (types `BulkAporteRequest`)
- Task-04 (POST/PUT socio garantiza `tipoAporteId`)

## Acceptance Criteria

- [ ] `pnpm --filter @otb/api typecheck` + build
- [ ] Smoke: bulk `tipo='anual'` con `meses: 3` crea 12 registros mes 1..12 por socio, SIN efecto de `meses`
- [ ] Single `unico` con `monto: 100` → registro montoBase=100
- [ ] Single `mensual` con `monto: 999` → registro montoBase=50 (del tipo), NO 999
- [ ] Bulk `extraordinario` con `monto: 80` → registro montoBase=80
- [ ] `GET /api/config` expone `aporteMensualBase` derivado del catálogo

## Package Scope

api

## Estimated Lines

~120