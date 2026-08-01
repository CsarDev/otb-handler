# Task-07: UI Config — tarjetas Estados, Acciones y Grupos

## Description

En `config.tsx`, clonar el bloque Tipos de Actividad: card **Estados de Socio** (fila: dot de `color` + nombre + badges esActivo/esDefecto/esBaja + grid de toggles inline `role="switch"` por estado×acción con `setEstadoAcciones` instantáneo y botón "Guardando…"; form crear/editar con `input type="color"` + checkboxes de acciones pre-marcadas + flags; 409 amigable al eliminar estado con socios); card **Acciones** (lista clave+nombre + form inline, warning en clave duplicada); card **Grupos** (clon literal Tipos de Actividad). Agregar `Switch` y `Badge` a `@otb/ui` (cva) si se reutilizan en ≥3 páginas. Responsive: toggles con `flex-wrap`, grids `grid-cols-3 → grid-cols-1 sm:`.

## Requirements

- specs `socios-estados` (Frontend Spec: card Estados con toggles inline + form pre-ticked; card Acciones)
- specs `grupos` (Frontend Spec: card Grupos + 409 amigable)

## Files

- `apps/web/src/routes/config.tsx` (mod, 293→~680)
- `packages/ui/src/components/Switch.tsx` (nuevo, si aplica)
- `packages/ui/src/components/Badge.tsx` (nuevo, si aplica)

## Dependencies

- Task-06

## Acceptance Criteria

- [ ] `pnpm --filter @otb/web typecheck` + build
- [ ] Manual: toggle inline persiste al recargar
- [ ] Form nuevo estado sin accionIds queda con todas marcadas
- [ ] ~360px sin desbordes

## Estimated Lines

~450
