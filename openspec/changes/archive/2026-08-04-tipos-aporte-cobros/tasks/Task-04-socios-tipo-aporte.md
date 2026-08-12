# Task-04: Socios POST/PUT — validar tipoAporteId + shape derivado

## Description

En `packages/api/src/routes/socios.ts`: agregar `validarTipoAporteId(tipoAporteId, db)` que verifica que el tipo exista Y `activo=1` (400 `{ "error": "tipoAporteId is invalid or inactive" }`). POST/PUT: si el body omite `tipoAporteId`, asignar el PRIMER tipo activo como default (D3: garantía de la API durante la transición nullable); quitar `aporteBase` del whitelist de campos escribibles (un PUT con `aporteBase: 999` NO debe persistirse — spec socios-estados "Saving a raw aporteBase"). Response shape: `leftJoin` con `tipos_aporte` para exponer `tipoAporteId`, `tipoAporteNombre` y `aporteBase` DERIVADO del `montoBase` del tipo (fallback a default activo si `tipoAporteId` NULL — escenario legacy). Validar además que los filtros de GET (estado/grupo) sigan funcionando con el join.

## Requirements

- specs `aporte-types` (Socio Assignment: 4 escenarios — default activo, inactive reject 400, PUT cambia tipo y deriva, editar montoBase propaga)
- specs `socios-estados` (Socio Model: 3 escenarios — shape expone tipo+derivado, aporteBase 999 ignorado, legacy NULL → default; REMOVED writable)

## Files

- `packages/api/src/routes/socios.ts` (mod)

## Dependencies

- Task-01 (columna `socios.tipoAporteId` + catálogo)
- Task-02 (`SocioInput.tipoAporteId` remueve `aporteBase` writable)
- Task-03 (catálogo CRUD — no estrictamente, pero los tipos deben existir para validar)

## Acceptance Criteria

- [ ] `pnpm --filter @otb/api typecheck` + build
- [ ] Smoke: POST socio sin `tipoAporteId` → queda con primer tipo activo y `aporteBase` derivado
- [ ] POST socio con tipo inactivo → 400 `tipoAporteId is invalid or inactive`
- [ ] PUT con `aporteBase: 999` → la respuesta sigue reflejando el monto del tipo
- [ ] Editar `montoBase` de un tipo → GET socio refleja nuevo valor derivado
- [ ] Socio legacy con `tipoAporteId=NULL` → GET lo presenta con default activo

## Package Scope

api

## Estimated Lines

~65
