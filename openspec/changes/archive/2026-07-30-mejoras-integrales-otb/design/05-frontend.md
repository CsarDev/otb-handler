# Design: Frontend Components

## ReportsPage — `apps/web/src/routes/reportes.tsx`

Replace placeholder with tabbed layout:

```
┌──────────────────────────────────┐
│ [Balance] [Libro Diario] [Socio] │  ← Tabs (state: activeTab)
├──────────────────────────────────┤
│                                  │
│  Tab content per activeTab:      │
│                                  │
│  Balance:                        │
│  ┌──────┬────────┬──────┐       │
│  │Ingr. │ Egreso │ Neto │       │  ← KPI cards
│  │Bs 500│ Bs 200 │Bs 300│       │
│  └──────┴────────┴──────┘       │
│  Desglose table: categoria/monto │
│                                  │
│  Libro Diario:                   │
│  [fechaDesde] [fechaHasta] [⬇]  │  ← filter bar
│  Table: Fecha, Tipo, Socio,      │
│         Concepto, Monto, Recibo  │
│                                  │
│  Resumen Socio:                  │
│  [Select socio ──────────]       │  ← dropdown
│  ┌──────┬────────┬──────┐       │
│  │Aport.│ Multas │ Saldo│       │  ← KPI cards
│  │Bs 300│ Bs 50  │Bs 20 │       │
│  └──────┴────────┴──────┘       │
└──────────────────────────────────┘
```

No local Zustand caching — each tab fetch is ephemeral, stored in local component state.

## MultasPage — `apps/web/src/routes/multas.tsx`

### Table changes
- Replace `{m.socioId}` column with `{m.socioNombre} {m.socioApellido}`
- Header: "Socio" instead of "Socio ID"
- Add column "Saldo Pendiente": `Bs {m.saldoPendiente.toFixed(2)}`

### Payment modal changes
- Show current saldo: `"Saldo pendiente: Bs {multa.saldoPendiente}"`
- Pre-fill monto with `multa.saldoPendiente` (not `multa.monto`)
- If monto < saldoPendiente → multa stays "pendiente" after pay
- If monto >= saldoPendiente → multa becomes "pagado" after pay

### Edit form fix (select)
- `createForm.register('socioId')` already uses `s.id` as value ✅
- No change needed

## AportesPage — `apps/web/src/routes/aportes.tsx`

### Table changes
- Replace `{a.socioId}` column with `{a.socioNombre} {a.socioApellido}`
- Header: "Socio" instead of "Socio ID"

### Create form fix
Replace:
```tsx
<option value="mensual">Mensual</option>
<option value="individual">Individual</option>
<option value="anual">Anual</option>
```
With:
```tsx
<option value="mensual">Mensual</option>
<option value="extraordinario">Extraordinario</option>
```

Default value stays `"mensual"`.

## ActividadesPage — `apps/web/src/routes/actividades.tsx`

### Table changes
- Replace `{a.tipoId}` with `{a.tipoNombre}`
- Column header stays "Tipo"

### Create/Edit form fix
Replace:
```tsx
<option key={t.nombre} value={t.nombre}>{t.nombre}</option>
```
With:
```tsx
<option key={t.id} value={t.id}>{t.nombre}</option>
```

## ConfigPage — `apps/web/src/routes/config.tsx`

### addTipoActividad fix
Remove `id: crypto.randomUUID()` from the payload. The new store action sends only `{ nombre, opciones, multas, tolerancia }`.

### removeTipoActividad fix
Change `handleRemoveTipo(t.nombre)` to `handleRemoveTipo(t.id)`. The store action now uses ID-based DELETE.

### Edit button (NEW)
Add "Editar" button per tipo that opens an edit modal with:
- Name input
- Opciones checkboxes (predefined + custom)
- Multas amount inputs per checkable option
- Tolerancia input

### Opciones/Multas parsing
In edit modal, parse `opciones` and `multas` from JSON string to objects before rendering form fields.

## Dashboard — `apps/web/src/routes/index.tsx`

No visual changes needed — `multasPendientes` was already displayed as currency with "Bs " prefix. The API now returns correct SUM instead of COUNT.

## Files

| File | Action |
|------|--------|
| `apps/web/src/routes/reportes.tsx` | **Rewrite** (placeholder → full component) |
| `apps/web/src/routes/multas.tsx` | Modify |
| `apps/web/src/routes/aportes.tsx` | Modify |
| `apps/web/src/routes/actividades.tsx` | Modify |
| `apps/web/src/routes/config.tsx` | Modify |
| `apps/web/src/routes/index.tsx` | Modify (DashboardData type, no visual) |
