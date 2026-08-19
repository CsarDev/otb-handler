import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq, and, getTableColumns, lte, gte, sql, or, inArray, desc } from 'drizzle-orm';
import { cargarPermisosPorEstado, permite, ERROR_PERMISO } from '../lib/permisos';
import { sociosPorGrupos } from '../lib/aportes';
import { parsePaginacion } from '../lib/paginacion';
import { requirePermission, authMiddleware } from '../middleware/auth';

const multas = new Hono();

multas.use('*', authMiddleware);

multas.get('/', requirePermission('multas', 'read'), (c) => {
  const { socioId, estado, actividadId, fechaDesde, fechaHasta, gestion, estadoId, grupoId, page, pageSize } =
    c.req.query();
  const { page: p, pageSize: ps } = parsePaginacion({ page, pageSize });
  const filters: any[] = [];

  if (socioId) filters.push(eq(schema.multas.socioId, socioId));
  if (estado) filters.push(eq(schema.multas.estado, estado as 'pendiente' | 'pagado' | 'anulado'));
  if (actividadId) filters.push(eq(schema.multas.actividadId, actividadId));
  if (fechaDesde) filters.push(gte(schema.multas.fechaGen, fechaDesde));
  if (fechaHasta) filters.push(lte(schema.multas.fechaGen, fechaHasta));
  if (gestion) filters.push(eq(sql`strftime('%Y', ${schema.multas.fechaGen})`, gestion));
  if (estadoId) filters.push(eq(schema.socios.estadoId, estadoId));
  if (grupoId) {
    const subquery = db
      .select({ socioId: schema.socioGrupos.socioId })
      .from(schema.socioGrupos)
      .where(eq(schema.socioGrupos.grupoId, grupoId));
    filters.push(or(eq(schema.socios.grupoPrimarioId, grupoId), inArray(schema.socios.id, subquery)));
  }

  // Un solo WHERE builder compartido por COUNT e items (D33): `.where(undefined)`
  // es no-op en drizzle, y el COUNT debe espejar el MISMO FROM + LEFT JOIN porque
  // estadoId/grupoId filtran sobre schema.socios.
  const where = filters.length ? and(...filters) : undefined;

  const baseQuery = db
    .select({
      ...getTableColumns(schema.multas),
      socioNombre: schema.socios.nombre,
      socioApellido: schema.socios.apellidoPaterno,
    })
    .from(schema.multas)
    .leftJoin(schema.socios, eq(schema.multas.socioId, schema.socios.id));

  const total = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.multas)
    .leftJoin(schema.socios, eq(schema.multas.socioId, schema.socios.id))
    .where(where)
    .get();

  const items = baseQuery
    .where(where)
    .orderBy(desc(schema.multas.fechaGen), desc(schema.multas.id)) // D34: (recencia, PK) = orden total
    .limit(ps)
    .offset((p - 1) * ps)
    .all();

  return c.json({ items, total: Number(total?.n ?? 0), page: p, pageSize: ps });
});

multas.post('/bulk', requirePermission('multas', 'create'), async (c) => {
  const body = await c.req.json();

  // D36 (orden fijo, TODO antes de insertar):
  // 1) Requeridos: socioIds (no-vacío) O grupoIds (no-vacío) + concepto + monto
  //    (mensaje SIN cambios; grupoIds ausente/vacío mantiene socioIds requerido).
  if ((!body.socioIds?.length && !body.grupoIds?.length) || !body.concepto || !body.monto) {
    return c.json({ error: 'socioIds (array), concepto, and monto are required' }, 400);
  }
  // 2) Shape: cuando está presente, grupoIds DEBE ser un array.
  if (body.grupoIds !== undefined && !Array.isArray(body.grupoIds)) {
    return c.json({ error: 'grupoIds must be an array' }, 400);
  }
  const grupoIds: string[] = body.grupoIds ?? [];
  // 3) Existencia: cada id DEBE existir en `grupos` (batch, sin N+1, D18).
  if (grupoIds.length > 0) {
    const encontrados = new Set(
      db
        .select({ id: schema.grupos.id })
        .from(schema.grupos)
        .where(inArray(schema.grupos.id, grupoIds))
        .all()
        .map((r) => r.id),
    );
    if (grupoIds.some((id) => !encontrados.has(id))) {
      return c.json({ error: 'grupoIds contains an invalid group' }, 400);
    }
  }

  const monto = Number(body.monto);
  const fechaGen = body.fecha ?? new Date().toISOString().split('T')[0];
  // 4) Set objetivo: unión DEDUPED de los socioIds directos y los miembros
  //    ACTUALES de todos los grupos (D35) — el Set da O(1) de dedup.
  const targetIds = [...new Set([...(body.socioIds ?? []), ...sociosPorGrupos(grupoIds)])];

  // Enforcement: excluir socios cuyo estado no permite 'multas'
  const permisos = cargarPermisosPorEstado();
  const socios = db
    .select({ id: schema.socios.id, estadoId: schema.socios.estadoId })
    .from(schema.socios)
    .where(inArray(schema.socios.id, targetIds))
    .all();
  const permitidos = socios.filter((s) => permite(permisos, s.estadoId, 'multas')).map((s) => s.id);

  // 5) Check REUTILIZADO verbatim (D36): target vacío / todos excluidos → 400 existente.
  if (permitidos.length === 0) {
    return c.json({ error: 'Ningún socio puede participar en esta acción en su estado actual' }, 400);
  }

  const created = db.transaction((tx) => {
    return permitidos.map((socioId) => {
      const id = crypto.randomUUID();
      tx.insert(schema.multas)
        .values({
          id,
          socioId,
          actividadId: body.actividadId ?? null,
          concepto: body.concepto,
          monto,
          saldoPendiente: monto,
          montoPagado: 0,
          fechaGen,
        })
        .run();
      return { id, socioId, concepto: body.concepto, monto };
    });
  });

  return c.json({ count: created.length, items: created }, 201);
});

