import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

const reportes = new Hono();

reportes.get('/balance', (c) => {
  const gestion = Number(c.req.query('gestion') ?? new Date().getFullYear());
  const mes = c.req.query('mes') ?? String(new Date().getMonth() + 1).padStart(2, '0');
  const mesPad = String(mes).padStart(2, '0');
  const inicioMes = `${gestion}-${mesPad}-01`;
  const finMes = `${gestion}-${mesPad}-31`;

  const ingresosRow = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.movimientos.monto}), 0)` })
    .from(schema.movimientos)
    .where(
      and(
        eq(schema.movimientos.tipo, 'ingreso'),
        gte(schema.movimientos.fecha, inicioMes),
        lte(schema.movimientos.fecha, finMes),
      ),
    )
    .get();

  const egresosRow = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.movimientos.monto}), 0)` })
    .from(schema.movimientos)
    .where(
      and(
        eq(schema.movimientos.tipo, 'egreso'),
        gte(schema.movimientos.fecha, inicioMes),
        lte(schema.movimientos.fecha, finMes),
      ),
    )
    .get();

  const ingresos = Number(ingresosRow?.total ?? 0);
  const egresos = Number(egresosRow?.total ?? 0);

  const ingresosPorCategoria = db
    .select({
      categoria: sql<string>`'Aportes y Multas'`,
      total: sql<number>`COALESCE(SUM(${schema.movimientos.monto}), 0)`,
    })
    .from(schema.movimientos)
    .where(
      and(
        eq(schema.movimientos.tipo, 'ingreso'),
        gte(schema.movimientos.fecha, inicioMes),
        lte(schema.movimientos.fecha, finMes),
      ),
    )
    .all();

  const egresosPorCategoria = db
    .select({
      categoria: schema.egresos.categoria,
      total: sql<number>`COALESCE(SUM(${schema.egresos.monto}), 0)`,
    })
    .from(schema.egresos)
    .where(
      and(
        gte(schema.egresos.fecha, inicioMes),
        lte(schema.egresos.fecha, finMes),
      ),
    )
    .groupBy(schema.egresos.categoria)
    .all();

  return c.json({
    gestion,
    mes: Number(mesPad),
    ingresos,
    egresos,
    neto: ingresos - egresos,
    ingresosPorCategoria,
    egresosPorCategoria,
  });
});

reportes.get('/libro-diario', (c) => {
  const fechaDesde = c.req.query('fechaDesde');
  const fechaHasta = c.req.query('fechaHasta');
  const filters: any[] = [];

  if (fechaDesde) filters.push(gte(schema.movimientos.fecha, fechaDesde));
  if (fechaHasta) filters.push(lte(schema.movimientos.fecha, fechaHasta));

  const movs = filters.length
    ? db
        .select({
          id: schema.movimientos.id,
          tipo: schema.movimientos.tipo,
          referenciaId: schema.movimientos.referenciaId,
          socioId: schema.movimientos.socioId,
          monto: schema.movimientos.monto,
          numeroRecibo: schema.movimientos.numeroRecibo,
          nota: schema.movimientos.nota,
          fecha: schema.movimientos.fecha,
          socioNombre: schema.socios.nombre,
          socioApellido: schema.socios.apellidoPaterno,
        })
        .from(schema.movimientos)
        .leftJoin(schema.socios, eq(schema.movimientos.socioId, schema.socios.id))
        .where(and(...filters))
        .orderBy(schema.movimientos.fecha)
        .all()
    : db
        .select({
          id: schema.movimientos.id,
          tipo: schema.movimientos.tipo,
          referenciaId: schema.movimientos.referenciaId,
          socioId: schema.movimientos.socioId,
          monto: schema.movimientos.monto,
          numeroRecibo: schema.movimientos.numeroRecibo,
          nota: schema.movimientos.nota,
          fecha: schema.movimientos.fecha,
          socioNombre: schema.socios.nombre,
          socioApellido: schema.socios.apellidoPaterno,
        })
        .from(schema.movimientos)
        .leftJoin(schema.socios, eq(schema.movimientos.socioId, schema.socios.id))
        .orderBy(schema.movimientos.fecha)
        .all();

  return c.json(movs);
});

reportes.get('/resumen-socio/:id', (c) => {
  const { id } = c.req.param();

  const socio = db
    .select()
    .from(schema.socios)
    .where(eq(schema.socios.id, id))
    .get();

  if (!socio) return c.json({ error: 'Socio no encontrado' }, 404);

  const totalAportadoRow = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.aportes.montoBase}), 0)` })
    .from(schema.aportes)
    .where(and(eq(schema.aportes.socioId, id), eq(schema.aportes.estado, 'pagado')))
    .get();

  const multasRow = db
    .select({
      totalPagado: sql<number>`COALESCE(SUM(${schema.multas.montoPagado}), 0)`,
      saldoPendiente: sql<number>`COALESCE(SUM(${schema.multas.saldoPendiente}), 0)`,
    })
    .from(schema.multas)
    .where(eq(schema.multas.socioId, id))
    .get();

  const aportesPendientes = db
    .select()
    .from(schema.aportes)
    .where(and(eq(schema.aportes.socioId, id), eq(schema.aportes.estado, 'pendiente')))
    .all();

  const multasPendientes = db
    .select()
    .from(schema.multas)
    .where(and(eq(schema.multas.socioId, id), eq(schema.multas.estado, 'pendiente')))
    .all();

  return c.json({
    socio: { id: socio.id, nombre: socio.nombre, apellido: socio.apellidoPaterno },
    totalAportado: Number(totalAportadoRow?.total ?? 0),
    multasPagadas: Number(multasRow?.totalPagado ?? 0),
    saldoPendienteMultas: Number(multasRow?.saldoPendiente ?? 0),
    aportesPendientes: aportesPendientes.length,
    multasPendientesCount: multasPendientes.length,
  });
});

export default reportes;
