# Tasks: estados-grupos-socios

## Tareas

- [x] Task-01: Schema, catálogo y migración 2 fases
- [x] Task-02: Tipos de dominio y predicado socioPermite
- [ ] Task-03: CRUD catálogos (estados-socio, acciones-socio, grupos)
- [ ] Task-04: Socios modificado + lib/permisos.ts
- [ ] Task-05: Enforcement por acción en módulos existentes
- [ ] Task-06: Store Zustand + helper UI
- [ ] Task-07: UI Config — tarjetas Estados, Acciones y Grupos
- [ ] Task-08: UI Socios — form, filtros, badge y ficha
- [ ] Task-09: UI módulos — filtros y ocultar no permitidos

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2,100 (additions + deletions) |
| User 800-line budget | ✅ Exceeds (est. ~2,100) |
| Chained PRs recommended | ✅ Sí |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |
| Recommended | Single PR a dev con `size:exception` (decisión PO cerrada) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

> El cambio cruza 5 capas (db, core, api, store, ui) y ~25 archivos; incluso dividido por fases, el diff total supera el budget de 800 líneas. Con `single-pr` el orquestador DEBE requerir `size:exception` del maintainer antes de apply. Alternativa (si el maintainer la rechaza): chain 1 = Tasks 1-2, chain 2 = Tasks 3-5, chain 3 = Tasks 6-9.

### Suggested Work Units (si se autoriza chain en vez de size:exception)

| Unit | Tasks | PR base | Focused check | Runtime harness | Rollback boundary |
|------|-------|---------|---------------|-----------------|-------------------|
| 1 | Task-01 + Task-02 | dev | `pnpm --filter @otb/db typecheck` | `pnpm --filter @otb/db db:seed` + dashboard manual | Migraciones 0003/0004; drop irreversible → último paso de la chain |
| 2 | Task-03 + Task-04 + Task-05 | PR 1 | `pnpm typecheck` + `pnpm --filter @otb/api build` | `pnpm dev` + curl a estados-socio/grupos/baja/socios?grupoId | Routers nuevos y ediciones de rutas, revertibles desde git |
| 3 | Task-06 + Task-07 + Task-08 + Task-09 | PR 2 | `pnpm typecheck` + `pnpm --filter @otb/web build` | `pnpm dev` UI a ~360px | `app.store.ts`/`.tsx` revertibles desde git |
