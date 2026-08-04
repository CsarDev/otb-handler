# Task-09: UI módulos — filtros y ocultar no permitidos

## Description

En `asistencia.tsx`, `aportes.tsx`, `multas.tsx`, `reportes.tsx`: selects de filtro `estadoId`/`grupoId` (combinables con filtros existentes) y selectores de socio filtrados con `socioPermiteUI(..., 'asistencia'|'reportes')` (ocultar o `disabled`); reportes: resumen-socio oculta socios sin `reportes`; badge de estado en filas donde aplique; responsive (chips wrap, cards apiladas en `sm:`).

## Requirements

- specs `join-fixes` (Frontend: selector asistencia excluye no permitidos)
- specs `payments` (Frontend spec — filtros)
- specs `reports` (Frontend Spec — delta: selector resumen oculta sin `reportes`, filtros estado/grupo)

## Files

- `apps/web/src/routes/asistencia.tsx` (mod)
- `apps/web/src/routes/aportes.tsx` (mod)
- `apps/web/src/routes/multas.tsx` (mod)
- `apps/web/src/routes/reportes.tsx` (mod)

## Dependencies

- Task-06
- Task-08

## Acceptance Criteria

- [ ] `pnpm --filter @otb/web typecheck` + build
- [ ] Manual: socio suspendido no aparece en selector de asistencia ni en resumen-socio
- [ ] Filtros estado/grupo funcionan y se combinan

## Estimated Lines

~185
