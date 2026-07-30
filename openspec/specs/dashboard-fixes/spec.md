# Dashboard Fixes — Corrección de Métricas y Datos Sensibles

## Capability

`dashboard-fixes` (bugs)

## Description

El dashboard actual tiene varios bugs: `recaudado` no está filtrado por mes/gestion (toma TODOS los ingresos históricos), mientras que `egresosMes` sí está filtrado por el mes actual, generando un `neto` incorrecto. Además, `multasPendientes` usa COUNT en vez de SUM del monto, y `cumpleañosMes` expone datos personales (fechas de nacimiento) en una respuesta pública.

## Endpoints / Components

| Ubicación | Tipo | Descripción |
|-----------|------|-------------|
| `packages/api/src/routes/dashboard.ts` | Modified | Corregir queries de dashboard |
| `apps/web/src/routes/index.tsx` | Modified | Ajustar display de KPIs si cambian tipos |
| `apps/web/src/stores/app.store.ts` | Modified | Actualizar tipo `DashboardData` si cambia |

## Scenarios

### Recaudado Filtrado por Mes/Gestión

```
Scenario: recaudado usa misma ventana temporal que egresosMes
  Given hoy es 2025-06-15 (gestion=2025, mes=6)
  When se invoca GET /api/dashboard
  Then `recaudado` SHALL ser SUM de movimientos.monto
    AND solo movimientos con tipo="ingreso" Y fecha entre 2025-06-01 y 2025-06-30
    And `egresosMes` SHALL ser SUM de egresos.monto en 2025-06-01 a 2025-06-30
    And AMBAS métricas SHALL usar la MISMA ventana temporal mes/gestion
```

```
Scenario: neto = recaudadoMes - egresosMes (misma ventana)
  Given recaudadoMes = 1000 y egresosMes = 400 para el mes actual
  When se invoca GET /api/dashboard
  Then `neto` SHALL ser 600 (1000 - 400)
```

### Multas Pendientes como Monto Total

```
Scenario: multasPendientes es SUM de saldoPendiente, no COUNT
  Given existen 3 multas pendientes: saldoPendiente = 50, 30, 20
  When se invoca GET /api/dashboard
  Then `multasPendientes` SHALL ser 100 (50+30+20)
    And NO SHALL ser 3 (COUNT)
```

```
Scenario: multasPendientes usa saldoPendiente (nuevo campo) no monto original
  Given existe una multa con monto=100, saldoPendiente=70, estado="pendiente"
  When se invoca GET /api/dashboard
  Then el cálculo SHALL usar saldoPendiente (70), no monto (100)
```

### Remover cumpleañosMes

```
Scenario: Dashboard NO expone cumpleañosMes
  Given hay socios con fechas de nacimiento
  When se invoca GET /api/dashboard
  Then la respuesta NO SHALL incluir el campo `cumpleañosMes`
    And la propiedad SHALL ser eliminada del tipo DashboardData
```

### Dashboard Response Shape

```
Scenario: Respuesta de dashboard tiene la forma correcta
  Given el endpoint /api/dashboard
  When se invoca GET
  Then la respuesta SHALL ser un JSON con:
    {
      "totalSocios": number,
      "recaudado": number,           // filtrado por mes actual
      "morosos": number,
      "multasPendientes": number,    // SUM de saldoPendiente, no COUNT
      "egresosMes": number,
      "neto": number                 // recaudado - egresosMes (misma ventana)
    }
    And NO SHALL incluir "cumpleañosMes"
```

## Validation

| Métrica | Regla |
|---------|-------|
| `recaudado` | MUST ser SUM de movimientos.monto WHERE tipo='ingreso' AND fecha en [inicioMes, finMes] |
| `egresosMes` | MUST ser SUM de egresos.monto WHERE fecha en [inicioMes, finMes] |
| `neto` | MUST ser recaudado - egresosMes |
| `multasPendientes` | MUST ser SUM de multas.saldoPendiente WHERE estado='pendiente' (no COUNT) |
| `totalSocios` | MUST ser COUNT de socios WHERE estado='activo' |
| `morosos` | MUST ser COUNT DISTINCT de aportes.socioId WHERE estado='pendiente' JOIN socios activos |
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
