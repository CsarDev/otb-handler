import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq, and, getTableColumns, or, inArray } from 'drizzle-orm';
import { cargarPermisosPorEstado, permite, ERROR_PERMISO } from '../lib/permisos';

const asistencia = new Hono();

asistencia.get('/actividad/:actividadId', (c) => {
  const { actividadId } = c.req.param();
  const estadoId = c.req.query('estadoId');
  const grupoId = c.req.query('grupoId');

  const filters: any[] = [eq(schema.asistencia.actividadId, actividadId)];

  if (estadoId) filters.push(eq(schema.socios.estadoId, estadoId));
  if (grupoId) {
    const subquery = db
      .select({ socioId: schema.socioGrupos.socioId })
      .from(schema.socioGrupos)
      .where(eq(schema.socioGrupos.grupoId, grupoId));
    filters.push(or(eq(schema.socios.grupoPrimarioId, grupoId), inArray(schema.socios.id, subquery)));
  }

  const query = db
    .select({ ...getTableColumns(schema.asistencia) })
    .from(schema.asistencia)
    .leftJoin(schema.socios, eq(schema.asistencia.socioId, schema.socios.id));

  return c.json(query.where(and(...filters)).all());
});

asistencia.post('/', async (c) => {
  const body = await c.req.json();

  if (!body.actividadId || !Array.isArray(body.registros)) {
    return c.json({ error: 'actividadId and registros array are required' }, 400);
  }

  const socioIds = body.registros.map((r: { socioId: string }) => r.socioId);

  // Enforcement 'asistencia': batch atómico — si ALGUNO no permite → 409 sin insertar
  const permisos = cargarPermisosPorEstado();
  const socios = db
    .select({ id: schema.socios.id, estadoId: schema.socios.estadoId })
    .from(schema.socios)
    .where(inArray(schema.socios.id, socioIds))
    .all();
  const estadoPorSocio = new Map(socios.map((s) => [s.id, s.estadoId]));

  const noPermitido = body.registros.find(
    (r: { socioId: string }) => !permite(permisos, estadoPorSocio.get(r.socioId) ?? null, 'asistencia'),
  );
  if (noPermitido) return c.json(ERROR_PERMISO, 409);

  const fechaReg = body.fechaReg ?? new Date().toISOString().split('T')[0];

  const records = body.registros.map(
    (r: { socioId: string; tipoAsistencia?: string; minutosTardanza?: number }) => ({
      id: crypto.randomUUID(),
      actividadId: body.actividadId,
      socioId: r.socioId,
      tipoAsistencia: r.tipoAsistencia ?? 'asistio',
      minutosTardanza: r.minutosTardanza ?? 0,
      fechaReg,
    }),
  );

  db.insert(schema.asistencia).values(records).run();

  return c.json(records, 201);
});

asistencia.put('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  delete body.id;

  const existing = db
    .select({ socioId: schema.asistencia.socioId })
    .from(schema.asistencia)
    .where(eq(schema.asistencia.id, id))
    .get();

  if (!existing) return c.json({ error: 'Not found' }, 404);

  // Enforcement 'asistencia'
  const permisos = cargarPermisosPorEstado();
  const socio = db
    .select({ estadoId: schema.socios.estadoId })
    .from(schema.socios)
    .where(eq(schema.socios.id, existing.socioId))
    .get();
  if (!socio) return c.json({ error: 'Socio not found' }, 404);
  if (!permite(permisos, socio.estadoId, 'asistencia')) return c.json(ERROR_PERMISO, 409);

  const result = db
    .update(schema.asistencia)
    .set(body)
    .where(eq(schema.asistencia.id, id))
    .returning()
    .get();

  return c.json(result);
});

export default asistencia;
