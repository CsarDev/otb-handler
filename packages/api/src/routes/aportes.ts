import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq, and, getTableColumns, lte, gte, or, inArray } from 'drizzle-orm';
import { cargarPermisosPorEstado, permite, ERROR_PERMISO } from '../lib/permisos';
import {
  aporteDefPorId,
  mesesDefinicion,
  socioHoldsAporte,
  generarAportes,
  mesesParaDefinicion,
  aportesDirectosPorSocio,
  gruposAdicionalesPorSocio,
  validarGestionMes,
  validarDefinicionesActivas,
} from '../lib/aportes';

const aportes = new Hono();

/**
 * D8/D9: NO existe override manual — `monto` y `tipo` en el body se rechazan
 * con 400 (la generación es definition-driven: monto = definición.monto,
 * tipo = definición.recurrencia).
 */
function rechazarOverride(body: Record<string, unknown>): { error: string; status: 400 } | null {
  if (body.monto !== undefined || body.tipo !== undefined) {
    return { error: 'El monto y el tipo derivan de la definición del aporte (no se acepta override)', status: 400 };
  }
  return null;
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

  const override = rechazarOverride(body);
  if (override) return c.json({ error: override.error }, override.status);

  if (!Array.isArray(body.socioIds) || body.socioIds.length === 0) {
    return c.json({ error: 'socioIds (array) is required' }, 400);
  }
  if (!Array.isArray(body.aporteIds) || body.aporteIds.length === 0) {
    return c.json({ error: 'aporteIds (array) is required' }, 400);
  }

  const gv = validarGestionMes(body);
  if ('error' in gv) return c.json({ error: gv.error }, gv.status);

  const definiciones = validarDefinicionesActivas(body.aporteIds.map(String));
  if ('error' in definiciones) return c.json({ error: definiciones.error }, definiciones.status);

  // Enforcement por estado (D9): NO hardcode `estado='activo'`; se excluyen los
  // socios cuyo estado no permite la acción 'aportes'.
  const permisos = cargarPermisosPorEstado();
  const socios = db
    .select({
      id: schema.socios.id,
      estadoId: schema.socios.estadoId,
      grupoPrimarioId: schema.socios.grupoPrimarioId,
    })
    .from(schema.socios)
    .where(inArray(schema.socios.id, body.socioIds.map(String)))
    .all();
  const permitidos = socios.filter((s) => permite(permisos, s.estadoId, 'aportes'));

  if (permitidos.length === 0) {
    return c.json({ error: 'Ningún socio puede participar en esta acción en su estado actual' }, 400);
  }

  const ids = permitidos.map((s) => s.id);
  const directos = aportesDirectosPorSocio(ids);
  const grupos = gruposAdicionalesPorSocio(ids);

  const created = db.transaction((tx) => {
    return generarAportes(tx, permitidos, definiciones, directos, grupos, gv.gestion, gv.mes);
  });

  return c.json({ count: created.length, items: created }, 201);
});

aportes.post('/bulk/all', async (c) => {
  const body = await c.req.json();

  const override = rechazarOverride(body);
  if (override) return c.json({ error: override.error }, override.status);

  if (!Array.isArray(body.aporteIds) || body.aporteIds.length === 0) {
    return c.json({ error: 'aporteIds (array) is required' }, 400);
  }

  const gv = validarGestionMes(body);
  if ('error' in gv) return c.json({ error: gv.error }, gv.status);

  const definiciones = validarDefinicionesActivas(body.aporteIds.map(String));
  if ('error' in definiciones) return c.json({ error: definiciones.error }, definiciones.status);

  // Enforcement por estado (D9): se resuelven TODOS los socios cuyo estado
  // permite la acción 'aportes'.
  const permisos = cargarPermisosPorEstado();
  const todos = db
    .select({
      id: schema.socios.id,
      estadoId: schema.socios.estadoId,
      grupoPrimarioId: schema.socios.grupoPrimarioId,
    })
    .from(schema.socios)
    .all();
  const permitidos = todos.filter((s) => permite(permisos, s.estadoId, 'aportes'));

  if (permitidos.length === 0) {
    return c.json({ error: 'Ningún socio puede participar en esta acción en su estado actual' }, 400);
  }

  const ids = permitidos.map((s) => s.id);
  const directos = aportesDirectosPorSocio(ids);
  const grupos = gruposAdicionalesPorSocio(ids);

  const created = db.transaction((tx) => {
    return generarAportes(tx, permitidos, definiciones, directos, grupos, gv.gestion, gv.mes);
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

// Generación individual definition-driven (D8): body { socioId, aporteId, gestion, mes? }.
// El socio debe existir (404), su estado debe permitir 'aportes' (409) y debe
// "hold" la definición (directa o heredada por grupo, 400 si no).
aportes.post('/', async (c) => {
  const body = await c.req.json();

  const override = rechazarOverride(body);
  if (override) return c.json({ error: override.error }, override.status);

  if (!body.socioId) {
    return c.json({ error: 'socioId is required' }, 400);
  }
  if (!body.aporteId) {
    return c.json({ error: 'aporteId is required' }, 400);
  }

  const gv = validarGestionMes(body);
  if ('error' in gv) return c.json({ error: gv.error }, gv.status);

  const permisos = cargarPermisosPorEstado();
  const socio = db
    .select({
      id: schema.socios.id,
      estadoId: schema.socios.estadoId,
      grupoPrimarioId: schema.socios.grupoPrimarioId,
    })
    .from(schema.socios)
    .where(eq(schema.socios.id, String(body.socioId)))
    .get();

  if (!socio) return c.json({ error: 'Socio not found' }, 404);
  if (!permite(permisos, socio.estadoId, 'aportes')) return c.json(ERROR_PERMISO, 409);

  const def = aporteDefPorId(String(body.aporteId));
  if (!def) return c.json({ error: `La definición de aporte "${body.aporteId}" no existe` }, 400);
  if (def.activo !== 1) return c.json({ error: `La definición de aporte "${body.aporteId}" está inactiva` }, 400);

  // El socio debe "hold" la definición: asignación directa (socio_aportes) O
  // heredada por grupo (socioHoldsAporte con primario + adicionales).
  const directos = db
    .select({ aporteId: schema.socioAportes.aporteId })
    .from(schema.socioAportes)
    .where(eq(schema.socioAportes.socioId, socio.id))
    .all()
    .map((r) => r.aporteId);
  const gruposAdicionales = db
    .select({ grupoId: schema.socioGrupos.grupoId })
    .from(schema.socioGrupos)
    .where(eq(schema.socioGrupos.socioId, socio.id))
    .all()
    .map((r) => r.grupoId);

  if (!socioHoldsAporte({ aporteIds: directos, grupoPrimarioId: socio.grupoPrimarioId }, def, gruposAdicionales)) {
    return c.json({ error: 'El socio no tiene asignado este aporte' }, 400);
  }

  const created = db.transaction((tx) => {
    return generarAportes(
      tx,
      [socio],
      [def],
      new Map([[socio.id, directos]]),
      new Map([[socio.id, gruposAdicionales]]),
      gv.gestion,
      gv.mes,
    );
  });

  return c.json({ count: created.length, items: created }, 201);
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
