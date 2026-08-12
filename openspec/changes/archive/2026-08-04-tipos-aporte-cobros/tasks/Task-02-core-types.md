# Task-02: Core types — TipoAporte, Socio.tipoAporteId, BulkAporteRequest

## Description

En `packages/core/src/index.ts`: agregar `TipoAporte` (`{ id, nombre, montoBase, descripcion: string|null, activo }`) y `TipoAporteInput` (`{ nombre, montoBase, descripcion?, activo? }`). Extender `Socio` con `tipoAporteId: string|null` y `tipoAporteNombre: string|null` (respuesta, vía join) y `aporteBase` marcado como derivado; `SocioInput` ELIMINA `aporteBase` del whitelist de campos escribibles (spec socios-estados "REMOVED") y agrega `tipoAporteId?: string`. Ajustar `BulkAporteRequest` al contrato del design: `{ socioIds?: string[]; tipo: 'mensual'|'unico'|'anual'|'extraordinario'; monto?: number /* override solo unico/extraordinario */; montoBase?: number; gestion: number; mes?: number; meses?: number }`.

## Requirements

- specs `aporte-types` (Interfaces/Contracts del design: `TipoAporte`, `TipoAporteInput`)
- specs `socios-estados` (REMOVED: `aporteBase` writable; Migration: derived read model)
- specs `payments` (Validation: `monto` override opcional solo unico/extraordinario)

## Files

- `packages/core/src/index.ts` (mod)

## Dependencies

- Task-01 (schema define el shape que los types reflejan)

## Acceptance Criteria

- [ ] `pnpm --filter @otb/core typecheck` sin error
- [ ] `SocioInput` ya no expone `aporteBase` como writable (compilación lo evidencia si algún consumer lo usa)
- [ ] `BulkAporteRequest` distingue `monto` (override) de `montoBase` (derivado del tipo)
- [ ] Types reflejan los campos exactos del contrato del design (respuesta socio: `tipoAporteId`, `tipoAporteNombre`, `aporteBase` derivado)

## Package Scope

core

## Estimated Lines

~35
