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

  const monto = Number(body.monto);
  const result = db
    .insert(schema.multas)
    .values({
      id: crypto.randomUUID(),
      fechaGen: new Date().toISOString().split('T')[0],
      socioId: body.socioId,
      actividadId: body.actividadId ?? null,
      concepto: body.concepto,
      monto,
      saldoPendiente: monto,
      montoPagado: 0,
    })
    .returning()
    .get();

  return c.json(result, 201);
});

multas.get('/:id/pagos', (c) => {
  const { id } = c.req.param();
  const pagos = db
    .select()
    .from(schema.movimientos)
    .where(
      and(
        eq(schema.movimientos.referenciaId, id),
        eq(schema.movimientos.tipo, 'ingreso'),
      ),
    )
    .all();
  return c.json(pagos);
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

  const montoAbono = body.monto !== undefined ? Number(body.monto) : multa.saldoPendiente;
  if (montoAbono <= 0) return c.json({ error: 'El monto debe ser mayor a 0' }, 400);
  if (montoAbono > multa.saldoPendiente) {
    return c.json({ error: 'El monto no puede superar el saldo pendiente' }, 400);
  }
  const fechaPago = body.fechaPago ?? new Date().toISOString().split('T')[0];
  const numeroRecibo = body.numeroRecibo;

  const updated = db.transaction((tx) => {
    tx.insert(schema.movimientos)
      .values({
        id: crypto.randomUUID(),
        tipo: 'ingreso',
        referenciaId: id,
        socioId: multa.socioId,
        monto: montoAbono,
        numeroRecibo,
        nota: `Pago de multa: ${multa.concepto}`,
        fecha: fechaPago,
      })
      .run();

    const nuevoPagado = (multa.montoPagado ?? 0) + montoAbono;
    const nuevoSaldo = Math.max(0, (multa.saldoPendiente ?? multa.monto) - montoAbono);
    const nuevoEstado = nuevoSaldo <= 0 ? 'pagado' : 'pendiente';

    return tx
      .update(schema.multas)
      .set({
        montoPagado: nuevoPagado,
        saldoPendiente: nuevoSaldo,
        estado: nuevoEstado,
        ...(nuevoEstado === 'pagado' && { fechaPago }),
      })
      .where(eq(schema.multas.id, id))
      .returning()
      .get();
  });

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
