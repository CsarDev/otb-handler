import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const estadosSocio = sqliteTable('estados_socio', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  color: text('color').notNull().default('#22c55e'), // hex usado en badges/filtros
  esActivo: integer('es_activo').notNull().default(0), // 0|1
  esBaja: integer('es_baja').notNull().default(0), // 0|1
  esDefecto: integer('es_defecto').notNull().default(0), // 0|1
  orden: integer('orden').notNull().default(0),
});
