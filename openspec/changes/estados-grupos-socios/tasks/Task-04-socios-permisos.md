# Task-04: Socios modificado + lib/permisos.ts

## Description

Nuevo `packages/api/src/lib/permisos.ts` (loader batch `cargarPermisosPorEstado()` 1 query + mapa `estadoId→Set<clave>`, `permite()`, `ERROR_PERMISO`); modificar `socios.ts`: GET `/?search&estadoId&grupoId` (grupoId = primario OR subquery `socio_grupos`; join a estado → `estadoNombre/estadoColor/esActivo`; grupos adicionales batch adjuntado en memoria, sin N+1); POST/PUT validan `estadoId` (default esDefecto, sin esDefecto → 400), `grupoPrimarioId`/`grupoAdicionalIds` (existen + invariante primario∉adicionales → 400), tx para insert/replace de `socio_grupos`; `POST /:id/baja` (motivo requerido, estado esBaja, fechaBaja ISO, 400 si ya baja); DELETE soft → estado esBaja, motivoBaja null; GET `/:id` shape enriquecido.

## Requirements

- specs `socios-estados` (Socio CRUD and Baja: 9 escenarios)
- specs `grupos` (Socio ↔ Group Association: 6 escenarios; Group Filtering: 4 escenarios)

## Files

- `packages/api/src/lib/permisos.ts` (nuevo)
- `packages/api/src/routes/socios.ts` (mod, 88→~270)

## Dependencies

- Task-01
- Task-02

## Acceptance Criteria

- [ ] `pnpm typecheck` + build API
- [ ] Curl smoke: POST sin estadoId → esDefecto
- [ ] `grupoPrimarioId` fake → 400
- [ ] Baja sin motivo → 400
- [ ] `GET /socios?grupoId=` incluye primarios+adicionales y excluye sin grupo

## Estimated Lines

~230
