# Design: Core Types — `packages/core/src/index.ts`

## Changes

```diff
export type Multa = {
  id: string;
  socioId: string;
+ socioNombre: string | null;
+ socioApellido: string | null;
  actividadId: string | null;
  concepto: string;
  monto: number;
+ saldoPendiente: number;
+ montoPagado: number;
  fechaGen: string;
  fechaPago: string | null;
  estado: 'pendiente' | 'pagado' | 'anulado';
};

export type Actividad = {
  id: string;
  tipoId: string;
+ tipoNombre: string | null;
  fecha: string;
  hora: string | null;
  descripcion: string | null;
};

export type Aporte = {
  id: string;
  socioId: string;
+ socioNombre: string | null;
+ socioApellido: string | null;
  mes: number | null;
  gestion: number | null;
  tipo: 'mensual' | 'extraordinario';
  montoBase: number;
  numeroRecibo: string | null;
  fechaPago: string | null;
  estado: 'pendiente' | 'pagado' | 'anulado';
};

// NEW — for report endpoints
export type BalanceReport = {
  totalIngresos: number;
  totalEgresos: number;
  neto: number;
  desglose: Array<{ categoria: string; monto: number }>;
};

export type LibroDiarioEntry = Movimiento & {
  socioNombre: string | null;
  socioApellido: string | null;
};

export type ResumenSocioReport = {
  totalAportado: number;
  multasPagadas: number;
  saldoPendiente: number;
  socio: { id: string; nombre: string; apellidoPaterno: string };
};
```

### Rationale

- `socioNombre`/`socioApellido`/`tipoNombre` are `null` because LEFT JOIN can yield no match (orphaned FKs in existing data).
- Report types are new — they don't correspond to a single table, so they get their own type definitions.
