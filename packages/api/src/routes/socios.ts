import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq, like, or } from 'drizzle-orm';

const socios = new Hono();

socios.get('/', (c) => {
  const search = c.req.query('search');

  if (search) {
    return c.json(
      db
        .select()
        .from(schema.socios)
        .where(
          or(
            like(schema.socios.nombre, `%${search}%`),
            like(schema.socios.apellidoPaterno, `%${search}%`),
          ),
        )
        .all(),
    );
  }

  return c.json(db.select().from(schema.socios).all());
});

socios.get('/:id', (c) => {
  const { id } = c.req.param();
  const socio = db
    .select()
    .from(schema.socios)
    .where(eq(schema.socios.id, id))
    .get();

  return socio ? c.json(socio) : c.json({ error: 'Not found' }, 404);
});

socios.post('/', async (c) => {
  const body = await c.req.json();

  if (!body.nombre || !body.apellidoPaterno) {
    return c.json({ error: 'nombre and apellidoPaterno are required' }, 400);
  }

  const result = db
    .insert(schema.socios)
    .values({ id: crypto.randomUUID(), ...body })
    .returning()
    .get();

  return c.json(result, 201);
});

socios.put('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  delete body.id;

  const result = db
    .update(schema.socios)
    .set(body)
    .where(eq(schema.socios.id, id))
    .returning()
    .get();

  return result ? c.json(result) : c.json({ error: 'Not found' }, 404);
});

socios.delete('/:id', (c) => {
  const { id } = c.req.param();
  const existing = db
    .select()
    .from(schema.socios)
    .where(eq(schema.socios.id, id))
    .get();

  if (!existing) return c.json({ error: 'Not found' }, 404);

  db.update(schema.socios)
    .set({ estado: 'inactivo' })
    .where(eq(schema.socios.id, id))
    .run();

  return c.body(null, 204);
});

export default socios;
