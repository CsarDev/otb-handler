import { sqliteTable, text, real } from 'drizzle-orm/sqlite-core';

export const socios = sqliteTable('socios', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  apellidoPaterno: text('apellido_paterno').notNull(),
  apellidoMaterno: text('apellido_materno'),
  ci: text('ci'),
  telefono: text('telefono'),
  email: text('email'),
  ocupacion: text('ocupacion'),
  direccion: text('direccion'),
  fechaNac: text('fecha_nac'),
  fechaIng: text('fecha_ing'),
  fechaAlta: text('fecha_alta'),
  aporteBase: real('aporte_base').notNull().default(0),
  estado: text('estado', { enum: ['activo', 'inactivo', 'suspendido'] }).notNull().default('activo'),
});
