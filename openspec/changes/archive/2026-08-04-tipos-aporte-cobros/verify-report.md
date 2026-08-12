```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:a51dfccbe4d2c26198246369992e58ff90b3a48f692f838ddc515b0ccf512692
verdict: pass
blockers: 0
critical_findings: 0
requirements: 12/12
scenarios: 62/62
test_command: pnpm --filter @otb/api test
test_exit_code: 0
test_output_hash: sha256:5ca555694f3a53c8ac3488224a956dbe26899e88c4c468cd460b2f8ba8cd6d27
build_command: pnpm typecheck
build_exit_code: 0
build_output_hash: sha256:818fb98a94f42025313bb0e89825a39f5ba58305035832c28af5e4a7c5350968
```

# Verification Report — tipos-aporte-cobros

**Change**: tipos-aporte-cobros (Aportes as Dynamic Definitions with Many-to-Many Socio Assignment)
**Version**: delta specs (aporte-definitions NEW, payments MODIFIED, socios-estados MODIFIED)
**Fecha**: 2026-08-04
**Mode**: hybrid (filesystem + Engram)

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 14 (T1.1–T6.5 = 13 code tasks + T7.1 meta) |
| Tasks complete | 13/13 code tasks ([x]) |
| Tasks incomplete | 1 — T7.1 (archive `ux-avanzado-otb`, post-verificación, no code) |

T7.1 is intentionally post-verification and does NOT block PASS; it is the `next_recommended` action.

---

## Build & Tests Execution (real runs)

**Test suite**: `pnpm --filter @otb/api test`
- ✅ **4/4 test files passed, 60/60 tests passed, 0 failed, 0 skipped** (Vitest, better-sqlite3 `:memory:` + Hono `app.request()`)
- Archivos: `aporte-definicion.test.ts` (19), `socios-aportes.test.ts` (17), `aportes-generacion.test.ts` (11), `aportes-bulk-all-pagos.test.ts` (13)

**Typechecks** (tsc --noEmit, todos exit 0):
| Package | Result |
|---------|--------|
| `@otb/db` | ✅ exit 0 |
| `@otb/core` | ✅ exit 0 |
| `@otb/api` | ✅ exit 0 |
| `@otb/web` | ✅ exit 0 |

**Migration drift**: `pnpm --filter @otb/db db:generate` → `No schema changes, nothing to migrate` (exit 0), `git status` sin archivos nuevos → **sin drift entre schema y migración 0005**.

**Estado real de la db** (`packages/db/otb.db`):
- `aportes_definicion`: 4 filas (ap-mensual/ap-familiar/ap-jubilado/ap-honorario, monto 50/30/25/0)
- `socio_aportes`: 17 filas
- `aportes`: 219 registros preservados (sin reescritura retroactiva — spec)
- Columnas `socios.tipo_aporte_id`/`aporte_base`: ausentes; tabla `tipos_aporte`: ausente

**Coverage**: ➖ Not configured (`coverage_threshold` no definido en openspec/config.yaml)

---

## Spec Compliance Matrix (62/62 escenarios)

