import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq, and, like, or, inArray } from 'drizzle-orm';
import type { Socio } from '@otb/core';

const socios = new Hono();

// Columnas del socio SIN el legacy `estado` (se dropea en fase 0004),
// más el join a estados_socio para el shape enriquecido de respuesta.
const selectSociosConEstado = () =>
  db
    .select({
      id: schema.socios.id,
      nombre: schema.socios.nombre,
      apellidoPaterno: schema.socios.apellidoPaterno,
      apellidoMaterno: schema.socios.apellidoMaterno,
      ci: schema.socios.ci,
      telefono: schema.socios.telefono,
      email: schema.socios.email,
      ocupacion: schema.socios.ocupacion,
      direccion: schema.socios.direccion,
      fechaNac: schema.socios.fechaNac,
      fechaIng: schema.socios.fechaIng,
      fechaAlta: schema.socios.fechaAlta,
      aporteBase: schema.socios.aporteBase,
      estadoId: schema.socios.estadoId,
      grupoPrimarioId: schema.socios.grupoPrimarioId,
      motivoBaja: schema.socios.motivoBaja,
      fechaBaja: schema.socios.fechaBaja,
      estadoNombre: schema.estadosSocio.nombre,
      estadoColor: schema.estadosSocio.color,
      esActivo: schema.estadosSocio.esActivo,
    })
    .from(schema.socios)
    .leftJoin(schema.estadosSocio, eq(schema.socios.estadoId, schema.estadosSocio.id));

// Grupos adicionales: 2 queries batch (membresías + nombres) adjuntadas en memoria.
// Devuelve socioId → grupos[{ id, nombre }]. Sin N+1.
function gruposPorSocio(ids: string[]): Map<string, { id: string; nombre: string }[]> {
  const mapa = new Map<string, { id: string; nombre: string }[]>();
  if (ids.length === 0) return mapa;

  const membresias = db
    .select({
      socioId: schema.socioGrupos.socioId,
      grupoId: schema.socioGrupos.grupoId,
    })
    .from(schema.socioGrupos)
    .where(inArray(schema.socioGrupos.socioId, ids))
    .all();

  const grupoIds = [...new Set(membresias.map((m) => m.grupoId))];
  const nombres = grupoIds.length
    ? db
        .select({ id: schema.grupos.id, nombre: schema.grupos.nombre })
        .from(schema.grupos)
        .where(inArray(schema.grupos.id, grupoIds))
        .all()
    : [];
  const nombrePorId = new Map(nombres.map((g) => [g.id, g.nombre]));

  for (const m of membresias) {
    const nombre = nombrePorId.get(m.grupoId);
    if (nombre === undefined) continue;
    const arr = mapa.get(m.socioId) ?? [];
    arr.push({ id: m.grupoId, nombre });
    mapa.set(m.socioId, arr);
  }
  return mapa;
}

type QuerySocios = ReturnType<typeof selectSociosConEstado>;
type FilaSocio = Awaited<ReturnType<QuerySocios['all']>>[number];

function armarSocio(
  fila: FilaSocio,
  grupos: Map<string, { id: string; nombre: string }[]>,
): Socio {
  return {
    ...fila,
    esActivo: fila.esActivo ?? 0,
    grupos: grupos.get(fila.id) ?? [],
  };
}

socios.get('/', (c) => {
  const search = c.req.query('search');
  const estadoId = c.req.query('estadoId');
  const grupoId = c.req.query('grupoId');

  const filters: any[] = [];

  if (search) {
    filters.push(
      or(
        like(schema.socios.nombre, `%${search}%`),
        like(schema.socios.apellidoPaterno, `%${search}%`),
      ),
    );
  }
  if (estadoId) {
    filters.push(eq(schema.socios.estadoId, estadoId));
  }
  if (grupoId) {
    // primario OR adicional (subquery evita multiplicación de filas del join)
    const subquery = db
      .select({ socioId: schema.socioGrupos.socioId })
      .from(schema.socioGrupos)
      .where(eq(schema.socioGrupos.grupoId, grupoId));
    filters.push(or(eq(schema.socios.grupoPrimarioId, grupoId), inArray(schema.socios.id, subquery)));
  }

  const query = selectSociosConEstado();
  const filas = filters.length ? query.where(and(...filters)).all() : query.all();

  const grupos = gruposPorSocio(filas.map((f) => f.id));

  return c.json(filas.map((f) => armarSocio(f, grupos)));
});

