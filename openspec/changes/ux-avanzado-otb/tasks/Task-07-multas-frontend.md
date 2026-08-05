# Task-07: Multas Frontend Split

## Description
Dividir página de multas en tabs Crear/Listar con formulario batch y filtros expandidos.

## Files
- `apps/web/src/routes/multas.tsx`
- `apps/web/src/stores/app.store.ts`

## Dependencies
- Task-03

## Acceptance Criteria
- [ ] Dos tabs: "Crear Multas" y "Listar Multas"
- [ ] Crear: selector multi-socio (checkboxes), concepto, monto, actividad opcional
- [ ] Listar: filtros actividadId, gestion, fechaDesde/fechaHasta, socioId, estado
- [ ] Modal anular con campo de razón
- [ ] Store: createMultasBulk, anularMultaConRazon
- [ ] Typecheck pasa

## Estimated Lines
200
