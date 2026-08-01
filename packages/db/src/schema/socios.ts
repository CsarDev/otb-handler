import { sqliteTable, text, real } from 'drizzle-orm/sqlite-core';
import { estadosSocio } from './estados-socio';
import { grupos } from './grupos';

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
  // TODO(fase 0004): eliminar `estado` tras el backfill por nombre y el DROP COLUMN final
  estado: text('estado', { enum: ['activo', 'inactivo', 'suspendido'] })
    .notNull()
    .default('activo'),
  // Nullables durante la transición: la API garantiza estadoId en POST/PUT
  estadoId: text('estado_id').references(() => estadosSocio.id),
  grupoPrimarioId: text('grupo_primario_id').references(() => grupos.id),
  motivoBaja: text('motivo_baja'),
  fechaBaja: text('fecha_baja'),
});
