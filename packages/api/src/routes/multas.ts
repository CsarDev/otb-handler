import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq, and, getTableColumns } from 'drizzle-orm';

const multas = new Hono();

multas.get('/', (c) => {
  const { socioId, estado } = c.req.query();
  const filters: any[] = [];

  if (socioId) filters.push(eq(schema.multas.socioId, socioId));
  if (estado) filters.push(eq(schema.multas.estado, estado as 'pendiente' | 'pagado' | 'anulado'));

  const query = db
    .select({
      ...getTableColumns(schema.multas),
      socioNombre: schema.socios.nombre,
      socioApellido: schema.socios.apellidoPaterno,
    })
    .from(schema.multas)
    .leftJoin(schema.socios, eq(schema.multas.socioId, schema.socios.id));

  return c.json(
    filters.length ? query.where(and(...filters)).all() : query.all(),
  );
});

multas.post('/', async (c) => {
  const body = await c.req.json();

  if (!body.socioId || !body.concepto || !body.monto) {
    return c.json({ error: 'socioId, concepto, and monto are required' }, 400);
  }

  const result = db
    .insert(schema.multas)
    .values({
      id: crypto.randomUUID(),
      fechaGen: new Date().toISOString().split('T')[0],
      ...body,
    })
    .returning()
    .get();

  return c.json(result, 201);
});

multas.post('/:id/pagar', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  const multa = db
    .select()
    .from(schema.multas)
    .where(eq(schema.multas.id, id))
    .get();

  if (!multa) return c.json({ error: 'Multa not found' }, 404);
  if (multa.estado === 'pagado') return c.json({ error: 'Multa already paid' }, 400);

  const montoPagado = body.monto ?? multa.monto;
  const fechaPago = body.fechaPago ?? new Date().toISOString().split('T')[0];
  const numeroRecibo = body.numeroRecibo;

  db.insert(schema.movimientos)
    .values({
      id: crypto.randomUUID(),
      tipo: 'ingreso',
      referenciaId: id,
      socioId: multa.socioId,
      monto: montoPagado,
      numeroRecibo,
      nota: `Pago de multa: ${multa.concepto}`,
      fecha: fechaPago,
    })
    .run();

  const updated = db
    .update(schema.multas)
    .set({ estado: 'pagado', fechaPago })
    .where(eq(schema.multas.id, id))
    .returning()
    .get();

  return c.json(updated);
});

multas.put('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  delete body.id;

  const result = db
    .update(schema.multas)
    .set(body)
    .where(eq(schema.multas.id, id))
    .returning()
    .get();

  return result ? c.json(result) : c.json({ error: 'Not found' }, 404);
});

multas.delete('/:id', (c) => {
  const { id } = c.req.param();
  const existing = db
    .select()
    .from(schema.multas)
    .where(eq(schema.multas.id, id))
    .get();

  if (!existing) return c.json({ error: 'Not found' }, 404);

  db.update(schema.multas)
    .set({ estado: 'anulado' })
    .where(eq(schema.multas.id, id))
    .run();

  return c.body(null, 204);
});

export default multas;
