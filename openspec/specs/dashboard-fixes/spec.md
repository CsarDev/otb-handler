# Dashboard Fixes — Corrección de Métricas y Datos Sensibles

## Capability

`dashboard-fixes` (bugs)

> **Delta** from `openspec/specs/dashboard-fixes/spec.md`: `totalSocios` and `morosos` are no longer computed from the hardcoded `socios.estado='activo'` string; they MUST count socios whose catalog estado row has `esActivo=1` (the `dashboard` action, resolved through `estadoId` → `estados_socio`). All other dashboard behavior is unchanged.

## Description

El dashboard actual tiene varios bugs: `recaudado` no está filtrado por mes/gestion (toma TODOS los ingresos históricos), mientras que `egresosMes` sí está filtrado por el mes actual, generando un `neto` incorrecto. Además, `multasPendientes` usa COUNT en vez de SUM del monto, y `cumpleañosMes` expone datos personales (fechas de nacimiento) en una respuesta pública. With the states catalog, `totalSocios` and `morosos` MUST derive from the catalog `es_activo` flag instead of the removed `estado='activo'` string, so dashboards remain correct after the enum → `estadoId` migration.

## Endpoints / Components

| Ubicación | Tipo | Descripción |
|-----------|------|-------------|
| `packages/api/src/routes/dashboard.ts` | Modified | Corregir queries de dashboard; `es_activo`-driven counts |
| `apps/web/src/routes/index.tsx` | Modified | Ajustar display de KPIs si cambian tipos |
| `apps/web/src/stores/app.store.ts` | Modified | Actualizar tipo `DashboardData` si cambia |

## Requirements

### Requirement: Recaudado Filtrado por Mes/Gestión

#### Scenario: recaudado usa misma ventana temporal que egresosMes

- GIVEN hoy es 2025-06-15 (gestion=2025, mes=6)
- WHEN se invoca GET /api/dashboard
- THEN `recaudado` SHALL ser SUM de movimientos.monto
- AND solo movimientos con tipo="ingreso" Y fecha entre 2025-06-01 y 2025-06-30
- AND `egresosMes` SHALL ser SUM de egresos.monto en 2025-06-01 a 2025-06-30
- AND AMBAS métricas SHALL usar la MISMA ventana temporal mes/gestion

#### Scenario: neto = recaudadoMes - egresosMes (misma ventana)

- GIVEN recaudadoMes = 1000 y egresosMes = 400 para el mes actual
- WHEN se invoca GET /api/dashboard
- THEN `neto` SHALL ser 600 (1000 - 400)

### Requirement: Multas Pendientes como Monto Total

#### Scenario: multasPendientes es SUM de saldoPendiente, no COUNT

- GIVEN existen 3 multas pendientes: saldoPendiente = 50, 30, 20
- WHEN se invoca GET /api/dashboard
- THEN `multasPendientes` SHALL ser 100 (50+30+20)
- AND NO SHALL ser 3 (COUNT)

#### Scenario: multasPendientes usa saldoPendiente (nuevo campo) no monto original

- GIVEN existe una multa con monto=100, saldoPendiente=70, estado="pendiente"
- WHEN se invoca GET /api/dashboard
- THEN el cálculo SHALL usar saldoPendiente (70), no monto (100)

### Requirement: Remover cumpleañosMes

#### Scenario: Dashboard NO expone cumpleañosMes

- GIVEN hay socios con fechas de nacimiento
- WHEN se invoca GET /api/dashboard
- THEN la respuesta NO SHALL incluir el campo `cumpleañosMes`
- AND la propiedad SHALL ser eliminada del tipo DashboardData

### Requirement: Conteos Impulsados por el Catálogo es_activo (Delta)

#### Scenario: totalSocios cuenta socios cuyo estado tiene esActivo=1

- GIVEN socios s1 (estadoId=activo, esActivo=1), s2 (estadoId=suspendido, esActivo=0), s3 (estadoId=dado_de_baja, esActivo=0)
- WHEN se invoca GET /api/dashboard
- THEN `totalSocios` SHALL ser 1 (solo s1)
- AND el conteo SHALL resolverse vía join a estados_socio.esActivo, no por el string 'activo'

#### Scenario: morosos cuenta solo deudores con estado esActivo=1

- GIVEN s1 (esActivo=1) con aporte pendiente, s4 (esActivo=0) con aporte pendiente
- WHEN se invoca GET /api/dashboard
- THEN `morosos` SHALL ser 1 (solo s1)
- AND s4 SHALL quedar excluido del conteo

#### Scenario: Conteos permanecen idénticos tras la migración a catálogo

- GIVEN una DB migrada donde 'activo' → estado con esActivo=1
- WHEN se compara el dashboard antes y después de la migración
- THEN `totalSocios` y `morosos` SHALL arrojar los mismos valores que con el enum original

### Requirement: Dashboard Response Shape

#### Scenario: Respuesta de dashboard tiene la forma correcta

- GIVEN el endpoint /api/dashboard
- WHEN se invoca GET
- THEN la respuesta SHALL ser un JSON con:
  - "totalSocios": number,        // es_activo-driven
  - "recaudado": number,          // filtrado por mes actual
  - "morosos": number,            // es_activo-driven
  - "multasPendientes": number,   // SUM de saldoPendiente, no COUNT
  - "egresosMes": number,
  - "neto": number                // recaudado - egresosMes (misma ventana)
- AND NO SHALL incluir "cumpleañosMes"

## Validation

| Métrica | Regla |
|---------|-------|
| `recaudado` | MUST ser SUM de movimientos.monto WHERE tipo='ingreso' AND fecha en [inicioMes, finMes] |
| `egresosMes` | MUST ser SUM de egresos.monto WHERE fecha en [inicioMes, finMes] |
| `neto` | MUST ser recaudado - egresosMes |
| `multasPendientes` | MUST ser SUM de multas.saldoPendiente WHERE estado='pendiente' (no COUNT) |
| `totalSocios` | MUST ser COUNT de socios WHERE estadoId referencia un estado con esActivo=1 (reemplaza estado='activo') |
| `morosos` | MUST ser COUNT DISTINCT de aportes.socioId WHERE estado='pendiente' JOIN socios cuyo estado tiene esActivo=1 |
| `cumpleañosMes` | MUST ser eliminado de la respuesta |

## Core Type Changes

```diff
// apps/web/src/stores/app.store.ts

type DashboardData = {
  totalSocios: number;
  recaudado: number;
  morosos: number;
  multasPendientes: number;
  egresosMes: number;
  neto: number;
- cumpleañosMes: Socio[];  // ← ELIMINADO
};
```

## Frontend

No hay cambios visuales mayores en el frontend — los KPIs ya se muestran correctamente. Sin embargo:

- `multasPendientes` ahora se muestra correctamente como monto en Bs (el frontend ya trata `multasPendientes` como moneda con prefijo "Bs ")
- El resto de los indicadores se mantienen igual

## Error States

| HTTP | Condición |
|------|-----------|
| 200 | Dashboard con métricas calculadas |
| 500 | Error en alguna query agregada |
