import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq, and, gte, lte, sql, getTableColumns, or, inArray, asc, desc } from 'drizzle-orm';
import { cargarPermisosPorEstado, permite, ERROR_PERMISO } from '../lib/permisos';
import { parsePaginacion } from '../lib/paginacion';

const reportes = new Hono();

reportes.get('/balance', (c) => {
  const gestion = c.req.query('gestion');
  const mes = c.req.query('mes');
  const fechaDesde = c.req.query('fechaDesde');
  const fechaHasta = c.req.query('fechaHasta');

  const ingresoFilters: any[] = [eq(schema.movimientos.tipo, 'ingreso'), eq(schema.movimientos.anulado, 0)];
  const egresoFilters: any[] = [eq(schema.movimientos.tipo, 'egreso'), eq(schema.movimientos.anulado, 0)];

  if (fechaDesde && fechaHasta) {
    ingresoFilters.push(gte(schema.movimientos.fecha, fechaDesde), lte(schema.movimientos.fecha, fechaHasta));
    egresoFilters.push(gte(schema.movimientos.fecha, fechaDesde), lte(schema.movimientos.fecha, fechaHasta));
  } else if (gestion && mes) {
    const mesPad = String(mes).padStart(2, '0');
    ingresoFilters.push(gte(schema.movimientos.fecha, `${gestion}-${mesPad}-01`), lte(schema.movimientos.fecha, `${gestion}-${mesPad}-31`));
    egresoFilters.push(gte(schema.movimientos.fecha, `${gestion}-${mesPad}-01`), lte(schema.movimientos.fecha, `${gestion}-${mesPad}-31`));
  } else if (gestion) {
    ingresoFilters.push(gte(schema.movimientos.fecha, `${gestion}-01-01`), lte(schema.movimientos.fecha, `${gestion}-12-31`));
    egresoFilters.push(gte(schema.movimientos.fecha, `${gestion}-01-01`), lte(schema.movimientos.fecha, `${gestion}-12-31`));
  }

  const ingresosRow = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.movimientos.monto}), 0)` })
    .from(schema.movimientos)
    .where(and(...ingresoFilters))
    .get();

  const egresosRow = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.movimientos.monto}), 0)` })
    .from(schema.movimientos)
    .where(and(...egresoFilters))
    .get();

  const ingresos = Number(ingresosRow?.total ?? 0);
  const egresos = Number(egresosRow?.total ?? 0);

  const ingresosPorCategoria = db
    .select({
      categoria: sql<string>`'Aportes y Multas'`,
      total: sql<number>`COALESCE(SUM(${schema.movimientos.monto}), 0)`,
    })
    .from(schema.movimientos)
    .where(and(...ingresoFilters))
    .all();

  const egresoFechaFilters: any[] = [];
  if (fechaDesde && fechaHasta) {
    egresoFechaFilters.push(gte(schema.egresos.fecha, fechaDesde), lte(schema.egresos.fecha, fechaHasta));
  } else if (gestion && mes) {
    const mesPad = String(mes).padStart(2, '0');
    egresoFechaFilters.push(gte(schema.egresos.fecha, `${gestion}-${mesPad}-01`), lte(schema.egresos.fecha, `${gestion}-${mesPad}-31`));
  } else if (gestion) {
    egresoFechaFilters.push(gte(schema.egresos.fecha, `${gestion}-01-01`), lte(schema.egresos.fecha, `${gestion}-12-31`));
  }

  const egresosPorCategoria = egresoFechaFilters.length
    ? db
        .select({ categoria: schema.egresos.categoria, total: sql<number>`COALESCE(SUM(${schema.egresos.monto}), 0)` })
        .from(schema.egresos)
        .where(and(...egresoFechaFilters))
        .groupBy(schema.egresos.categoria)
        .all()
    : [];

  return c.json({
    gestion: gestion ? Number(gestion) : undefined,
    mes: mes ? Number(mes) : undefined,
    ingresos,
    egresos,
    neto: ingresos - egresos,
    ingresosPorCategoria,
    egresosPorCategoria,
  });
});

