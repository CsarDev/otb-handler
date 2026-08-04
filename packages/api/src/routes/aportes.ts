import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq, and, getTableColumns, lte, gte, or, inArray } from 'drizzle-orm';
import { cargarPermisosPorEstado, permite, ERROR_PERMISO } from '../lib/permisos';
import { resolverMonto } from '../lib/tipos-aporte';

const aportes = new Hono();

type SocioElegible = { id: string; estadoId: string | null; tipoAporteId: string | null };
type AporteCreado = { id: string; socioId: string; mes: number | undefined; gestion: number; tipo: string; montoBase: number };
type TxAportes = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * D6: genera los registros de aporte para la lista de socios permitidos dentro
 * de la transacción abierta. Compartido por POST /bulk y POST /bulk/all para
 * garantizar exactamente el mismo patrón de creación (anual→12, mensual→N,
 * unico/extra→1) y la misma regla de override (D4).
 */
function generarAportes(
  tx: TxAportes,
  socios: SocioElegible[],
  tipo: string,
  gestion: number,
  mesInicial: number,
  meses: number,
  override: number | undefined,
): AporteCreado[] {
  const items: AporteCreado[] = [];

  for (const socio of socios) {
    // D6/D4: monto derivado del tipo del socio; override SOLO unico/extraordinario.
    // mensual/anual SIEMPRE derivan (un `monto` del cliente se ignora).
    const montoBase = resolverMonto(socio, tipo, override);

    if (tipo === 'anual') {
      // FIX bug absorvido: anual SIEMPRE 12 registros (enero-diciembre),
      // IGNORANDO body.meses (antes generaba body.meses registros).
      for (let m = 1; m <= 12; m++) {
        const id = crypto.randomUUID();
        tx.insert(schema.aportes)
          .values({
            id,
            socioId: socio.id,
            mes: m,
            gestion,
            tipo,
            montoBase,
            montoPagado: 0,
            saldoPendiente: montoBase,
            estado: 'pendiente',
          })
          .run();
        items.push({ id, socioId: socio.id, mes: m, gestion, tipo, montoBase });
      }
    } else if (tipo === 'mensual') {
      // mensual = N registros desde el mes inicial (body.meses, default 1)
      for (let i = 0; i < meses; i++) {
        const id = crypto.randomUUID();
        const mes = mesInicial + i;
        tx.insert(schema.aportes)
          .values({
            id,
            socioId: socio.id,
            mes,
            gestion,
            tipo,
            montoBase,
            montoPagado: 0,
            saldoPendiente: montoBase,
            estado: 'pendiente',
          })
          .run();
        items.push({ id, socioId: socio.id, mes, gestion, tipo, montoBase });
      }
    } else {
      // unico / extraordinario → 1 registro
      const id = crypto.randomUUID();
      tx.insert(schema.aportes)
        .values({
          id,
          socioId: socio.id,
          mes: mesInicial,
          gestion,
          tipo,
          montoBase,
          montoPagado: 0,
          saldoPendiente: montoBase,
          estado: 'pendiente',
        })
        .run();
      items.push({ id, socioId: socio.id, mes: mesInicial, gestion, tipo, montoBase });
    }
  }

  return items;
}

aportes.get('/', (c) => {
  const { socioId, mes, gestion, estado, tipo, fechaDesde, fechaHasta, estadoId, grupoId } = c.req.query();
  const filters: any[] = [];

  if (socioId) filters.push(eq(schema.aportes.socioId, socioId));
  if (mes) filters.push(eq(schema.aportes.mes, Number(mes)));
  if (gestion) filters.push(eq(schema.aportes.gestion, Number(gestion)));
  if (tipo) filters.push(eq(schema.aportes.tipo, tipo));
  if (estado) filters.push(eq(schema.aportes.estado, estado as 'pendiente' | 'pagado' | 'anulado'));
  if (fechaDesde) filters.push(gte(schema.aportes.fechaPago, fechaDesde));
  if (fechaHasta) filters.push(lte(schema.aportes.fechaPago, fechaHasta));
  if (estadoId) filters.push(eq(schema.socios.estadoId, estadoId));
  if (grupoId) {
    const subquery = db
      .select({ socioId: schema.socioGrupos.socioId })
      .from(schema.socioGrupos)
      .where(eq(schema.socioGrupos.grupoId, grupoId));
    filters.push(or(eq(schema.socios.grupoPrimarioId, grupoId), inArray(schema.socios.id, subquery)));
  }

  const query = db
    .select({
      ...getTableColumns(schema.aportes),
      socioNombre: schema.socios.nombre,
      socioApellido: schema.socios.apellidoPaterno,
    })
    .from(schema.aportes)
    .leftJoin(schema.socios, eq(schema.aportes.socioId, schema.socios.id));

  return c.json(
    filters.length ? query.where(and(...filters)).all() : query.all(),
  );
});

