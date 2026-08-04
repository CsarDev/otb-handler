import { sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';
import { socios } from './socios';
import { aportesDefinicion } from './aportes-definicion';

// Asignación many-to-many socio ↔ definición de aporte (mismo patrón que
// `socio_grupos`). La fuente de aplicabilidad de una definición puede ser un
// row directo aquí O su `aplica_grupo_id` (resuelto dinámicamente en lectura
// y generación).
export const socioAportes = sqliteTable(
  'socio_aportes',
  {
    socioId: text('socio_id')
      .notNull()
      .references(() => socios.id),
    aporteId: text('aporte_id')
      .notNull()
      .references(() => aportesDefinicion.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.socioId, t.aporteId] }) }),
);