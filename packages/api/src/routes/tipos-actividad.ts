import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq } from 'drizzle-orm';

const tiposActividad = new Hono();

tiposActividad.get('/', (c) => {
  return c.json(db.select().from(schema.tiposActividad).all());
});

tiposActividad.post('/', async (c) => {
  const body = await c.req.json();

  if (!body.nombre) {
    return c.json({ error: 'nombre is required' }, 400);
  }

  db.insert(schema.tiposActividad)
    .values({
      id: crypto.randomUUID(),
      nombre: body.nombre,
      opciones: JSON.stringify(body.opciones ?? ['asistio', 'falta', 'tardanza', 'justificado']),
      multas: body.multas ? JSON.stringify(body.multas) : null,
      tolerancia: body.tolerancia ?? 0,
    })
    .run();

  return c.json(db.select().from(schema.tiposActividad).all(), 201);
});

tiposActividad.put('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = db
    .select({ id: schema.tiposActividad.id })
    .from(schema.tiposActividad)
    .where(eq(schema.tiposActividad.id, id))
    .get();

  if (!existing) return c.json({ error: 'Tipo de actividad no encontrado' }, 404);

  db.update(schema.tiposActividad)
    .set({
      ...(body.nombre !== undefined && { nombre: body.nombre }),
      ...(body.opciones !== undefined && { opciones: JSON.stringify(body.opciones) }),
      ...(body.multas !== undefined && { multas: JSON.stringify(body.multas) }),
      ...(body.tolerancia !== undefined && { tolerancia: body.tolerancia }),
    })
    .where(eq(schema.tiposActividad.id, id))
    .run();

  return c.json(db.select().from(schema.tiposActividad).all());
});

tiposActividad.delete('/:id', (c) => {
  const { id } = c.req.param();

  const existing = db
    .select({ id: schema.tiposActividad.id })
    .from(schema.tiposActividad)
    .where(eq(schema.tiposActividad.id, id))
    .get();

  if (!existing) return c.json({ error: 'Tipo de actividad no encontrado' }, 404);

  const usedInActividades = db
    .select({ id: schema.actividades.id })
    .from(schema.actividades)
    .where(eq(schema.actividades.tipoId, id))
    .get();

  if (usedInActividades) {
    return c.json({ error: 'No se puede eliminar: hay actividades usando este tipo' }, 409);
  }

  db.delete(schema.tiposActividad)
    .where(eq(schema.tiposActividad.id, id))
    .run();

  return c.json(db.select().from(schema.tiposActividad).all());
});

export default tiposActividad;
