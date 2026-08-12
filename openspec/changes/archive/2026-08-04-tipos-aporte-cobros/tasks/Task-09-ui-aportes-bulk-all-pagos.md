# Task-09: UI Aportes — checkbox "todos"→bulk/all + historial de pagos

## Description

En `apps/web/src/routes/aportes.tsx`: hacer que el checkbox **"Todos los socios"** dispare `createAportesBulkAll` REAL (`POST /api/aportes/bulk/all`, sin `socioIds`) en lugar de construir el select en el cliente; al desmarcarlo, volver al flujo `createAportesBulk` con `socioIds` explícitos. El form de creación muestra el monto derivado del tipo por socio (o campo override visible SOLO para `tipo='unico'`/`'extraordinario'`). Dejar de enviar `meses` cuando `tipo='anual'` (el API fuerza 12). Agregar vista de **historial de pagos** por aporte (modal/tab) que usa `fetchPagosAporte(id)` y lista los movimientos `tipo='ingreso'` (fecha, monto, estado). Manejar el 400 "Ningún socio puede participar" de `bulk/all` como mensaje amigable. Responsive a ~360px.

## Requirements

- specs `payments` (Frontend: checkbox "todos"→bulk/all real; historial de pagos vía `fetchPagosAporte`; form sin `meses` para anual — success criteria del proposal)
- specs `aporte-types` (Frontend Spec: derivación/override en form de aportes)

## Files

- `apps/web/src/routes/aportes.tsx` (mod)

## Dependencies

- Task-07 (store `createAportesBulkAll`, `fetchPagosAporte`)

## Acceptance Criteria

- [ ] `pnpm --filter @otb/web typecheck` + build
- [ ] Manual: checkbox "Todos los socios" → `POST /api/aportes/bulk/all` (verificable en red), devuelve `{ count, items }`
- [ ] Form `tipo='anual'` no envía `meses`; override solo visible para unico/extraordinario
- [ ] Historial de pagos por aporte muestra movimientos ingreso (modal/tab)
- [ ] 400 de `bulk/all` sin elegibles se muestra amigable
- [ ] ~360px sin desbordes

## Package Scope

web

## Estimated Lines

~130