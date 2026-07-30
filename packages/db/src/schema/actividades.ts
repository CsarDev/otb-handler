import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { tiposActividad } from './tipos-actividad';

export const actividades = sqliteTable('actividades', {
  id: text('id').primaryKey(),
  tipoId: text('tipo_id').notNull().references(() => tiposActividad.id),
  fecha: text('fecha').notNull(),
  hora: text('hora'),
  descripcion: text('descripcion'),
});
