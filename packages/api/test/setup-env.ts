// Configuración de entorno para la suite de @otb/api.
//
// ESTE ARCHIVO DEBE CORRER ANTES de que cualquier módulo importe @otb/db: el
// singleton abre la BD desde process.env.DB_URL en el momento del import, y los
// test files importan @otb/auth estáticamente (que a su vez importa @otb/db de
// forma eager). Sin este setup, la suite abriría el ARCHIVO packages/db/otb.db
// en lugar de una BD en memoria — corrompiendo la BD real y compartiendo estado
// entre archivos (FK/locks/counts erróneos en la corrida completa).
process.env.DB_URL = ':memory:';