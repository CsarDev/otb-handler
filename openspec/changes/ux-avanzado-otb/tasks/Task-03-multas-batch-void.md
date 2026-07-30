# Task-03: Multas Batch + Anulación + Filtros

## Description
Agregar creación masiva de multas, anulación con razón, y nuevos filtros en GET.

## Files
- `packages/api/src/routes/multas.ts`

## Dependencies
- Task-01, Task-02

## Acceptance Criteria
- [ ] POST /api/multas/bulk acepta { socioIds: string[], concepto, monto } y crea una multa por cada socio
- [ ] POST /api/multas/:id/anular acepta { razon }, marca estado=anulado, guarda razonAnulacion, anula movimiento asociado
- [ ] GET /api/multas filtra por actividadId, fechaDesde, fechaHasta, gestion (strftime)
- [ ] db.transaction() para bulk y anulación
- [ ] Typecheck pasa

## Estimated Lines
80
