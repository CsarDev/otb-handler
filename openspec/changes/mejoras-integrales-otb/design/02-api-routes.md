# Design: API Routes Changes

## Pattern

Follow existing codebase convention: **route-direct** (no service layer). Each route handler calls Drizzle ORM directly. Transactions use `db.transaction((tx) => { ... })` for multi-table operations.

## Reports (NEW) — `packages/api/src/routes/reportes.ts`

Three aggregated-read endpoints. No writes.

### GET /api/reportes/balance
```
Query:  gestion (int, required), mes (int, required)
Query:  db.select({ categoria, total: sum(monto) })
          .from(movimientos)
          .where(tipo='ingreso' | 'egreso', fecha BETWEEN ...)
          .groupBy(categoria)
Response: { totalIngresos, totalEgresos, neto, desglose: [{ categoria, monto }] }
```

### GET /api/reportes/libro-diario
```
Query:  db.select({ ...movimientos, socioNombre, socioApellido })
          .from(movimientos)
          .leftJoin(socios, eq(movimientos.socioId, socios.id))
          .where(fecha BETWEEN fechaDesde AND fechaHasta)
          .orderBy(fecha asc)
Default window: last 30 days
Response: Movimiento[]
```

### GET /api/reportes/resumen-socio/:id
```
Query 1: db.select({ total: sum(montoBase) })
           .from(aportes)
           .where(socioId = :id, estado = 'pagado')
Query 2: db.select({ pagadas: sum(monto) })
           .from(multas)
           .where(socioId = :id, estado = 'pagado')
Query 3: db.select({ pendiente: sum(saldoPendiente) })
           .from(multas)
           .where(socioId = :id, estado = 'pendiente')
Response: { totalAportado, multasPagadas, saldoPendiente, socio: { id, nombre, apellidoPaterno } }
```

### Registration
```ts
// packages/api/src/index.ts
import reportesRouter from './routes/reportes';
api.route('/api/reportes', reportesRouter);
```

## Multas — `packages/api/src/routes/multas.ts`

### GET / (join fix)
Add LEFT JOIN with socios, return `socioNombre` + `socioApellido`.

```ts
db.select({
  ...schema.multas,
  socioNombre: schema.socios.nombre,
  socioApellido: schema.socios.apellidoPaterno,
})
.from(schema.multas)
.leftJoin(schema.socios, eq(schema.multas.socioId, schema.socios.id))
.all()
```

### POST / (insert fix)
When creating, set `saldoPendiente = monto` and `montoPagado = 0`.

### POST /:id/pagar (partial payment + transaction)
```
1. db.transaction((tx) => {
     const multa = tx.select().from(multas).where(eq(id)).get()
     validate state is 'pendiente'
     validate monto <= saldoPendiente
     tx.insert(movimientos).values({ ... })
     tx.update(multas).set({
       saldoPendiente: saldoPendiente - montoPagado,
       montoPagado: montoPagado + montoPagado,
       estado: saldoPendiente - montoPagado === 0 ? 'pagado' : 'pendiente',
       fechaPago, ...
     })
   })
```

### GET /:id/pagos (NEW)
Return all movimientos where `referenciaId = :id AND tipo = 'ingreso'`.

## Aportes — `packages/api/src/routes/aportes.ts`

### GET / (join fix)
Same LEFT JOIN pattern as multas.

### POST /:id/pagar (transaction)
Wrap existing insert-movimiento + update-aporte in `db.transaction()`.

## Actividades — `packages/api/src/routes/actividades.ts`

### GET / (join fix)
LEFT JOIN with tipos_actividad, return `tipoNombre`.

## Egresos — `packages/api/src/routes/egresos.ts`

### PUT /:id (sync movimiento)
Wrap in `db.transaction()`:
1. Update egreso
2. Update corresponding movimiento (WHERE referenciaId = id AND tipo = 'egreso')

### DELETE /:id (sync movimiento)
Wrap in `db.transaction()`:
1. Delete movimiento (WHERE referenciaId = id AND tipo = 'egreso')
2. Delete egreso

Graceful: if no movimiento exists, still delete egreso.

## Tipos Actividad — `packages/api/src/routes/tipos-actividad.ts`

### PUT /:id (NEW)
Partial update: only fields present in body. Parse `opciones`/`multas` as JSON on write.

### DELETE /:nombre → DELETE /:id
Change param from `nombre` to `id`. Add 409 on FK constraint (catch Drizzle `SqliteError` with code `SQLITE_CONSTRAINT_FOREIGNKEY`).

## Dashboard — `packages/api/src/routes/dashboard.ts`

### recaudado filter fix
Add `AND gte(fecha, inicioMes) AND lte(fecha, finMes)` to the ingresos query.

### multasPendientes fix
Change from `COUNT(*)` to `COALESCE(SUM(saldoPendiente), 0)`.

### Remove cumpleañosMes
Delete the entire block.

## Files

| File | Action |
|------|--------|
| `packages/api/src/routes/reportes.ts` | **Create** |
| `packages/api/src/index.ts` | Modify (add reportes route) |
| `packages/api/src/routes/multas.ts` | Modify |
| `packages/api/src/routes/aportes.ts` | Modify |
| `packages/api/src/routes/actividades.ts` | Modify |
| `packages/api/src/routes/egresos.ts` | Modify |
| `packages/api/src/routes/tipos-actividad.ts` | Modify |
| `packages/api/src/routes/dashboard.ts` | Modify |
