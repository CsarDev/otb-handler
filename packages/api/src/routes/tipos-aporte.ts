import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq } from 'drizzle-orm';

const tiposAporte = new Hono();

tiposAporte.get('/', (c) => {
  return c.json(db.select().from(schema.tiposAporte).all());
});

tiposAporte.post('/', async (c) => {
  const body = await c.req.json();

  if (!body.nombre) {
    return c.json({ error: 'nombre is required' }, 400);
  }
  if (typeof body.montoBase !== 'number' || body.montoBase < 0) {
    return c.json({ error: 'montoBase is required and must be a non-negative number' }, 400);
  }

  db.insert(schema.tiposAporte)
    .values({
      id: crypto.randomUUID(),
      nombre: body.nombre,
      montoBase: body.montoBase,
      descripcion: body.descripcion ?? null,
      activo: body.activo ?? 1,
    })
    .run();

  return c.json(db.select().from(schema.tiposAporte).all(), 201);
});

tiposAporte.put('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = db
    .select({ id: schema.tiposAporte.id })
    .from(schema.tiposAporte)
    .where(eq(schema.tiposAporte.id, id))
    .get();

  if (!existing) return c.json({ error: 'Tipo de aporte not found' }, 404);

  if (body.nombre !== undefined && !body.nombre) {
    return c.json({ error: 'nombre is required' }, 400);
  }
  if (body.montoBase !== undefined && (typeof body.montoBase !== 'number' || body.montoBase < 0)) {
    return c.json({ error: 'montoBase is required and must be a non-negative number' }, 400);
  }

  db.update(schema.tiposAporte)
    .set({
      ...(body.nombre !== undefined && { nombre: body.nombre }),
      ...(body.montoBase !== undefined && { montoBase: body.montoBase }),
      ...(body.descripcion !== undefined && { descripcion: body.descripcion }),
      ...(body.activo !== undefined && { activo: body.activo }),
    })
    .where(eq(schema.tiposAporte.id, id))
    .run();

  return c.json(db.select().from(schema.tiposAporte).all());
});

tiposAporte.delete('/:id', (c) => {
  const { id } = c.req.param();

  const existing = db
    .select({ id: schema.tiposAporte.id })
    .from(schema.tiposAporte)
    .where(eq(schema.tiposAporte.id, id))
    .get();

  if (!existing) return c.json({ error: 'Tipo de aporte not found' }, 404);

  const usadoPorSocio = db
    .select({ id: schema.socios.id })
    .from(schema.socios)
    .where(eq(schema.socios.tipoAporteId, id))
    .get();

  if (usadoPorSocio) {
    return c.json({ error: 'No se puede eliminar: hay socios usando este tipo' }, 409);
  }

  db.delete(schema.tiposAporte)
    .where(eq(schema.tiposAporte.id, id))
    .run();

  return c.json(db.select().from(schema.tiposAporte).all());
});

export default tiposAporte;