### Spec `aporte-definitions` (22/22)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Definition CRUD — Aportes | List returns the full catalog | `aporte-definicion.test.ts > lista el catálogo completo con las 4 definiciones sembradas` | ✅ COMPLIANT |
| Definition CRUD — Aportes | Create a full definition | `aporte-definicion.test.ts > crea una definición completa y la devuelve en el catálogo (201)` | ✅ COMPLIANT |
| Definition CRUD — Aportes | Create without nombre is rejected | `aporte-definicion.test.ts > rechaza POST sin nombre con 400` | ✅ COMPLIANT |
| Definition CRUD — Aportes | Create without monto is rejected | `aporte-definicion.test.ts > rechaza POST sin monto con 400` | ✅ COMPLIANT |
| Definition CRUD — Aportes | Create with a negative monto is rejected | `aporte-definicion.test.ts > rechaza POST con monto negativo con 400` | ✅ COMPLIANT |
| Definition CRUD — Aportes | Create with an invalid recurrencia is rejected | `aporte-definicion.test.ts > rechaza POST con recurrencia inválida con 400` | ✅ COMPLIANT |
| Definition CRUD — Aportes | Create with an invalid modalidadPago is rejected | `aporte-definicion.test.ts > rechaza POST con modalidadPago inválida con 400` | ✅ COMPLIANT |
| Definition CRUD — Aportes | Create with an inverted vigencia window is rejected | `aporte-definicion.test.ts > rechaza POST con ventana invertida (fin < inicio) con 400` | ✅ COMPLIANT |
| Definition CRUD — Aportes | Create with a nonexistent aplicaGrupoId is rejected | `aporte-definicion.test.ts > rechaza POST con aplicaGrupoId desconocido con 400` | ✅ COMPLIANT |
| Definition CRUD — Aportes | Create a group-scoped definition | `aporte-definicion.test.ts > crea una definición group-scoped con aplicaGrupoId (201)` | ✅ COMPLIANT |
| Definition CRUD — Aportes | Update editable fields | `aporte-definicion.test.ts > actualiza campos editables y lo refleja en el catálogo (200)` | ✅ COMPLIANT |
| Definition CRUD — Aportes | PUT with an id field does not change the definition id | `aporte-definicion.test.ts > PUT con un id en el body NO renombra la definición (D7)` | ✅ COMPLIANT |
| Definition CRUD — Aportes | Update a nonexistent definition returns 404 | `aporte-definicion.test.ts > devuelve 404 al actualizar una definición inexistente` | ✅ COMPLIANT |
| Definition CRUD — Aportes | Delete an unused definition succeeds | `aporte-definicion.test.ts > elimina una definición sin uso y la quita del catálogo (200)` | ✅ COMPLIANT |
| Definition CRUD — Aportes | Delete a nonexistent definition returns 404 | `aporte-definicion.test.ts > devuelve 404 al eliminar una definición inexistente` | ✅ COMPLIANT |
| DELETE Guard — 409 | Delete with assignments is rejected (409 + friendly msg + retained) | `aporte-definicion.test.ts > rechaza DELETE de una definición con asignaciones socio_aportes (409) y la conserva` | ✅ COMPLIANT |
| DELETE Guard — 409 | Delete with generated records is rejected (409 + retained) | `aporte-definicion.test.ts > rechaza DELETE de una definición con registros generados (409) y la conserva` | ✅ COMPLIANT |
| DELETE Guard — 409 | Delete a definition referenced only by an inactive status succeeds | `aporte-definicion.test.ts > elimina una definición inactiva sin uso (200)` | ✅ COMPLIANT |
| Group Application (Dynamic) | Applies to current members at resolution time (no materialization) | `socios-aportes.test.ts > hereda del grupo primario` + `hereda de un grupo adicional (secundario)` + `un miembro FUTURO hereda automáticamente sin materializar socio_aportes ni registros` | ✅ COMPLIANT |
| Group Application (Dynamic) | Applies to future members automatically | `socios-aportes.test.ts > un miembro FUTURO hereda automáticamente sin materializar socio_aportes ni registros` | ✅ COMPLIANT |
| Group Application (Dynamic) | Removing a member stops the group application | `socios-aportes.test.ts > quitar al socio del grupo deja de heredar salvo que tenga asignación directa` | ✅ COMPLIANT |
| Seed of Default Definitions | Fresh seed contains the default definition | `aporte-definicion.test.ts > lista el catálogo completo...` (aserta ap-mensual "Cuota Social Mensual" monto 50 recurrencia mensual) + `helpers.ts` limpiarDatos reseed 4 defs | ✅ COMPLIANT |

**Frontend Spec (evidencia estática — no hay UI/E2E tests, smoke manual por estrategia de testing)**: CRUD en tab "Crear" de `aportes.tsx` (add/update/removeAporte) y `config.tsx` con 0 referencias a aporte CRUD; mensaje 409 amigable surfaced (`aportes.tsx:handleRemoveDefinicion` catch status 409); rows muestran nombre/monto/recurrencia/vigencia/badge activo + grupo (`aportes.tsx`); multiselect usa `selectAportesActivos` (`socios.tsx:79,217`); ~360px solo inspección estática.

