import { sqliteTable, text, real } from 'drizzle-orm/sqlite-core';

export const egresos = sqliteTable('egresos', {
  id: text('id').primaryKey(),
  categoria: text('categoria').notNull(),
  beneficiario: text('beneficiario').notNull(),
  monto: real('monto').notNull(),
  descripcion: text('descripcion'),
  fecha: text('fecha').notNull(),
  numRecibo: text('num_recibo'),
});