aportes.post('/bulk', async (c) => {
  const body = await c.req.json();

  if (!body.socioIds?.length) {
    return c.json({ error: 'socioIds (array) is required' }, 400);
  }

  const socioIds: string[] = body.socioIds;
  const tipo = body.tipo ?? 'mensual';
  const gestion = Number(body.gestion ?? new Date().getFullYear());
  const mesInicial = body.mes ? Number(body.mes) : new Date().getMonth() + 1;
  const meses = body.meses ? Number(body.meses) : 1;
  const override = body.monto !== undefined ? Number(body.monto) : undefined;

  // Enforcement: excluir socios cuyo estado no permite 'aportes'
  const permisos = cargarPermisosPorEstado();
  const socios = db
    .select({
      id: schema.socios.id,
      estadoId: schema.socios.estadoId,
      tipoAporteId: schema.socios.tipoAporteId,
    })
    .from(schema.socios)
    .where(inArray(schema.socios.id, socioIds))
    .all();
  const permitidos = socios.filter((s) => permite(permisos, s.estadoId, 'aportes'));

  if (permitidos.length === 0) {
    return c.json({ error: 'Ningún socio puede participar en esta acción en su estado actual' }, 400);
  }

  const created = db.transaction((tx) => {
    return generarAportes(tx, permitidos, tipo, gestion, mesInicial, meses, override);
  });

  return c.json({ count: created.length, items: created }, 201);
});

aportes.post('/bulk/all', async (c) => {
  const body = await c.req.json();

  const tipo = body.tipo ?? 'mensual';
  const gestion = Number(body.gestion ?? new Date().getFullYear());
  const mesInicial = body.mes ? Number(body.mes) : new Date().getMonth() + 1;
  const meses = body.meses ? Number(body.meses) : 1;
  const override = body.monto !== undefined ? Number(body.monto) : undefined;

  // Enforcement por estado (D5): NO hardcode `estado='activo'`, se resuelven
  // TODOS los socios cuyo estado permite la acción 'aportes'.
  const permisos = cargarPermisosPorEstado();
  const todos = db
    .select({
      id: schema.socios.id,
      estadoId: schema.socios.estadoId,
      tipoAporteId: schema.socios.tipoAporteId,
    })
    .from(schema.socios)
    .all();
  const permitidos = todos.filter((s) => permite(permisos, s.estadoId, 'aportes'));

  if (permitidos.length === 0) {
    return c.json({ error: 'Ningún socio puede participar en esta acción en su estado actual' }, 400);
  }

  const created = db.transaction((tx) => {
    return generarAportes(tx, permitidos, tipo, gestion, mesInicial, meses, override);
  });

  return c.json({ count: created.length, items: created }, 201);
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

aportes.get('/:id/pagos', (c) => {
  const { id } = c.req.param();

  const aporte = db
    .select({ id: schema.aportes.id })
    .from(schema.aportes)
    .where(eq(schema.aportes.id, id))
    .get();

  if (!aporte) return c.json({ error: 'Aporte not found' }, 404);

  // Historial de movimientos del aporte: solo ingresos NO anulados
  // (patrón multas.get('/:id/pagos') + exclusión de anulados según spec payments)
  const pagos = db
    .select()
    .from(schema.movimientos)
    .where(
      and(
        eq(schema.movimientos.referenciaId, id),
        eq(schema.movimientos.tipo, 'ingreso'),
        eq(schema.movimientos.anulado, 0),
      ),
    )
    .orderBy(schema.movimientos.fecha)
    .all();

  return c.json(pagos);
});

aportes.post('/', async (c) => {
  const body = await c.req.json();

  if (!body.socioId) {
    return c.json({ error: 'socioId is required' }, 400);
  }

  const permisos = cargarPermisosPorEstado();
  const socio = db
    .select({ estadoId: schema.socios.estadoId, tipoAporteId: schema.socios.tipoAporteId })
    .from(schema.socios)
    .where(eq(schema.socios.id, body.socioId))
    .get();

  if (!socio) return c.json({ error: 'Socio not found' }, 404);
  if (!permite(permisos, socio.estadoId, 'aportes')) return c.json(ERROR_PERMISO, 409);

  // D6/D4: monto derivado del tipo del socio; `monto` (override) SOLO se honra
  // para unico/extraordinario. `montoBase` legacy del cliente se ignora (derivado).
  const tipo = body.tipo ?? 'mensual';
  const montoBase = resolverMonto(socio, tipo, body.monto !== undefined ? Number(body.monto) : undefined);
  const gestion = Number(body.gestion ?? new Date().getFullYear());
  const mes = body.mes ? Number(body.mes) : new Date().getMonth() + 1;

  const result = db
    .insert(schema.aportes)
    .values({
      id: crypto.randomUUID(),
      socioId: body.socioId,
      mes,
      gestion,
      tipo,
      montoBase,
      montoPagado: 0,
      saldoPendiente: montoBase,
      estado: 'pendiente',
    })
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
  if (aporte.estado === 'anulado') return c.json({ error: 'Aporte is voided' }, 400);

  // Enforcement 'pagos': cargar el socio del aporte
  const permisos = cargarPermisosPorEstado();
  const socio = db
    .select({ estadoId: schema.socios.estadoId })
    .from(schema.socios)
    .where(eq(schema.socios.id, aporte.socioId))
    .get();
  if (!socio) return c.json({ error: 'Socio not found' }, 404);
  if (!permite(permisos, socio.estadoId, 'pagos')) return c.json(ERROR_PERMISO, 409);

  const montoAbono = body.monto !== undefined ? Number(body.monto) : aporte.saldoPendiente;
  if (montoAbono <= 0) return c.json({ error: 'El monto debe ser mayor a 0' }, 400);
  if (montoAbono > aporte.saldoPendiente) {
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
        socioId: aporte.socioId,
        monto: montoAbono,
        numeroRecibo,
        nota: `Pago de aporte - ${aporte.tipo}`,
        fecha: fechaPago,
      })
      .run();

    const nuevoPagado = (aporte.montoPagado ?? 0) + montoAbono;
    const nuevoSaldo = Math.max(0, (aporte.saldoPendiente ?? aporte.montoBase) - montoAbono);
    const nuevoEstado = nuevoSaldo <= 0 ? 'pagado' : 'pendiente';

    return tx
      .update(schema.aportes)
      .set({
        montoPagado: nuevoPagado,
        saldoPendiente: nuevoSaldo,
        estado: nuevoEstado,
        ...(nuevoEstado === 'pagado' && { fechaPago, numeroRecibo }),
      })
      .where(eq(schema.aportes.id, id))
      .returning()
      .get();
  });

  return c.json(updated);
});