### Spec `payments` (22/22)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Single Aporte — Definition-Driven | Single mensual uses the definition's monto and window count | `aportes-generacion.test.ts > mensual usa el monto de la definición y cuenta los meses de la ventana (3 registros)` | ✅ COMPLIANT |
| Single Aporte — Definition-Driven | Single anual creates exactly 12 records | `aportes-generacion.test.ts > anual crea exactamente 12 registros mes 1..12 con monto y tipo de la definición` | ✅ COMPLIANT |
| Single Aporte — Definition-Driven | Single unico creates one record | `aportes-generacion.test.ts > unico crea exactamente 1 registro` | ✅ COMPLIANT |
| Single Aporte — Definition-Driven | Single extraordinario creates one record | `aportes-generacion.test.ts > extraordinario crea exactamente 1 registro` | ✅ COMPLIANT |
| Single Aporte — Definition-Driven | A socio inheriting the definition via group generates records | `aportes-generacion.test.ts > un socio que hereda la definición por grupo genera registros` | ✅ COMPLIANT |
| Single Aporte — Definition-Driven | A `monto` in the body is rejected (no override) | `aportes-generacion.test.ts > rechaza monto en el body (no hay override) con 400 y no crea registros` | ✅ COMPLIANT |
| Single Aporte — Definition-Driven | Inactive definition is rejected | `aportes-generacion.test.ts > rechaza una definición inactiva con 400` | ✅ COMPLIANT |
| Single Aporte — Definition-Driven | Definition outside its vigencia window generates no records | `aportes-generacion.test.ts > definición fuera de su ventana de vigencia genera {count: 0}` | ✅ COMPLIANT |
| Single Aporte — Definition-Driven | Socio not assigned and not inheriting the definition is rejected | `aportes-generacion.test.ts > rechaza un socio que no sostiene la definición con 400` | ✅ COMPLIANT |
| Bulk Aportes — Definition-Driven | Bulk mensual uses each definition's monto | `aportes-bulk-all-pagos.test.ts > bulk mensual usa el monto de la definición y genera 2 registros por socio` | ✅ COMPLIANT |
| Bulk Aportes — Definition-Driven | Bulk anual creates 12 records per socio | `aportes-bulk-all-pagos.test.ts > bulk anual crea 12 registros por socio (mes 1..12)` | ✅ COMPLIANT |
| Bulk Aportes — Definition-Driven | Bulk with a `monto` or `tipo` field is rejected | `aportes-bulk-all-pagos.test.ts > rechaza monto/tipo en el body (no override) con 400 y no crea registros` | ✅ COMPLIANT |
| Bulk Aportes — Definition-Driven | Bulk excludes socios whose estado does not permit aportes | `aportes-bulk-all-pagos.test.ts > excluye socios cuyo estado no permite aportes` | ✅ COMPLIANT |
| Bulk Aportes — Definition-Driven | Bulk with all socios excluded returns 400 | `aportes-bulk-all-pagos.test.ts > bulk con todos los socios excluidos devuelve 400` | ✅ COMPLIANT |
| Bulk Aportes — Definition-Driven | Bulk with an inactive definition returns 400 | `aportes-bulk-all-pagos.test.ts > bulk con una definición inactiva devuelve 400` | ✅ COMPLIANT |
| Bulk/all — Definition-Driven | Generates only for permitted socios holding the definition | `aportes-bulk-all-pagos.test.ts > genera solo para socios permitidos que sostienen la definición` | ✅ COMPLIANT |
| Bulk/all — Definition-Driven | Bulk/all with no eligible socio returns 400 | `aportes-bulk-all-pagos.test.ts > bulk/all sin socios elegibles devuelve 400` | ✅ COMPLIANT |
| Bulk/all — Definition-Driven | Bulk/all anual creates 12 records per permitted socio | `aportes-bulk-all-pagos.test.ts > bulk/all anual crea 12 registros mes 1..12 por socio permitido` | ✅ COMPLIANT |
| Enforcement por Estado (MODIFIED) | Single create respects the socio estado action (409) | `aportes-generacion.test.ts > rechaza un socio cuyo estado no permite aportes con 409 (enforcement D9)` | ✅ COMPLIANT |
| GET /:id/pagos (Preserved) | Returns the payment history (ingreso, ordered, excludes anulado) | `aportes-bulk-all-pagos.test.ts > devuelve los movimientos ingreso no anulados ordenados por fecha` + `excluye movimientos anulados del historial` | ✅ COMPLIANT |
| GET /:id/pagos (Preserved) | Aporte record with no payments returns an empty array | `aportes-bulk-all-pagos.test.ts > aporte sin pagos devuelve []` | ✅ COMPLIANT |
| GET /:id/pagos (Preserved) | Nonexistent aporte record returns 404 | `aportes-bulk-all-pagos.test.ts > aporte inexistente devuelve 404` | ✅ COMPLIANT |

