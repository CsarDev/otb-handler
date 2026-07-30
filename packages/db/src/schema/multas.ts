import { sqliteTable, text, real } from 'drizzle-orm/sqlite-core';
import { socios } from './socios';
import { actividades } from './actividades';

export const multas = sqliteTable('multas', {
  id: text('id').primaryKey(),
  socioId: text('socio_id').notNull().references(() => socios.id),
  actividadId: text('actividad_id').references(() => actividades.id),
  concepto: text('concepto').notNull(),
  monto: real('monto').notNull(),
  montoPagado: real('monto_pagado').notNull().default(0),
  saldoPendiente: real('saldo_pendiente').notNull().default(0),
  fechaGen: text('fecha_gen').notNull(),
  fechaPago: text('fecha_pago'),
  estado: text('estado', { enum: ['pendiente', 'pagado', 'anulado'] }).notNull().default('pendiente'),
});
