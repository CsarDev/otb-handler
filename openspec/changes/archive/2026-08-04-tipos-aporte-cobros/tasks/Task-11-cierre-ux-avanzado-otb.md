# Task-11: Cierre — archivar/cancelar ux-avanzado-otb (planificar paso)

## Description

SOLO PLANIFICAR (no ejecutar el archive en esta tarea): documentar el paso de cierre del change. Cuando este change (tipos-aporte-cobros) supere verificación, el cambio superado `openspec/changes/ux-avanzado-otb` DEBE archivarse/cancelarse vía el flujo `sdd-archive` (los pendientes absorbidos — historial de pagos, bulk/all, fix anual→12, store/UI — ya quedaron implementados acá). Verificar que el change tiene un doc de archive listo (o un flag `superseded_by: tipos-aporte-cobros`) y que el rol de orquestador tiene el paso marcado como post-verificación. No modificar código en esta tarea.

## Requirements

- proposal.md (Dependencies: "Absorbe openspec/changes/ux-avanzado-otb (queda superado → se archiva al completar este cambio)")
- Success Criteria: "ux-avanzado-otb queda archivado/cancelado tras verificación"

## Files

- `openspec/changes/tipos-aporte-cobros/tasks.md` (sin cambios de código)
- (post-verificación, orquestador) `openspec/changes/ux-avanzado-otb/*` (archive)

## Dependencies

- Verificación completa del change (Task-10 y verify)

## Acceptance Criteria

- [ ] Documentado el paso de archive de `ux-avanzado-otb` (marcado `superseded_by` o checklist en el cierre)
- [ ] Confirmado que NO se ejecuta antes de la verificación del change
- [ ] Sin cambios de código/API/UI en esta tarea

## Package Scope

docs

## Estimated Lines

~10