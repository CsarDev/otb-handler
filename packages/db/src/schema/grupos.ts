import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const grupos = sqliteTable('grupos', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
});