socios.get('/:id', (c) => {
  const { id } = c.req.param();
  const fila = selectSociosConEstado().where(eq(schema.socios.id, id)).get();

  if (!fila) return c.json({ error: 'Not found' }, 404);

  const grupos = gruposPorSocio([id]);
  return c.json(armarSocio(fila, grupos));
});

// ---- Validaciones compartidas POST/PUT ----

function validarEstadoId(body: Record<string, unknown>): { estadoId: string } | { error: string; status: 400 } {
  if (body.estadoId !== undefined) {
    const existe = db
      .select({ id: schema.estadosSocio.id })
      .from(schema.estadosSocio)
      .where(eq(schema.estadosSocio.id, String(body.estadoId)))
      .get();
    if (!existe) return { error: 'estadoId is invalid', status: 400 };
    return { estadoId: String(body.estadoId) };
  }

  // Sin estadoId → esDefecto
  const defecto = db
    .select({ id: schema.estadosSocio.id })
    .from(schema.estadosSocio)
    .where(eq(schema.estadosSocio.esDefecto, 1))
    .get();
  if (!defecto) return { error: 'No hay un estado por defecto configurado', status: 400 };
  return { estadoId: defecto.id };
}

function validarGrupos(body: Record<string, unknown>): { grupoPrimarioId?: string; grupoAdicionalIds?: string[] } | { error: string; status: 400 } {
  let grupoPrimarioId: string | undefined;
  if (body.grupoPrimarioId !== undefined) {
    const existe = db
      .select({ id: schema.grupos.id })
      .from(schema.grupos)
      .where(eq(schema.grupos.id, String(body.grupoPrimarioId)))
      .get();
    if (!existe) return { error: 'grupoPrimarioId is invalid', status: 400 };
    grupoPrimarioId = String(body.grupoPrimarioId);
  }

  let grupoAdicionalIds: string[] | undefined;
  if (body.grupoAdicionalIds !== undefined) {
    if (!Array.isArray(body.grupoAdicionalIds)) {
      return { error: 'grupoAdicionalIds must be an array', status: 400 };
    }
    grupoAdicionalIds = body.grupoAdicionalIds.map(String);
    if (grupoAdicionalIds.length > 0) {
      const existentes = db
        .select({ id: schema.grupos.id })
        .from(schema.grupos)
        .where(inArray(schema.grupos.id, grupoAdicionalIds))
        .all();
      if (existentes.length !== grupoAdicionalIds.length) {
        return { error: 'grupoAdicionalIds contains an invalid group', status: 400 };
      }
    }
  }

  // Invariante: primario ∉ adicionales
  if (grupoPrimarioId && grupoAdicionalIds?.includes(grupoPrimarioId)) {
    return { error: 'El grupo primario no puede estar entre los grupos adicionales', status: 400 };
  }

  return { grupoPrimarioId, grupoAdicionalIds };
}

// Campos editables del socio (whitelist: excluye id, estadoId, grupos, baja)
function camposSocio(body: Record<string, unknown>): Partial<typeof schema.socios.$inferInsert> {
  const campos: Partial<typeof schema.socios.$inferInsert> = {};
  const editables = [
    'nombre',
    'apellidoPaterno',
    'apellidoMaterno',
    'ci',
    'telefono',
    'email',
    'ocupacion',
    'direccion',
    'fechaNac',
    'fechaIng',
    'fechaAlta',
    'aporteBase',
  ] as const;
  for (const k of editables) {
    const v = body[k];
    if (v !== undefined) {
      (campos as Record<string, unknown>)[k] = v;
    }
  }
  return campos;
}

