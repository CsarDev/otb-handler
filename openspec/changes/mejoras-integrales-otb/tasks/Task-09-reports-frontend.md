# Task-09: Reports Frontend — UI de Reportes con Tabs, KPIs y Filtros

## Description

Reemplazar el placeholder actual de `apps/web/src/routes/reportes.tsx` con un componente completo de tres tabs navegables. Los datos se obtienen desde las acciones del store (Task-08) y se almacenan en estado local del componente (no en Zustand, ya que son datos efímeros de consulta).

### Tab 1: Balance
- Selectores de mes (1-12) y gestión (input numérico)
- KPIs: totalIngresos, totalEgresos, neto (con color verde si positivo, rojo si negativo)
- Tabla de desglose: categoría | monto

### Tab 2: Libro Diario
- Filtros de fecha: fechaDesde (date) y fechaHasta (date), botón "Buscar"
- Tabla: Fecha, Tipo, Socio (nombre), Concepto (nota), Monto, Recibo
- Ordenado por fecha ascendente

### Tab 3: Resumen por Socio
- Selector de socio (dropdown con búsqueda, carga desde store socios)
- KPIs: totalAportado, multasPagadas, saldoPendiente
- Datos del socio: nombre, apellidoPaterno

## Files

- `apps/web/src/routes/reportes.tsx` — rewrite completo (placeholer → full component)
- `apps/web/src/stores/app.store.ts` — ya cubierto en Task-08 (solo verificar import de tipos)

## Dependencies

- Task-08 (API endpoints y store actions existen)
- Task-02 (tipos de reporte importados de @otb/core)

## Acceptance Criteria

- [ ] Tres tabs navegables: Balance, Libro Diario, Resumen Socio
- [ ] Tab Balance: campos mes/gestion, botón consultar, KPIs y tabla de desglose
- [ ] KPI Neto muestra color verde si positivo, rojo si negativo (usando las props `positive`/`negative` del patrón existente en DashboardPage)
- [ ] Tab Libro Diario: filtros de fecha, tabla con Fecha/Tipo/Socio/Concepto/Monto/Recibo
- [ ] Tab Resumen Socio: selector de socio carga de `socios` del store, KPIs por socio
- [ ] Estados: loading (spinner/texto), error (mensaje rojo), empty (mensaje descriptivo)
- [ ] Datos almacenados en estado local (useState), no en Zustand (datos efímeros)
- [ ] Tipo `DashboardData` de reportes no se mezcla con el del dashboard principal
- [ ] `pnpm typecheck` pasa sin errores

## Estimated Lines

200
