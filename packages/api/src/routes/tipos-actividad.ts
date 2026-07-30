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

tiposActividad.delete('/:nombre', (c) => {
  const { nombre } = c.req.param();
  const decoded = decodeURIComponent(nombre);

  db.delete(schema.tiposActividad)
    .where(eq(schema.tiposActividad.nombre, decoded))
    .run();

  return c.json(db.select().from(schema.tiposActividad).all());
});

export default tiposActividad;
