import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq, and, inArray, sql, ne } from 'drizzle-orm';

const estadosSocio = new Hono();

// M:N aplanado: estadoId → accionIds[] (1 query agrupada por estadoId)
function accionIdsPorEstado(): Map<string, string[]> {
  const filas = db
    .select({
      estadoId: schema.estadoAcciones.estadoId,
      accionId: schema.estadoAcciones.accionId,
    })
    .from(schema.estadoAcciones)
    .all();

  const mapa = new Map<string, string[]>();
  for (const f of filas) {
    const arr = mapa.get(f.estadoId) ?? [];
    arr.push(f.accionId);
    mapa.set(f.estadoId, arr);
  }
  return mapa;
}

function listaCompleta() {
  const accionMap = accionIdsPorEstado();
  return db
    .select()
    .from(schema.estadosSocio)
    .orderBy(schema.estadosSocio.orden)
    .all()
    .map((e) => ({ ...e, accionIds: accionMap.get(e.id) ?? [] }));
}

function validarColor(color: unknown): boolean {
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color);
}

function flag01(v: unknown): v is 0 | 1 {
  return v === 0 || v === 1;
}

// Solo UN estado puede tener esDefecto=1 y solo UNO esBaja=1
function validarUnicidadFlag(
  flag: 'esDefecto' | 'esBaja',
  valor: unknown,
  excluirId?: string,
): string | null {
  if (valor !== 1) return null;
  const condicion = excluirId
    ? and(eq(schema.estadosSocio[flag], 1), ne(schema.estadosSocio.id, excluirId))
    : eq(schema.estadosSocio[flag], 1);
  const otro = db.select({ id: schema.estadosSocio.id }).from(schema.estadosSocio).where(condicion).get();
  if (otro) {
    return flag === 'esDefecto'
      ? 'Solo un estado puede ser el estado por defecto (esDefecto)'
      : 'Solo un estado puede ser el estado de baja (esBaja)';
  }
  return null;
}

estadosSocio.get('/', (c) => {
  return c.json(listaCompleta());
});

estadosSocio.post('/', async (c) => {
  const body = await c.req.json();

  if (!body.nombre) return c.json({ error: 'nombre is required' }, 400);
  if (body.color !== undefined && !validarColor(body.color)) {
    return c.json({ error: 'color must be a valid hex value' }, 400);
  }
  for (const flag of ['esActivo', 'esBaja', 'esDefecto'] as const) {
    if (body[flag] !== undefined && !flag01(body[flag])) {
      return c.json({ error: `${flag} must be 0 or 1` }, 400);
    }
  }

  const errorUnicidad = validarUnicidadFlag('esDefecto', body.esDefecto ?? 0) ?? validarUnicidadFlag('esBaja', body.esBaja ?? 0);
  if (errorUnicidad) return c.json({ error: errorUnicidad }, 400);

  // accionIds opcional: default = todas las acciones
  let accionIds: string[] = body.accionIds;
  if (accionIds === undefined) {
    accionIds = db.select({ id: schema.accionesSocio.id }).from(schema.accionesSocio).all().map((a) => a.id);
  } else if (!Array.isArray(accionIds) || accionIds.some((id) => typeof id !== 'string')) {
    return c.json({ error: 'accionIds must be an array of action ids' }, 400);
  }

  // Validar que las acciones existan
  if (accionIds.length > 0) {
    const existentes = db
      .select({ id: schema.accionesSocio.id })
      .from(schema.accionesSocio)
      .where(inArray(schema.accionesSocio.id, accionIds))
      .all();
    if (existentes.length !== accionIds.length) {
      return c.json({ error: 'accionIds contains an invalid action' }, 400);
    }
  }

  // orden = max+1
  const maxRow = db
    .select({ max: sql<number>`MAX(${schema.estadosSocio.orden})` })
    .from(schema.estadosSocio)
    .get();
  const orden = body.orden ?? (maxRow?.max ?? 0) + 1;

  const id = crypto.randomUUID();

  db.transaction((tx) => {
    tx.insert(schema.estadosSocio)
      .values({
        id,
        nombre: body.nombre,
        color: body.color ?? '#22c55e',
        esActivo: body.esActivo ?? 0,
        esBaja: body.esBaja ?? 0,
        esDefecto: body.esDefecto ?? 0,
        orden,
      })
      .run();

    for (const accionId of accionIds) {
      tx.insert(schema.estadoAcciones).values({ estadoId: id, accionId }).run();
    }
  });

  return c.json(listaCompleta(), 201);
});

