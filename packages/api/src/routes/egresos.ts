import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import { parsePaginacion } from '../lib/paginacion';
import { requirePermission, authMiddleware } from '../middleware/auth';

const egresos = new Hono();

egresos.use('*', authMiddleware);

// Envelope Paginated<Egreso> SIEMPRE (D56): filtros categoria/fechaDesde/
// fechaHasta aplican ANTES de LIMIT/OFFSET con COUNT espejo (mismo WHERE,
// tabla simple sin joins); ORDER BY desc(fecha), desc(id) = flujo de caja más
// reciente primero, tiebreak PK (orden total — D34). Shape del item intacta
// `{ id, categoria, beneficiario, monto, descripcion, fecha, numRecibo }`.
egresos.get('/', requirePermission('egresos', 'read'), (c) => {
  const { page, pageSize } = parsePaginacion(c.req.query());
  const { categoria, fechaDesde, fechaHasta } = c.req.query();
  const filters: any[] = [];

  if (categoria) filters.push(eq(schema.egresos.categoria, categoria));
  if (fechaDesde) filters.push(gte(schema.egresos.fecha, fechaDesde));
  if (fechaHasta) filters.push(lte(schema.egresos.fecha, fechaHasta));
  const where = filters.length ? and(...filters) : undefined;

  // COUNT espejo: mismo WHERE que items (tabla simple, sin joins — D56).
  const total = db.select({ n: sql<number>`count(*)` }).from(schema.egresos).where(where).get();
  const items = db
    .select()
    .from(schema.egresos)
    .where(where)
    .orderBy(desc(schema.egresos.fecha), desc(schema.egresos.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  return c.json({ items, total: Number(total?.n ?? 0), page, pageSize });
});

egresos.post('/', requirePermission('egresos', 'create'), async (c) => {
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

egresos.put('/:id', requirePermission('egresos', 'update'), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  delete body.id;

  const existing = db
    .select()
    .from(schema.egresos)
    .where(eq(schema.egresos.id, id))
    .get();

  if (!existing) return c.json({ error: 'Not found' }, 404);

  const result = db.transaction((tx) => {
    const updated = tx
      .update(schema.egresos)
      .set(body)
      .where(eq(schema.egresos.id, id))
      .returning()
      .get();

    const movimiento = tx
      .select()
      .from(schema.movimientos)
      .where(
        and(
          eq(schema.movimientos.referenciaId, id),
          eq(schema.movimientos.tipo, 'egreso'),
        ),
      )
      .get();

    if (movimiento) {
      const movimientoUpdate: Record<string, any> = {};
      if (body.monto !== undefined) movimientoUpdate.monto = body.monto;
      if (body.categoria !== undefined || body.descripcion !== undefined) {
        movimientoUpdate.nota = `Egreso: ${body.categoria ?? existing.categoria}${body.descripcion ? ` - ${body.descripcion}` : existing.descripcion ? ` - ${existing.descripcion}` : ''}`;
      }
      if (Object.keys(movimientoUpdate).length > 0) {
        tx.update(schema.movimientos)
          .set(movimientoUpdate)
          .where(eq(schema.movimientos.id, movimiento.id))
          .run();
      }
    }

    return updated;
  });

  return c.json(result);
});

egresos.delete('/:id', requirePermission('egresos', 'delete'), (c) => {
  const { id } = c.req.param();
  const existing = db
    .select()
    .from(schema.egresos)
    .where(eq(schema.egresos.id, id))
    .get();

  if (!existing) return c.json({ error: 'Not found' }, 404);

  db.transaction((tx) => {
    tx.delete(schema.movimientos)
      .where(
        and(
          eq(schema.movimientos.referenciaId, id),
          eq(schema.movimientos.tipo, 'egreso'),
        ),
      )
      .run();

    tx.delete(schema.egresos)
      .where(eq(schema.egresos.id, id))
      .run();
  });

  return c.body(null, 204);
});

export default egresos;
