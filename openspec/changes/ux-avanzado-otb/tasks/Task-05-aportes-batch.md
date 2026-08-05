# Task-05: Aportes Batch

## Description
Creación masiva de aportes para uno, varios, o todos los socios.

## Files
- `packages/api/src/routes/aportes.ts`

## Dependencies
- Task-01, Task-02

## Acceptance Criteria
- [ ] POST /api/aportes/bulk: { socioIds, tipo, montoBase, gestion, mes?, meses? }
  - tipo='unico': 1 aporte por socio
  - tipo='mensual': N aportes con mes incrementado
  - tipo='anual': 12 aportes (mes 1-12)
- [ ] POST /api/aportes/bulk/all: igual pero para TODOS los socios activos
- [ ] Devuelve { count, aportes }
- [ ] Typecheck pasa

## Estimated Lines
80