### Spec `socios-estados` (18/18)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Socio Model — aporteIds Multiselect | POST socio with a multiselect of aportes | `socios-aportes.test.ts > POST con múltiples aporteIds persiste ambas asignaciones respetando el orden` | ✅ COMPLIANT |
| Socio Model — aporteIds Multiselect | POST socio without aporteIds has no direct assignments | `socios-aportes.test.ts > POST sin aporteIds no crea asignaciones directas (aporteIds: [])` | ✅ COMPLIANT |
| Socio Model — aporteIds Multiselect | POST with an unknown aporte id is rejected | `socios-aportes.test.ts > POST con un id de aporte desconocido se rechaza con 400 y no crea el socio` | ✅ COMPLIANT |
| Socio Model — aporteIds Multiselect | POST with an inactive aporte id is rejected | `socios-aportes.test.ts > POST con un aporte inactivo se rechaza con 400` | ✅ COMPLIANT |
| Socio Model — aporteIds Multiselect | POST with a non-array aporteIds is rejected | `socios-aportes.test.ts > POST con aporteIds no-array se rechaza con 400` | ✅ COMPLIANT |
| Socio Model — aporteIds Multiselect | PUT replaces the assignment set atomically | `socios-aportes.test.ts > PUT con aporteIds reemplaza el set atómicamente en la misma transacción` | ✅ COMPLIANT |
| Socio Model — aporteIds Multiselect | PUT without aporteIds preserves existing assignments | `socios-aportes.test.ts > PUT sin aporteIds preserva las asignaciones existentes` | ✅ COMPLIANT |
| Socio Model — aporteIds Multiselect | Full replace of a socio keeps the multiselect intact | `socios-aportes.test.ts > PUT full reemplazo mantiene el multiselect intacto` | ✅ COMPLIANT |
| Group Inheritance — Read-Only (Dynamic) | Inherits from the primary group | `socios-aportes.test.ts > hereda del grupo primario` | ✅ COMPLIANT |
| Group Inheritance — Read-Only (Dynamic) | Inherits from a secondary group | `socios-aportes.test.ts > hereda de un grupo adicional (secundario)` | ✅ COMPLIANT |
| Group Inheritance — Read-Only (Dynamic) | Inherits from both primary and secondary groups | `socios-aportes.test.ts > hereda de primario y secundario a la vez, cada uno con su grupo fuente` | ✅ COMPLIANT |
| Group Inheritance — Read-Only (Dynamic) | A future member inherits automatically without materialization | `socios-aportes.test.ts > un miembro FUTURO hereda automáticamente sin materializar socio_aportes ni registros` | ✅ COMPLIANT |
| Group Inheritance — Read-Only (Dynamic) | Removing a member stops inheritance unless directly assigned | `socios-aportes.test.ts > quitar al socio del grupo deja de heredar salvo que tenga asignación directa` | ✅ COMPLIANT |
| Group Inheritance — Read-Only (Dynamic) | Direct assignment deduplicates the inherited chip | `socios-aportes.test.ts > una asignación directa deduplica el chip heredado` | ✅ COMPLIANT |
| Group Inheritance — Read-Only (Dynamic) | Inherited chips are read-only | `socios-aportes.test.ts > los chips heredados son read-only: PUT sin aporteIds no los altera ni los remueve` | ✅ COMPLIANT |
| Socio Read Shape (MODIFIED) | Socio response no longer exposes tipoAporteId or aporteBase | `socios-aportes.test.ts > la respuesta NO expone tipoAporteId/tipoAporteNombre/aporteBase` | ✅ COMPLIANT |
| Socio Read Shape (MODIFIED) | PUT with a legacy `aporteBase` or `tipoAporteId` has no effect | `socios-aportes.test.ts > PUT con un aporteBase legacy no tiene efecto` | ✅ COMPLIANT |
| Socio Read Shape (MODIFIED) | Migration drops type/base columns after additive step | Evidencia de ejecución real: `drizzle/0005_wise_narwhal.sql` (aditivo → backfill → DROP), `db:generate` sin drift, db real sin `tipo_aporte_id`/`aporte_base`/`tipos_aporte`, 219 registros intactos | ✅ COMPLIANT |