socios.post('/', async (c) => {
  const body = await c.req.json();

  if (!body.nombre || !body.apellidoPaterno) {
    return c.json({ error: 'nombre and apellidoPaterno are required' }, 400);
  }

  const estado = validarEstadoId(body);
  if ('error' in estado) return c.json({ error: estado.error }, estado.status);

  const grupos = validarGrupos(body);
  if ('error' in grupos) return c.json({ error: grupos.error }, grupos.status);

  const id = crypto.randomUUID();

  const values = {
    id,
    ...camposSocio(body),
    estadoId: estado.estadoId,
    ...(grupos.grupoPrimarioId ? { grupoPrimarioId: grupos.grupoPrimarioId } : {}),
  } as typeof schema.socios.$inferInsert;

  db.transaction((tx) => {
    tx.insert(schema.socios)
      .values(values)
      .run();

    for (const grupoId of grupos.grupoAdicionalIds ?? []) {
      tx.insert(schema.socioGrupos).values({ socioId: id, grupoId }).run();
    }
  });

  const fila = selectSociosConEstado().where(eq(schema.socios.id, id)).get()!;
  const gruposMap = gruposPorSocio([id]);
  return c.json(armarSocio(fila, gruposMap), 201);
});

socios.put('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = db.select({ id: schema.socios.id }).from(schema.socios).where(eq(schema.socios.id, id)).get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const estado = validarEstadoId(body);
  if ('error' in estado) return c.json({ error: estado.error }, estado.status);

  const grupos = validarGrupos(body);
  if ('error' in grupos) return c.json({ error: grupos.error }, grupos.status);

  db.transaction((tx) => {
    tx.update(schema.socios)
      .set({
        ...camposSocio(body),
        estadoId: estado.estadoId,
        // conserva grupoPrimarioId si no se envía
        ...(grupos.grupoPrimarioId !== undefined ? { grupoPrimarioId: grupos.grupoPrimarioId } : {}),
      })
      .where(eq(schema.socios.id, id))
      .run();

    // Reemplazo atómico de grupos adicionales: SOLO cuando el body los declara.
    // Si el cliente no envía grupoAdicionalIds (update parcial), se preservan
    // las membresías existentes en vez de borrarlas silenciosamente.
    if (grupos.grupoAdicionalIds !== undefined) {
      tx.delete(schema.socioGrupos).where(eq(schema.socioGrupos.socioId, id)).run();
      for (const grupoId of grupos.grupoAdicionalIds) {
        tx.insert(schema.socioGrupos).values({ socioId: id, grupoId }).run();
      }
    }
  });

  const fila = selectSociosConEstado().where(eq(schema.socios.id, id)).get()!;
  const gruposMap = gruposPorSocio([id]);
  return c.json(armarSocio(fila, gruposMap));
});

socios.post('/:id/baja', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  const socio = db.select().from(schema.socios).where(eq(schema.socios.id, id)).get();
  if (!socio) return c.json({ error: 'Not found' }, 404);

  if (!body.motivo || typeof body.motivo !== 'string' || !body.motivo.trim()) {
    return c.json({ error: 'motivo is required' }, 400);
  }

  const estadoBaja = db
    .select()
    .from(schema.estadosSocio)
    .where(eq(schema.estadosSocio.esBaja, 1))
    .get();
  if (!estadoBaja) return c.json({ error: 'No hay un estado de baja configurado' }, 400);

  if (socio.estadoId === estadoBaja.id) {
    return c.json({ error: 'El socio ya está dado de baja' }, 400);
  }

  db.update(schema.socios)
    .set({
      estadoId: estadoBaja.id,
      motivoBaja: body.motivo,
      fechaBaja: new Date().toISOString().split('T')[0],
    })
    .where(eq(schema.socios.id, id))
    .run();

  const fila = selectSociosConEstado().where(eq(schema.socios.id, id)).get()!;
  const gruposMap = gruposPorSocio([id]);
  return c.json(armarSocio(fila, gruposMap));
});

// Soft delete: solo cambia estadoId → esBaja (motivoBaja/fechaBaja quedan null)
socios.delete('/:id', (c) => {
  const { id } = c.req.param();

  const existing = db.select({ id: schema.socios.id }).from(schema.socios).where(eq(schema.socios.id, id)).get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const estadoBaja = db
    .select({ id: schema.estadosSocio.id })
    .from(schema.estadosSocio)
    .where(eq(schema.estadosSocio.esBaja, 1))
    .get();
  if (!estadoBaja) return c.json({ error: 'No hay un estado de baja configurado' }, 400);

  db.update(schema.socios)
    .set({ estadoId: estadoBaja.id })
    .where(eq(schema.socios.id, id))
    .run();

  return c.body(null, 204);
});

export default socios;
