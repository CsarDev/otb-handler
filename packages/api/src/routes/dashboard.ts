import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

const dashboard = new Hono();

dashboard.get('/', (c) => {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const gestion = ahora.getFullYear();
  const inicioMes = `${gestion}-${mes}-01`;
  const finMes = `${gestion}-${mes}-31`;

  const ingresos = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.movimientos.monto}), 0)` })
    .from(schema.movimientos)
    .where(eq(schema.movimientos.tipo, 'ingreso'))
    .get();

  const recaudado = Number(ingresos?.total ?? 0);

  const egresosDelMes = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.egresos.monto}), 0)` })
    .from(schema.egresos)
    .where(and(gte(schema.egresos.fecha, inicioMes), lte(schema.egresos.fecha, finMes)))
    .get();

  const egresosMes = Number(egresosDelMes?.total ?? 0);

  const morososResult = db
    .select({ count: sql<number>`COUNT(DISTINCT ${schema.aportes.socioId})` })
    .from(schema.aportes)
    .innerJoin(schema.socios, eq(schema.aportes.socioId, schema.socios.id))
    .where(
      and(
        eq(schema.aportes.estado, 'pendiente'),
        eq(schema.socios.estado, 'activo'),
      ),
    )
    .get();

  const morosos = Number(morososResult?.count ?? 0);

  const multasPendientesResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.multas)
    .where(eq(schema.multas.estado, 'pendiente'))
    .get();

  const multasPendientes = Number(multasPendientesResult?.count ?? 0);

  const totalSociosResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.socios)
    .where(eq(schema.socios.estado, 'activo'))
    .get();

  const totalSocios = Number(totalSociosResult?.count ?? 0);

  const cumpleañosMes = db
    .select()
    .from(schema.socios)
    .where(sql`substr(${schema.socios.fechaNac}, 6, 2) = ${mes}`)
    .all();

  return c.json({
    recaudado,
    morosos,
    multasPendientes,
    egresosMes,
    neto: recaudado - egresosMes,
    totalSocios,
    cumpleañosMes,
  });
});

export default dashboard;
