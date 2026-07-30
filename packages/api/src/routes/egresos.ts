import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq, and, gte, lte } from 'drizzle-orm';

const egresos = new Hono();

egresos.get('/', (c) => {
  const { categoria, fechaDesde, fechaHasta } = c.req.query();
  const filters: any[] = [];

  if (categoria) filters.push(eq(schema.egresos.categoria, categoria));
  if (fechaDesde) filters.push(gte(schema.egresos.fecha, fechaDesde));
  if (fechaHasta) filters.push(lte(schema.egresos.fecha, fechaHasta));

  return c.json(
    filters.length
      ? db.select().from(schema.egresos).where(and(...filters)).all()
      : db.select().from(schema.egresos).all(),
  );
});

egresos.post('/', async (c) => {
  const body = await c.req.json();

  if (!body.categoria || !body.beneficiario || !body.monto || !body.fecha) {
    return c.json(
      { error: 'categoria, beneficiario, monto, and fecha are required' },
      400,
    );
  }

  if (body.monto <= 0) {
    return c.json({ error: 'monto must be greater than 0' }, 400);
  }

  const id = crypto.randomUUID();

  db.insert(schema.egresos)
    .values({ id, ...body })
    .run();

  db.insert(schema.movimientos)
    .values({
      id: crypto.randomUUID(),
      tipo: 'egreso',
      referenciaId: id,
      monto: body.monto,
      numeroRecibo: body.numRecibo,
      nota: `Egreso: ${body.categoria}${body.descripcion ? ` - ${body.descripcion}` : ''}`,
      fecha: body.fecha,
    })
    .run();

  const created = db
    .select()
    .from(schema.egresos)
    .where(eq(schema.egresos.id, id))
    .get();

  return c.json(created, 201);
});

egresos.put('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  delete body.id;

  const existing = db
    .select()
    .from(schema.egresos)
    .where(eq(schema.egresos.id, id))
    .get();

  if (!existing) return c.json({ error: 'Not found' }, 404);

  const result = db
    .update(schema.egresos)
    .set(body)
    .where(eq(schema.egresos.id, id))
    .returning()
    .get();

  return c.json(result);
});

egresos.delete('/:id', (c) => {
  const { id } = c.req.param();
  const existing = db
    .select()
    .from(schema.egresos)
    .where(eq(schema.egresos.id, id))
    .get();

  if (!existing) return c.json({ error: 'Not found' }, 404);

  db.delete(schema.egresos).where(eq(schema.egresos.id, id)).run();
  return c.body(null, 204);
});

export default egresos;
