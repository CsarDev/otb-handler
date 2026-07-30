import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { socios } from './socios';

export const aportes = sqliteTable('aportes', {
  id: text('id').primaryKey(),
  socioId: text('socio_id').notNull().references(() => socios.id),
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
