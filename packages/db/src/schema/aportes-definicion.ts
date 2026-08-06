import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Definición dinámica de aporte (D1). Reemplaza el catálogo `tipos_aporte`: el
// aporte ES la definición con su configuración recurrente. `id` es un slug
// estable provisto por el cliente (p.ej. 'ap-mensual'), inmutable tras la
// creación (D7). La aplicación a grupos es M:N vía `aportes_definicion_grupos`
// (D23): `grupoIds: []` = global (resuelta en lectura/generación, NO materializada).
export const aportesDefinicion = sqliteTable('aportes_definicion', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  monto: real('monto').notNull(),
  recurrencia: text('recurrencia').notNull().default('mensual'),
  inicio: text('inicio'),
  fin: text('fin'),
  modalidadPago: text('modalidad_pago').notNull().default('cuotas'),
  activo: integer('activo').notNull().default(1),
});