# Design: Zustand Store — `apps/web/src/stores/app.store.ts`

## New State Slices

```ts
type AppState = {
  // ...existing state...

  // Reports
  reportesLoading: boolean;
  reportesError: string | null;
  fetchBalance: (gestion: number, mes: number) => Promise<BalanceReport>;
  fetchLibroDiario: (fechaDesde?: string, fechaHasta?: string) => Promise<LibroDiarioEntry[]>;
  fetchResumenSocio: (socioId: string) => Promise<ResumenSocioReport>;
};
```

## Method Implementations

All three follow the existing pattern: loading/error state, `request<T>()` helper, no local caching (data is transient reports, not a list to cache).

## Changed Actions

| Action | Change |
|--------|--------|
| `addTipoActividad` | Remove `crypto.randomUUID()` from payload body — send only `{ nombre, opciones, multas, tolerancia }` |
| `removeTipoActividad` | Change param from `nombre: string` to `id: string`, update URL to `/tipos-actividad/${id}` |
| `fetchMultas` | Response now includes `socioNombre`/`socioApellido` — stays typed as `Multa[]` (type extends) |
| `fetchAportes` | Same as multas |
| `fetchActividades` | Response now includes `tipoNombre` |
| `pagarMulta` | Response now includes `saldoPendiente`/`montoPagado` |

## DashboardData Type

```diff
 type DashboardData = {
   totalSocios: number;
   recaudado: number;
   morosos: number;
   multasPendientes: number;
   egresosMes: number;
   neto: number;
+  // cumpleañosMes removed — no longer in API response
 };
```

## Files

| File | Action |
|------|--------|
| `apps/web/src/stores/app.store.ts` | Modify |
