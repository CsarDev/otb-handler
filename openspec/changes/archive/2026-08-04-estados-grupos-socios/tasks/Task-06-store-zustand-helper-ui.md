# Task-06: Store Zustand + helper UI

## Description

En `app.store.ts`: estado `estadosSocio`/`accionesSocio`/`grupos` + acciones full-list replace (`addEstadoSocio/updateEstadoSocio/removeEstadoSocio/setEstadoAcciones`, `addAccionSocio/removeAccionSocio`, `addGrupo/updateGrupo/removeGrupo`); `fetchConfig` ampliado a 5 endpoints con `.catch` defensivo; `bajaSocio(id, motivo)`; filtros `estadoId?`/`grupoId?` en `AporteFilters`/`MultaFilters`/`fetchSocios`/`fetchAsistencia`/`fetchLibroDiario`/`fetchResumenSocio`; nuevo `apps/web/src/lib/permisos.ts` con `socioPermiteUI(estadosSocio, accionesSocio, estadoId, accionClave)`.

## Requirements

- specs `socios-estados` (Frontend Spec — selectores/ocultar no permitidos)
- specs `grupos` (Frontend Spec)
- specs `reports` (Frontend Spec — delta)

## Files

- `apps/web/src/stores/app.store.ts` (mod)
- `apps/web/src/lib/permisos.ts` (nuevo)

## Dependencies

- Task-02
- Task-03
- Task-04

## Acceptance Criteria

- [ ] `pnpm --filter @otb/web typecheck`
- [ ] `socioPermiteUI` deriva claves correctas (activo → todas; suspendido → solo reportes)

## Estimated Lines

~115