estadosSocio.put('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = db.select().from(schema.estadosSocio).where(eq(schema.estadosSocio.id, id)).get();
  if (!existing) return c.json({ error: 'Estado not found' }, 404);

  if (body.nombre !== undefined && !body.nombre) return c.json({ error: 'nombre is required' }, 400);
  if (body.color !== undefined && !validarColor(body.color)) {
    return c.json({ error: 'color must be a valid hex value' }, 400);
  }
  for (const flag of ['esActivo', 'esBaja', 'esDefecto'] as const) {
    if (body[flag] !== undefined && !flag01(body[flag])) {
      return c.json({ error: `${flag} must be 0 or 1` }, 400);
    }
  }

  const esDefecto = body.esDefecto !== undefined ? body.esDefecto : existing.esDefecto;
  const esBaja = body.esBaja !== undefined ? body.esBaja : existing.esBaja;
  const errorUnicidad = validarUnicidadFlag('esDefecto', esDefecto, id) ?? validarUnicidadFlag('esBaja', esBaja, id);
  if (errorUnicidad) return c.json({ error: errorUnicidad }, 400);

  db.update(schema.estadosSocio)
    .set({
      ...(body.nombre !== undefined && { nombre: body.nombre }),
      ...(body.color !== undefined && { color: body.color }),
      ...(body.esActivo !== undefined && { esActivo: body.esActivo }),
      ...(body.esBaja !== undefined && { esBaja: body.esBaja }),
      ...(body.esDefecto !== undefined && { esDefecto: body.esDefecto }),
      ...(body.orden !== undefined && { orden: body.orden }),
    })
    .where(eq(schema.estadosSocio.id, id))
    .run();

  return c.json(listaCompleta());
});

estadosSocio.delete('/:id', (c) => {
  const { id } = c.req.param();

  const existing = db.select({ id: schema.estadosSocio.id }).from(schema.estadosSocio).where(eq(schema.estadosSocio.id, id)).get();
  if (!existing) return c.json({ error: 'Estado not found' }, 404);

  const enUso = db
    .select({ id: schema.socios.id })
    .from(schema.socios)
    .where(eq(schema.socios.estadoId, id))
    .get();
  if (enUso) return c.json({ error: 'No se puede eliminar: hay socios usando este estado' }, 409);

  db.transaction((tx) => {
    tx.delete(schema.estadoAcciones).where(eq(schema.estadoAcciones.estadoId, id)).run();
    tx.delete(schema.estadosSocio).where(eq(schema.estadosSocio.id, id)).run();
  });

  return c.json(listaCompleta());
});

// Toggle inline: reemplazo atómico del M:N (delete + insert en tx)
estadosSocio.put('/:id/acciones', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = db.select({ id: schema.estadosSocio.id }).from(schema.estadosSocio).where(eq(schema.estadosSocio.id, id)).get();
  if (!existing) return c.json({ error: 'Estado not found' }, 404);

  const accionIds: unknown = body.accionIds;
  if (!Array.isArray(accionIds) || accionIds.some((a) => typeof a !== 'string')) {
    return c.json({ error: 'accionIds must be an array of action ids' }, 400);
  }

  if (accionIds.length > 0) {
    const existentes = db
      .select({ id: schema.accionesSocio.id })
      .from(schema.accionesSocio)
      .where(inArray(schema.accionesSocio.id, accionIds))
      .all();
    if (existentes.length !== accionIds.length) {
      return c.json({ error: 'accionIds contains an invalid action' }, 400);
    }
  }

  db.transaction((tx) => {
    tx.delete(schema.estadoAcciones).where(eq(schema.estadoAcciones.estadoId, id)).run();
    for (const accionId of accionIds) {
      tx.insert(schema.estadoAcciones).values({ estadoId: id, accionId }).run();
    }
  });

  return c.json(listaCompleta());
});

export default estadosSocio;
