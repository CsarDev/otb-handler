# Task-02: Tipos de dominio y predicado socioPermite

## Description

Reescribir `Socio` (eliminar `estado`, agregar `estadoId/estadoNombre/estadoColor/esActivo/grupoPrimarioId/grupos/motivoBaja/fechaBaja`); nuevos `EstadoSocio` (con `accionIds` aplanado), `AccionSocio`, `Grupo`, `SocioInput` (con `grupoAdicionalIds`); predicado puro `socioPermite(clavesPermitidas, accionClave)`.

## Requirements

- specs `socios-estados` (Action Enforcement — escenario `socioPermite resolves the M:N action set`)
- specs `grupos` (Core Type Changes)

## Files

- `packages/core/src/index.ts`

## Dependencies

- Task-01 (nombres de columnas)

## Acceptance Criteria

- [ ] `pnpm --filter @otb/core typecheck`
- [ ] Ningún consumidor roto hasta Task-03 (el repo se rompe temporalmente en socios: esperado, se completa en el mismo PR)

## Estimated Lines

~70
