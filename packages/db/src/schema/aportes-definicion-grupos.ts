import { sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';
import { aportesDefinicion } from './aportes-definicion';
import { grupos } from './grupos';

// Aplicación M:N definición ↔ grupo (D23). Reemplaza la FK singular
// `aportes_definicion.aplica_grupo_id`; mismo patrón que `socio_grupos`.
export const aportesDefinicionGrupos = sqliteTable(
  'aportes_definicion_grupos',
  {
    definitionId: text('definition_id')
      .notNull()
      .references(() => aportesDefinicion.id),
    grupoId: text('grupo_id')
      .notNull()
      .references(() => grupos.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.definitionId, t.grupoId] }) }),
);
