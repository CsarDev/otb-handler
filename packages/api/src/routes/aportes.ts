import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq, and } from 'drizzle-orm';

const aportes = new Hono();

aportes.get('/', (c) => {
  const { socioId, mes, gestion, estado } = c.req.query();
  const filters: any[] = [];

  if (socioId) filters.push(eq(schema.aportes.socioId, socioId));
  if (mes) filters.push(eq(schema.aportes.mes, Number(mes)));
  if (gestion) filters.push(eq(schema.aportes.gestion, Number(gestion)));
  if (estado) filters.push(eq(schema.aportes.estado, estado as 'pendiente' | 'pagado' | 'anulado'));

  return c.json(
    filters.length
      ? db.select().from(schema.aportes).where(and(...filters)).all()
      : db.select().from(schema.aportes).all(),
  );
});

aportes.get('/socio/:socioId', (c) => {
  const { socioId } = c.req.param();
  const list = db
    .select()
    .from(schema.aportes)
    .where(eq(schema.aportes.socioId, socioId))
    .all();

  return c.json(list);
});

aportes.post('/', async (c) => {
  const body = await c.req.json();

  if (!body.socioId || !body.montoBase) {
    return c.json({ error: 'socioId and montoBase are required' }, 400);
  }

  const result = db
    .insert(schema.aportes)
    .values({ id: crypto.randomUUID(), ...body })
    .returning()
    .get();

  return c.json(result, 201);
});

aportes.post('/:id/pagar', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  const aporte = db
    .select()
    .from(schema.aportes)
    .where(eq(schema.aportes.id, id))
    .get();

  if (!aporte) return c.json({ error: 'Aporte not found' }, 404);
  if (aporte.estado === 'pagado') return c.json({ error: 'Aporte already paid' }, 400);

  const montoPagado = body.monto ?? aporte.montoBase;
  const fechaPago = body.fechaPago ?? new Date().toISOString().split('T')[0];
  const numeroRecibo = body.numeroRecibo;

  db.insert(schema.movimientos)
    .values({
      id: crypto.randomUUID(),
      tipo: 'ingreso',
      referenciaId: id,
      socioId: aporte.socioId,
      monto: montoPagado,
      numeroRecibo,
      nota: `Pago de aporte - ${aporte.tipo}`,
      fecha: fechaPago,
    })
    .run();

  const updated = db
    .update(schema.aportes)
    .set({
      estado: montoPagado >= aporte.montoBase ? 'pagado' : 'pendiente',
      fechaPago,
      numeroRecibo,
    })
    .where(eq(schema.aportes.id, id))
    .returning()
    .get();

  return c.json(updated);
});

aportes.put('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  delete body.id;

  const result = db
    .update(schema.aportes)
    .set(body)
    .where(eq(schema.aportes.id, id))
    .returning()
    .get();

  return result ? c.json(result) : c.json({ error: 'Not found' }, 404);
});

export default aportes;
