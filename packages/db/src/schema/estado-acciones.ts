import { sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';
import { estadosSocio } from './estados-socio';
import { accionesSocio } from './acciones-socio';

export const estadoAcciones = sqliteTable(
  'estado_acciones',
  {
    estadoId: text('estado_id')
      .notNull()
      .references(() => estadosSocio.id),
    accionId: text('accion_id')
      .notNull()
      .references(() => accionesSocio.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.estadoId, t.accionId] }) }),
);
