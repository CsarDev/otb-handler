# Task-08: UI Socios — form, filtros, badge y ficha

## Description

En `socios.tsx`: `socioSchema` gana `estadoId`/`grupoPrimarioId`/`grupoAdicionalIds`; form con select de estado (opciones con dot de color `● nombre`), select primario + multi-select adicionales con chips `×` (wrap); lista: badge de estado con `style={{ backgroundColor: estadoColor }}` (hex inline, no clases dinámicas), chips de grupos, selects de filtro estado + grupo; botón "Dar de baja" → modal con textarea `motivo` requerido → `bajaSocio`; fila en baja muestra motivo/fecha; ficha en modal/drawer (mobile-first) con badge + chips + motivo. Tabla → cards apiladas en `sm:` para ~360px.

## Requirements

- specs `socios-estados` (Frontend Spec: select con dot, badge tinted, baja con motivo)
- specs `grupos` (Frontend Spec: select primario/multi, chips, filtro grupo, ficha)

## Files

- `apps/web/src/routes/socios.tsx` (mod, 238→~520)

## Dependencies

- Task-06
- Task-07 (Badge/Switch si se extraen)

## Acceptance Criteria

- [ ] `pnpm --filter @otb/web typecheck` + build
- [ ] Manual: badge muestra color del estado
- [ ] Filtro grupo combina con búsqueda
- [ ] Baja requiere motivo
- [ ] ~360px usable

## Estimated Lines

~280
