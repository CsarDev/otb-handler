import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { actividades } from './actividades';
import { socios } from './socios';

export const asistencia = sqliteTable('asistencia', {
  id: text('id').primaryKey(),
  actividadId: text('actividad_id').notNull().references(() => actividades.id),
  socioId: text('socio_id').notNull().references(() => socios.id),
  tipoAsistencia: text('tipo_asistencia', { enum: ['asistio', 'falta', 'tardanza', 'justificado'] }).notNull(),
  minutosTardanza: integer('minutos_tardanza').notNull().default(0),
  fechaReg: text('fecha_reg').notNull(),
});
