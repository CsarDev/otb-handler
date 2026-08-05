import { sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';
import { socios } from './socios';
import { grupos } from './grupos';

export const socioGrupos = sqliteTable(
  'socio_grupos',
  {
    socioId: text('socio_id')
      .notNull()
      .references(() => socios.id),
    grupoId: text('grupo_id')
      .notNull()
      .references(() => grupos.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.socioId, t.grupoId] }) }),
);