reportes.get('/libro-diario', (c) => {
  const { page, pageSize } = parsePaginacion(c.req.query());
  const gestion = c.req.query('gestion');
  const mes = c.req.query('mes');
  const tipo = c.req.query('tipo');
  const fechaDesde = c.req.query('fechaDesde');
  const fechaHasta = c.req.query('fechaHasta');
  const estadoId = c.req.query('estadoId');
  const grupoId = c.req.query('grupoId');

  const filters: any[] = [eq(schema.movimientos.anulado, 0)];

  if (tipo && tipo !== 'todos') filters.push(eq(schema.movimientos.tipo, tipo as 'ingreso' | 'egreso'));

  if (fechaDesde && fechaHasta) {
    filters.push(gte(schema.movimientos.fecha, fechaDesde), lte(schema.movimientos.fecha, fechaHasta));
  } else if (gestion && mes) {
    const mesPad = String(mes).padStart(2, '0');
    filters.push(gte(schema.movimientos.fecha, `${gestion}-${mesPad}-01`), lte(schema.movimientos.fecha, `${gestion}-${mesPad}-31`));
  } else if (gestion) {
    filters.push(gte(schema.movimientos.fecha, `${gestion}-01-01`), lte(schema.movimientos.fecha, `${gestion}-12-31`));
  }

  if (estadoId) filters.push(eq(schema.socios.estadoId, estadoId));
  if (grupoId) {
    const subquery = db
      .select({ socioId: schema.socioGrupos.socioId })
      .from(schema.socioGrupos)
      .where(eq(schema.socioGrupos.grupoId, grupoId));
    filters.push(or(eq(schema.socios.grupoPrimarioId, grupoId), inArray(schema.socios.id, subquery)));
  }

  const where = and(...filters);

  // Envelope SIEMPRE (D48): total = COUNT filtrado ANTES de la paginación,
  // espejando el MISMO FROM + LEFT JOIN + WHERE (los filtros estadoId/grupoId
  // referencian schema.socios — un count sin el join fallaría; patrón D33).
  const totalRow = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.movimientos)
    .leftJoin(schema.socios, eq(schema.movimientos.socioId, schema.socios.id))
    .where(where)
    .get();

  const items = db
    .select({
      id: schema.movimientos.id,
      tipo: schema.movimientos.tipo,
      referenciaId: schema.movimientos.referenciaId,
      socioId: schema.movimientos.socioId,
      monto: schema.movimientos.monto,
      numeroRecibo: schema.movimientos.numeroRecibo,
      nota: schema.movimientos.nota,
      fecha: schema.movimientos.fecha,
      anulado: schema.movimientos.anulado,
      socioNombre: schema.socios.nombre,
      socioApellido: schema.socios.apellidoPaterno,
    })
    .from(schema.movimientos)
    .leftJoin(schema.socios, eq(schema.movimientos.socioId, schema.socios.id))
    .where(where)
    .orderBy(asc(schema.movimientos.fecha), desc(schema.movimientos.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  return c.json({ items, total: Number(totalRow?.n ?? 0), page, pageSize });
});

reportes.get('/resumen-socio/:id', (c) => {
  const { id } = c.req.param();
  const gestion = c.req.query('gestion');
  const mes = c.req.query('mes');
  const fechaDesde = c.req.query('fechaDesde');
  const fechaHasta = c.req.query('fechaHasta');
  const tipo = c.req.query('tipo') ?? 'todos';
  const estadoId = c.req.query('estadoId');
  const grupoId = c.req.query('grupoId');

  const socio = db.select().from(schema.socios).where(eq(schema.socios.id, id)).get();
  if (!socio) return c.json({ error: 'Socio not found' }, 404);

  // Enforcement 'reportes': el socio debe permitir aparecer en reportes
  const permisos = cargarPermisosPorEstado();
  if (!permite(permisos, socio.estadoId, 'reportes')) return c.json(ERROR_PERMISO, 409);

  const aporteFilters: any[] = [eq(schema.aportes.socioId, id)];
  const multaFilters: any[] = [eq(schema.multas.socioId, id)];

  if (fechaDesde && fechaHasta) {
    aporteFilters.push(gte(schema.aportes.fechaPago, fechaDesde), lte(schema.aportes.fechaPago, fechaHasta));
    multaFilters.push(gte(schema.multas.fechaGen, fechaDesde), lte(schema.multas.fechaGen, fechaHasta));
  } else if (gestion && mes) {
    aporteFilters.push(eq(schema.aportes.gestion, Number(gestion)), eq(schema.aportes.mes, Number(mes)));
    multaFilters.push(gte(schema.multas.fechaGen, `${gestion}-${String(mes).padStart(2, '0')}-01`), lte(schema.multas.fechaGen, `${gestion}-${String(mes).padStart(2, '0')}-31`));
  } else if (gestion) {
    aporteFilters.push(eq(schema.aportes.gestion, Number(gestion)));
    multaFilters.push(gte(schema.multas.fechaGen, `${gestion}-01-01`), lte(schema.multas.fechaGen, `${gestion}-12-31`));
  }

  const totalAportadoRow = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.aportes.montoPagado}), 0)` })
    .from(schema.aportes)
    .where(and(...aporteFilters, eq(schema.aportes.estado, 'pagado')))
    .get();

  const multasPagadasRow = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.multas.montoPagado}), 0)` })
    .from(schema.multas)
    .where(and(...multaFilters, eq(schema.multas.estado, 'pagado')))
    .get();

  const multasSaldoRow = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.multas.saldoPendiente}), 0)` })
    .from(schema.multas)
    .where(and(...multaFilters, eq(schema.multas.estado, 'pendiente')))
    .get();

  const aportesPendientes = (tipo === 'todos' || tipo === 'aportes')
    ? db.select({
        ...getTableColumns(schema.aportes),
        socioNombre: schema.socios.nombre,
        socioApellido: schema.socios.apellidoPaterno,
      })
        .from(schema.aportes)
        .leftJoin(schema.socios, eq(schema.aportes.socioId, schema.socios.id))
        .where(and(...aporteFilters, eq(schema.aportes.estado, 'pendiente')))
        .all()
    : [];

  const multasPendientes = (tipo === 'todos' || tipo === 'multas')
    ? db.select({
        ...getTableColumns(schema.multas),
        socioNombre: schema.socios.nombre,
        socioApellido: schema.socios.apellidoPaterno,
      })
        .from(schema.multas)
        .leftJoin(schema.socios, eq(schema.multas.socioId, schema.socios.id))
        .where(and(...multaFilters, eq(schema.multas.estado, 'pendiente')))
        .all()
    : [];

  return c.json({
    socio: { id: socio.id, nombre: socio.nombre, apellido: socio.apellidoPaterno },
    totalAportado: Number(totalAportadoRow?.total ?? 0),
    multasPagadas: Number(multasPagadasRow?.total ?? 0),
    saldoPendienteMultas: Number(multasSaldoRow?.total ?? 0),
    aportesPendientes,
    multasPendientes,
  });
});

export default reportes;
