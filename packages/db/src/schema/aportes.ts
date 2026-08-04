import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { socios } from './socios';
import { aportesDefinicion } from './aportes-definicion';

// Registros de cobro (APORTE_REGISTRO). `tipo` y `monto_base` son snapshots
// de la definición en el momento de la generación (D2): la columna se conserva
// porque reportes/dashboard filtran por `tipo` y leen `monto_base`. `aporte_id`
// agrega la linaje a la definición (nullable; registros legacy quedan NULL).
export const aportes = sqliteTable('aportes', {
  id: text('id').primaryKey(),
  socioId: text('socio_id').notNull().references(() => socios.id),
  aporteId: text('aporte_id').references(() => aportesDefinicion.id),
  mes: integer('mes'),
  gestion: integer('gestion'),
  tipo: text('tipo').notNull().default('mensual'),
  montoBase: real('monto_base').notNull(),
  montoPagado: real('monto_pagado').notNull().default(0),
  saldoPendiente: real('saldo_pendiente').notNull().default(0),
  razonAnulacion: text('razon_anulacion'),
  numeroRecibo: text('numero_recibo'),
  fechaPago: text('fecha_pago'),
  estado: text('estado', { enum: ['pendiente', 'pagado', 'anulado'] }).notNull().default('pendiente'),
});