aportes.post('/:id/anular', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  if (!body.razon) return c.json({ error: 'razon is required' }, 400);

  const aporte = db
    .select()
    .from(schema.aportes)
    .where(eq(schema.aportes.id, id))
    .get();

  if (!aporte) return c.json({ error: 'Aporte not found' }, 404);
  if (aporte.estado === 'anulado') return c.json({ error: 'Aporte already voided' }, 400);

  // Enforcement 'anulaciones'
  const permisos = cargarPermisosPorEstado();
  const socio = db
    .select({ estadoId: schema.socios.estadoId })
    .from(schema.socios)
    .where(eq(schema.socios.id, aporte.socioId))
    .get();
  if (!socio) return c.json({ error: 'Socio not found' }, 404);
  if (!permite(permisos, socio.estadoId, 'anulaciones')) return c.json(ERROR_PERMISO, 409);

  const updated = db.transaction((tx) => {
    tx.update(schema.movimientos)
      .set({ anulado: 1, razonAnulacion: `Anulación de aporte: ${body.razon}` })
      .where(eq(schema.movimientos.referenciaId, id))
      .run();

    return tx
      .update(schema.aportes)
      .set({
        estado: 'anulado',
        razonAnulacion: body.razon,
        saldoPendiente: 0,
      })
      .where(eq(schema.aportes.id, id))
      .returning()
      .get();
  });

  return c.json(updated);
});

aportes.put('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  delete body.id;

  const existing = db
    .select({ socioId: schema.aportes.socioId })
    .from(schema.aportes)
    .where(eq(schema.aportes.id, id))
    .get();

  if (!existing) return c.json({ error: 'Not found' }, 404);

  // Enforcement 'aportes' sobre el socio del aporte
  const permisos = cargarPermisosPorEstado();
  const socio = db
    .select({ estadoId: schema.socios.estadoId })
    .from(schema.socios)
    .where(eq(schema.socios.id, existing.socioId))
    .get();
  if (!socio) return c.json({ error: 'Socio not found' }, 404);
  if (!permite(permisos, socio.estadoId, 'aportes')) return c.json(ERROR_PERMISO, 409);

  const result = db
    .update(schema.aportes)
    .set(body)
    .where(eq(schema.aportes.id, id))
    .returning()
    .get();

  return result ? c.json(result) : c.json({ error: 'Not found' }, 404);
});

export default aportes;
