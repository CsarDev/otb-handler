import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const accionesSocio = sqliteTable('acciones_socio', {
  id: text('id').primaryKey(),
  clave: text('clave').notNull().unique(), // slug estable: 'asistencia', 'pagos'...
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
  orden: integer('orden').notNull().default(0),
});
