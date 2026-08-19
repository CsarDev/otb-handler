import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq, and, ne } from 'drizzle-orm';
import { authMiddleware, requirePermission } from '../middleware/auth';

const accionesSocio = new Hono();

accionesSocio.use('*', authMiddleware);

function listaCompleta() {
  return db.select().from(schema.accionesSocio).orderBy(schema.accionesSocio.orden).all();
}

function claveEnUso(clave: string, excluirId?: string): boolean {
  const condicion = excluirId
    ? and(eq(schema.accionesSocio.clave, clave), ne(schema.accionesSocio.id, excluirId))
    : eq(schema.accionesSocio.clave, clave);
  return !!db.select({ id: schema.accionesSocio.id }).from(schema.accionesSocio).where(condicion).get();
}

accionesSocio.get('/', requirePermission('socios', 'read'), (c) => {
  return c.json(listaCompleta());
});

accionesSocio.post('/', requirePermission('socios', 'manage'), async (c) => {
  const body = await c.req.json();

  if (!body.clave) return c.json({ error: 'clave is required' }, 400);
  if (!body.nombre) return c.json({ error: 'nombre is required' }, 400);

  if (claveEnUso(body.clave)) {
    return c.json({ error: 'Ya existe una acción con esa clave' }, 409);
  }

  db.insert(schema.accionesSocio)
    .values({
      id: crypto.randomUUID(),
      clave: body.clave,
      nombre: body.nombre,
      descripcion: body.descripcion ?? null,
      orden: body.orden ?? 0,
    })
    .run();

  return c.json(listaCompleta(), 201);
});

accionesSocio.put('/:id', requirePermission('socios', 'manage'), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = db.select().from(schema.accionesSocio).where(eq(schema.accionesSocio.id, id)).get();
  if (!existing) return c.json({ error: 'Acción no encontrada' }, 404);

  if (body.clave !== undefined && !body.clave) return c.json({ error: 'clave is required' }, 400);
  if (body.clave !== undefined && body.clave !== existing.clave && claveEnUso(body.clave, id)) {
    return c.json({ error: 'Ya existe una acción con esa clave' }, 409);
  }

  db.update(schema.accionesSocio)
    .set({
      ...(body.clave !== undefined && { clave: body.clave }),
      ...(body.nombre !== undefined && { nombre: body.nombre }),
      ...(body.descripcion !== undefined && { descripcion: body.descripcion }),
      ...(body.orden !== undefined && { orden: body.orden }),
    })
    .where(eq(schema.accionesSocio.id, id))
    .run();

  return c.json(listaCompleta());
});

accionesSocio.delete('/:id', requirePermission('socios', 'manage'), (c) => {
  const { id } = c.req.param();

  const existing = db.select({ id: schema.accionesSocio.id }).from(schema.accionesSocio).where(eq(schema.accionesSocio.id, id)).get();
  if (!existing) return c.json({ error: 'Acción no encontrada' }, 404);

  const referenciada = db
    .select({ estadoId: schema.estadoAcciones.estadoId })
    .from(schema.estadoAcciones)
    .where(eq(schema.estadoAcciones.accionId, id))
    .get();
  if (referenciada) return c.json({ error: 'No se puede eliminar: hay estados que usan esta acción' }, 409);

  db.delete(schema.accionesSocio).where(eq(schema.accionesSocio.id, id)).run();

  return c.json(listaCompleta());
});

export default accionesSocio;