multas.post('/', requirePermission('multas', 'create'), async (c) => {
  const body = await c.req.json();

  if (!body.socioId || !body.concepto || !body.monto) {
    return c.json({ error: 'socioId, concepto, and monto are required' }, 400);
  }

  const permisos = cargarPermisosPorEstado();
  const socio = db
    .select({ estadoId: schema.socios.estadoId })
    .from(schema.socios)
    .where(eq(schema.socios.id, body.socioId))
    .get();

  if (!socio) return c.json({ error: 'Socio not found' }, 404);
  if (!permite(permisos, socio.estadoId, 'multas')) return c.json(ERROR_PERMISO, 409);

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

multas.post('/:id/anular', requirePermission('multas', 'update'), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  if (!body.razon) return c.json({ error: 'razon is required' }, 400);

  const multa = db
    .select()
    .from(schema.multas)
    .where(eq(schema.multas.id, id))
    .get();

  if (!multa) return c.json({ error: 'Multa not found' }, 404);
  if (multa.estado === 'anulado') return c.json({ error: 'Multa already voided' }, 400);

  // Enforcement 'anulaciones'
  const permisos = cargarPermisosPorEstado();
  const socio = db
    .select({ estadoId: schema.socios.estadoId })
    .from(schema.socios)
    .where(eq(schema.socios.id, multa.socioId))
    .get();
  if (!socio) return c.json({ error: 'Socio not found' }, 404);
  if (!permite(permisos, socio.estadoId, 'anulaciones')) return c.json(ERROR_PERMISO, 409);

  const updated = db.transaction((tx) => {
    tx.update(schema.movimientos)
      .set({ anulado: 1, razonAnulacion: `Anulación de multa: ${body.razon}` })
      .where(eq(schema.movimientos.referenciaId, id))
      .run();

    return tx
      .update(schema.multas)
      .set({
        estado: 'anulado',
        razonAnulacion: body.razon,
        saldoPendiente: 0,
      })
      .where(eq(schema.multas.id, id))
      .returning()
      .get();
  });

  return c.json(updated);
});

multas.get('/:id/pagos', requirePermission('multas', 'read'), (c) => {
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

multas.post('/:id/pagar', requirePermission('multas', 'update'), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  const multa = db
    .select()
    .from(schema.multas)
    .where(eq(schema.multas.id, id))
    .get();

  if (!multa) return c.json({ error: 'Multa not found' }, 404);
  if (multa.estado === 'pagado') return c.json({ error: 'Multa already paid' }, 400);

  // Enforcement 'pagos'
  const permisos = cargarPermisosPorEstado();
  const socio = db
    .select({ estadoId: schema.socios.estadoId })
    .from(schema.socios)
    .where(eq(schema.socios.id, multa.socioId))
    .get();
  if (!socio) return c.json({ error: 'Socio not found' }, 404);
  if (!permite(permisos, socio.estadoId, 'pagos')) return c.json(ERROR_PERMISO, 409);

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

multas.put('/:id', requirePermission('multas', 'update'), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  delete body.id;

  const existing = db
    .select({ socioId: schema.multas.socioId })
    .from(schema.multas)
    .where(eq(schema.multas.id, id))
    .get();

  if (!existing) return c.json({ error: 'Not found' }, 404);

  // Enforcement 'multas'
  const permisos = cargarPermisosPorEstado();
  const socio = db
    .select({ estadoId: schema.socios.estadoId })
    .from(schema.socios)
    .where(eq(schema.socios.id, existing.socioId))
    .get();
  if (!socio) return c.json({ error: 'Socio not found' }, 404);
  if (!permite(permisos, socio.estadoId, 'multas')) return c.json(ERROR_PERMISO, 409);

  const result = db
    .update(schema.multas)
    .set(body)
    .where(eq(schema.multas.id, id))
    .returning()
    .get();

  return result ? c.json(result) : c.json({ error: 'Not found' }, 404);
});

multas.delete('/:id', requirePermission('multas', 'delete'), (c) => {
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