**Compliance summary**: **62/62 escenarios compliant** (60 vía tests pasando + 2 vía evidencia de migración/db real + escenarios UI vía evidencia estática de código)

---

## Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| Definition CRUD — Aportes (schema + router + validaciones + PUT id inmutable) | ✅ Implemented | `schema/aportes-definicion.ts` (id PK, monto real, recurrencia default mensual, modalidad_pago default cuotas, aplica_grupo_id FK, activo default 1); router `/api/aportes-definicion` validaciones exactas del spec (nombre/monto/recurrencia/modalidadPago/ventana/aplicaGrupoId/id duplicado) |
| DELETE Guard — 409 | ✅ Implemented | `aportes-definicion.ts:146-159` guard corre ANTES del delete (definición conservada); mensaje exacto `No se puede eliminar: hay socios o registros usando este aporte` |
| Group Application — dinámico, NO materializado | ✅ Implemented | `socios.ts:aportesInheritedPorSocio` resuelve por `aplicaGrupoId ∈ {primario ∪ adicionales}` con dedup de directas (`inherited.filter(i => !directos.has(i.id))`); cero filas materializadas |
| Seed of Default Definitions | ✅ Implemented | `catalogo.ts:APORTES_DEFINICION_SEED` (4 defs 50/30/25/0) + `0005` INSERT OR IGNORE + `seed.ts` socio_aportes desde monto legacy mapeado |
| Single/Bulk/Bulk-all definition-driven | ✅ Implemented | `aportes.ts`: `rechazarOverride` (400 monto/tipo), `mesesDefinicion` (D3/D8), snapshot `tipo=recurrencia`/`montoBase=monto` + `aporte_id=def.id` |
| Enforcement por estado (no hardcoded activo) | ✅ Implemented | `aportes.ts:226,236,271,280` `cargarPermisosPorEstado()` + `permite(permisos, estadoId, 'aportes')`; single 409 `ERROR_PERMISO`; `Ningún socio puede participar...` 400 |
| GET /:id/pagos preservado | ✅ Implemented | `aportes.ts:308-328` `referenciaId=id`, `tipo='ingreso'`, `anulado=0` (patrón multas) |
| Socio multiselect + shape drop | ✅ Implemented | `socios.ts:validarAporteIds` mensajes exactos; reemplazo atómico; shape `aporteIds` + `aportesInherited`; legacy no escribibles |
| Config derivado (D11) | ✅ Implemented | `config.ts:25-28` `aporteMensualBase = aporteDefActivoDefault().monto ?? legacy` |
| Store + UI | ✅ Implemented | `app.store.ts` aportes/definitions + aporteRegistros/cobros, CRUD en `/aportes-definicion`, `fetchAportesDef` en `fetchConfig`; `config.tsx` 0 referencias CRUD; `aportes.tsx` tabs crear/pagar; `socios.tsx` multiselect + chips heredados; sin labels "Tipos de Aporte"/"Aporte Base" en listas de socios |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 — `aportes_definicion` + core `Aporte` | ✅ Yes | Tabla, schema, core type, endpoint rename |
| D2 — Legacy `tipo`/`monto_base` en registros + `aporte_id` FK | ✅ Yes | `schema/aportes.ts` mantiene ambos + aporte_id nullable; snapshot en generación |
| D3 — Ventana TEXT YYYY-MM-DD, `mesesDefinicion` | ✅ Yes | `lib/aportes.ts:61`; fecha ISO + end-of-month |
| D4 — `modalidadPago` default `cuotas` | ✅ Yes | Schema default + router |
| D5 — Chips heredados read-only dinámicos | ✅ Yes | `socios.ts` + `socios.tsx` chips verdes/read-only con leyenda de grupo |
| D6 — `recurrencia` default `mensual` | ✅ Yes | Schema default + router |
| D7 — Slug client-side, PUT ignora id, duplicado 400 | ✅ Yes | Verificado por test D7 + test id duplicado |
| D7b — Rename `Aporte`(record)→`AporteRegistro`/Cobro; `Aporte` = definición | ✅ Yes | `core/index.ts`, store `aporteRegistros`, UI "cobros" |
| D8 — Counts: anual 12 / mensual ventana∩gestión / unico/extra 1 | ✅ Yes | `mesesParaDefinicion` + tests de count exactos |
| D9 — Enforcement `permite(...,'aportes')`, sin hardcoded | ✅ Yes | `permisos.ts` reuse en single/bulk/bulk-all |
| D10 — DELETE guard 409 | ✅ Yes | Mensaje exacto del spec |
| D11 — Config `aporteMensualBase` derivado; sin CRUD en config | ✅ Yes | `config.ts:25-28`; `config.tsx` 0 matches de CRUD |
| Open Question 1 — DROP dentro de 0005 | ✅ Resuelto | `0005_wise_narwhal.sql` incluye el bloque DROP al final; aplicado sobre db real |
| Open Question 2 — `mes` opcional se mantiene | ✅ Resuelto | `CrearAporteRequest.mes?`, `validarGestionMes` (1..12), UI envía `mes` opcional |

