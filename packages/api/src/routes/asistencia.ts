import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq } from 'drizzle-orm';

const asistencia = new Hono();

asistencia.get('/actividad/:actividadId', (c) => {
  const { actividadId } = c.req.param();
  const list = db
    .select()
    .from(schema.asistencia)
    .where(eq(schema.asistencia.actividadId, actividadId))
    .all();

  return c.json(list);
});

asistencia.post('/', async (c) => {
  const body = await c.req.json();

  if (!body.actividadId || !Array.isArray(body.registros)) {
    return c.json({ error: 'actividadId and registros array are required' }, 400);
  }

  const fechaReg = body.fechaReg ?? new Date().toISOString().split('T')[0];

  const records = body.registros.map(
    (r: { socioId: string; tipoAsistencia?: string; minutosTardanza?: number }) => ({
      id: crypto.randomUUID(),
      actividadId: body.actividadId,
      socioId: r.socioId,
      tipoAsistencia: r.tipoAsistencia ?? 'asistio',
      minutosTardanza: r.minutosTardanza ?? 0,
      fechaReg,
    }),
  );

  db.insert(schema.asistencia).values(records).run();

  return c.json(records, 201);
});

asistencia.put('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  delete body.id;

  const existing = db
    .select()
    .from(schema.asistencia)
    .where(eq(schema.asistencia.id, id))
    .get();

  if (!existing) return c.json({ error: 'Not found' }, 404);

  const result = db
    .update(schema.asistencia)
    .set(body)
    .where(eq(schema.asistencia.id, id))
    .returning()
    .get();

  return c.json(result);
});

export default asistencia;
