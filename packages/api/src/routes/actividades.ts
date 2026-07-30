import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq, getTableColumns } from 'drizzle-orm';

const actividades = new Hono();

actividades.get('/', (c) => {
  return c.json(
    db
      .select({
        ...getTableColumns(schema.actividades),
        tipoNombre: schema.tiposActividad.nombre,
      })
      .from(schema.actividades)
      .leftJoin(schema.tiposActividad, eq(schema.actividades.tipoId, schema.tiposActividad.id))
      .all(),
  );
});

actividades.post('/', async (c) => {
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

actividades.put('/:id', async (c) => {
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

actividades.delete('/:id', (c) => {
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
