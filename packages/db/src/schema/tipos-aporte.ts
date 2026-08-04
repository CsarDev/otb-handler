import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Catálogo de tipos de aporte: el monto mensual de cada socio deriva del
// `montoBase` del tipo asignado (`socios.tipo_aporte_id`).
export const tiposAporte = sqliteTable('tipos_aporte', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  montoBase: real('monto_base').notNull(),
  descripcion: text('descripcion'),
  activo: integer('activo').notNull().default(1),
});