---

## Dead References Check (modelo viejo)

Búsqueda en `src/` de db/core/api/web: `tipos_aporte`, `tipoAporteId`, `tipoAporteNombre`, `aporteBase`, `/api/tipos-aporte`, `TipoAporte`

| Paquete | Hits | Naturaleza |
|---------|------|------------|
| `packages/db/src` | seed.ts `aporteBase` (input de seed), comments | Mapping transicional: `const { aporteBase, ...rest } = s` destruye el campo ANTES del insert (`seed.ts:724`); nunca escribe la columna vieja. Comments históricos en `schema/aportes-definicion.ts:4`, `catalogo.ts:158` |
| `packages/core/src` | 1 comment | `index.ts:30` "era `TipoAporte`" — histórico |
| `packages/api/src` | 2 comments | `socios.ts:9,423` "legacy no escribibles" — explicativo |
| `apps/web/src` | 0 | — |

**Veredicto: 0 referencias muertas en código de producción.** Todos los hits son comments o mapping de seed deliberado que nunca persiste el modelo viejo. `/api/tipos-aporte` NO está montado (`index.ts`); los tests viejos `tipos-aporte.test.ts`/`socios-tipo-aporte.test.ts` fueron renombrados y eliminados.

---

## Issues Found

**CRITICAL** (must fix before archive):
- None

**WARNING** (should fix):
- None

**SUGGESTION** (nice to have):
1. `config.tsx` mantiene el input editable "Aporte Base (Bs)" (`aporteMensualBase`). La API lo deriva en cada GET (`config.ts:25-28`, D11 legacy) → el valor editado se sobrescribe silenciosamente en el próximo fetch. No es desviación (D11 lo preserva), pero considerá mostrarlo read-only/derivado para evitar confusión.
2. Frontend sin E2E/UI tests: los 5 bullets del Frontend Spec (CRUD en tab Crear, 409 amigable, rows con grupo, multiselect activos, ~360px) tienen evidencia estática sólida pero solo smoke manual verificaría render/pixel-perfect. La estrategia de testing del design lo contempla (manual smoke). Recomendado: smoke manual en dev server antes del archive.
3. `catalogo.ts:158-159` comment referencia el nombre viejo `idTipoAportePorMonto` (la función viva es `idAportePorMonto`) — cosmético, solo en comment.
4. `seed.ts` retiene `aporteBase` como campo de input del seed para mapear a definiciones (T1.2 explícito) — es el único lugar donde el concepto legacy es legible; está documentado y destruido antes del insert. Mantener.

---

## Verdict

**PASS**

Implementación completa y verificada: 60/60 tests, 4 typechecks verdes, cero drift de migraciones, 62/62 escenarios de spec con evidencia, cero referencias muertas al modelo viejo, db real migrada correctamente (4 defs, 17 socio_aportes, 219 registros preservados). Lista para `archive` (T7.1 — archivar `ux-avanzado-otb`).
