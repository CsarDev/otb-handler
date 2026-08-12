# Task-08: UI Config "Tipos de Aporte" + select tipo en socio

## Description

En `apps/web/src/routes/config.tsx`: clonar el bloque **Tipos de Actividad** → card **"Tipos de Aporte"** que lista filas con `nombre`, `montoBase` (Bs) y badge `activo`; form crear/editar con `nombre` (text), `montoBase` (number), `descripcion` (opcional), toggle `activo`; botón eliminar que muestra el error 409 amigable cuando el tipo está en uso. En `apps/web/src/routes/socios.tsx`: reemplazar el input ¨aporteBase¨ por un **select de Tipo de Aporte** (options = tipos activos del store, default primer activo); la ficha/lista muestra el `tipoAporteNombre` + monto derivado (`aporteBase` derivado, no writable). Responsive a ~360px (chips/stack con `flex-wrap`).

## Requirements

- specs `aporte-types` (Frontend Spec: card Tipos de Aporte + select socio + derivación; 409 amigable; ~360px)
- specs `socios-estados` (lista/ficha muestran tipo + monto derivado)

## Files

- `apps/web/src/routes/config.tsx` (mod)
- `apps/web/src/routes/socios.tsx` (mod)

## Dependencies

- Task-07 (store `tiposAporte` + selectores)

## Acceptance Criteria

- [ ] `pnpm --filter @otb/web typecheck` + build
- [ ] Manual: crear/editar/eliminar tipo desde Config persiste al recargar; eliminar tipo en uso muestra 409 amigable
- [ ] Form socio muestra select de tipo (solo activos), default primer activo; guardar persiste
- [ ] Ficha/lista de socio muestra tipo + monto derivado (sin input de aporte)
- [ ] ~360px sin desbordes

## Package Scope

web

## Estimated Lines

~265