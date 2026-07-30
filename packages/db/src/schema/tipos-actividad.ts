import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const tiposActividad = sqliteTable('tipos_actividad', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  opciones: text('opciones').notNull(),
  multas: text('multas'),
  tolerancia: integer('tolerancia').notNull().default(0),
});
