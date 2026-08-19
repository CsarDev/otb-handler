import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq, getTableColumns, sql, desc } from 'drizzle-orm';
import { parsePaginacion } from '../lib/paginacion';
import { requirePermission, authMiddleware } from '../middleware/auth';

const actividades = new Hono();

actividades.use('*', authMiddleware);

// SELECT compartido por GET / y GET /catalogo (D55): columnas de actividades +
// tipoNombre via LEFT JOIN tipos_actividad (regresión join-fixes R3 — null si
// el tipo no existe).
const selectActividadesConTipo = () =>
  db
    .select({
      ...getTableColumns(schema.actividades),
      tipoNombre: schema.tiposActividad.nombre,
    })
    .from(schema.actividades)
    .leftJoin(schema.tiposActividad, eq(schema.actividades.tipoId, schema.tiposActividad.id));

// Envelope Paginated<Actividad> SIEMPRE (D55): sin filtros server-side → COUNT
// trivial count(*) sobre actividades; ORDER BY desc(fecha), desc(id) = más
// reciente primero, tiebreak PK (orden total — D34).
actividades.get('/', requirePermission('actividades', 'read'), (c) => {
  const { page, pageSize } = parsePaginacion(c.req.query());

  // COUNT espejo: tabla simple, sin joins ni filtros → count(*) de actividades.
  const total = db.select({ n: sql<number>`count(*)` }).from(schema.actividades).get();
  const items = selectActividadesConTipo()
    .orderBy(desc(schema.actividades.fecha), desc(schema.actividades.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  return c.json({ items, total: Number(total?.n ?? 0), page, pageSize });
});

// NUEVO GET /catalogo — array plano completo con tipoNombre, mismo ORDER BY,
// IGNORA page/pageSize (R4). Declarado ANTES de las rutas /:id (D54). Lo
// consumen como catálogo los selectores de multas.tsx/asistencia.tsx.
actividades.get('/catalogo', requirePermission('actividades', 'read'), (c) => {
  return c.json(
    selectActividadesConTipo()
      .orderBy(desc(schema.actividades.fecha), desc(schema.actividades.id))
      .all(),
  );
});

actividades.post('/', requirePermission('actividades', 'create'), async (c) => {
  const body = await c.req.json();

  if (!body.tipoId || !body.fecha) {
    return c.json({ error: 'tipoId and fecha are required' }, 400);
  }

  const result = db
    .insert(schema.actividades)
    .values({ id: crypto.randomUUID(), ...body })
    .returning()
    .get();

  return c.json(result, 201);
});

actividades.put('/:id', requirePermission('actividades', 'update'), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  delete body.id;

  const existing = db
    .select()
    .from(schema.actividades)
    .where(eq(schema.actividades.id, id))
    .get();

  if (!existing) return c.json({ error: 'Not found' }, 404);

  const result = db
    .update(schema.actividades)
    .set(body)
    .where(eq(schema.actividades.id, id))
    .returning()
    .get();

  return c.json(result);
});

actividades.delete('/:id', requirePermission('actividades', 'delete'), (c) => {
  const { id } = c.req.param();
  const existing = db
    .select()
    .from(schema.actividades)
    .where(eq(schema.actividades.id, id))
    .get();

  if (!existing) return c.json({ error: 'Not found' }, 404);

  db.delete(schema.actividades).where(eq(schema.actividades.id, id)).run();
  return c.body(null, 204);
});

export default actividades;
