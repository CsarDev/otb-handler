import { sqliteTable, text, real } from 'drizzle-orm/sqlite-core';
import { socios } from './socios';

export const movimientos = sqliteTable('movimientos', {
  id: text('id').primaryKey(),
  tipo: text('tipo', { enum: ['ingreso', 'egreso'] }).notNull(),
  referenciaId: text('referencia_id'),
  socioId: text('socio_id').references(() => socios.id),
  monto: real('monto').notNull(),
  numeroRecibo: text('numero_recibo'),
  nota: text('nota'),
  fecha: text('fecha').notNull(),
});
