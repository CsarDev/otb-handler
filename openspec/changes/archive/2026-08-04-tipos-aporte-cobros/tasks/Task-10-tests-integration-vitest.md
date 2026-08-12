# Task-10: Tests vitest (integration) + smoke manual

## Description

Escribir los primeros tests de integración del repo con **Vitest 2.1 + better-sqlite3 in-memory** (`DB_URL=':memory:'` vía `@otb/db`, siguiendo la infra del workspace) contra `ApiApp` de `@otb/api` usando `app.request()` de Hono. Cubrir escenarios clave por capa:

1. **tipos-aporte CRUD**: list 200 con 4 tipos seed; POST sin `nombre`/`montoBase` → 400; POST crea y devuelve catálogo; PUT 404 fake-id; DELETE tipo en uso → **409**, tipo sin uso → 200.
2. **socios**: POST sin `tipoAporteId` → default activo + `aporteBase` derivado; POST tipo inactivo → 400; PUT `{ aporteBase: 999 }` → no persiste, queda 50 del tipo; legacy NULL → default activo.
3. **aportes generación**: bulk mensual deriva 50/30 por socio; bulk anual con `meses:3` crea 12 (mes 1..12) ignorando `meses`; single unico override 100; single mensual `monto:999` → 50 del tipo; bulk extraordinario override 80.
4. **bulk/all + pagos**: excluye no-permitidos por estado (sin hardcode); 400 sin elegibles; anual→12 por socio; GET `/pagos` solo ingreso ordenados, `[]` sin pagos, 404 fake-id.

Cerrar con smoke manual: seed + `pnpm dev`, UI Config/Socio/Aportes a ~360px.

## Requirements

- specs `aporte-types` (escenarios CRUD + seed + socio assignment)
- specs `payments` (escenarios bulk/anual/override/bulk-all/pagos)
- specs `socios-estados` (escenarios shape derivado + backfill)

## Files

- `packages/api/test/tipos-aporte.test.ts` (nuevo)
- `packages/api/test/socios-tipo-aporte.test.ts` (nuevo)
- `packages/api/test/aportes-generacion.test.ts` (nuevo)
- `packages/api/test/aportes-bulk-all-pagos.test.ts` (nuevo)

## Dependencies

- Task-03 (CRUD + mount)
- Task-04 (validación socios)
- Task-05 (generación + anual fix + override)
- Task-06 (bulk/all + pagos)

## Acceptance Criteria

- [ ] `pnpm test` (o `pnpm vitest`) corre los 4 archivos en memoria sin DB externa y sin red
- [ ] Todos los escenarios listados arriba pasan (asserts sobre status + body)
- [ ] Guard 409 cubierto con tipo en uso; anual=12 cubierto con `meses:3`
- [ ] Smoke manual 360px documentado (Config, socio select, checkbox todos, historial)

## Package Scope

test

## Estimated Lines

~250