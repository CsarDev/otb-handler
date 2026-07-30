# Tasks: ux-avanzado-otb

## Tareas

- [ ] Task-01: Schema Migration — agregar columnas aportes/movimientos/multas
- [ ] Task-02: Core Types — actualizar interfaces y request types
- [ ] Task-03: Multas Batch + Anulación + Filtros
- [ ] Task-04: Aportes Partial Payment (refactor)
- [ ] Task-05: Aportes Batch
- [ ] Task-06: Reports Filters
- [ ] Task-07: Multas Frontend Split
- [ ] Task-08: Aportes Frontend Split
- [ ] Task-09: Reports Frontend Filters

## Review Workload Forecast

| Metric | Value |
|--------|-------|
| Total estimated lines | ~1,050 |
| Exceeds 800 budget | ✅ Sí |
| Chained PRs recommended | ✅ Sí |

### Slices Proposal

| Chain | Tareas | Est. Lines | Dependencias |
|-------|--------|-----------|--------------|
| **Chain 1 — Schema** | Task-01 + Task-02 | ~70 | — |
| **Chain 2 — API Multas** | Task-03 | ~80 | Chain 1 |
| **Chain 3 — API Aportes+Reports** | Task-04 + Task-05 + Task-06 | ~300 | Chain 1 |
| **Chain 4 — Frontend** | Task-07 + Task-08 + Task-09 | ~600 | Chains 2, 3 |
