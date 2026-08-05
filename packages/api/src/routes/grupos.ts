import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq } from 'drizzle-orm';

const grupos = new Hono();

function listaCompleta() {
  return db.select().from(schema.grupos).all();
}

grupos.get('/', (c) => {
  return c.json(listaCompleta());
});

grupos.post('/', async (c) => {
  const body = await c.req.json();

  if (!body.nombre) {
    return c.json({ error: 'nombre is required' }, 400);
  }

  db.insert(schema.grupos)
    .values({
      id: crypto.randomUUID(),
      nombre: body.nombre,
      descripcion: body.descripcion ?? null,
    })
    .run();

  return c.json(listaCompleta(), 201);
});

grupos.put('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = db
    .select({ id: schema.grupos.id })
    .from(schema.grupos)
    .where(eq(schema.grupos.id, id))
    .get();

  if (!existing) return c.json({ error: 'Grupo no encontrado' }, 404);

  db.update(schema.grupos)
    .set({
      ...(body.nombre !== undefined && { nombre: body.nombre }),
      ...(body.descripcion !== undefined && { descripcion: body.descripcion }),
    })
    .where(eq(schema.grupos.id, id))
    .run();

  return c.json(listaCompleta());
});

grupos.delete('/:id', (c) => {
  const { id } = c.req.param();

  const existing = db
    .select({ id: schema.grupos.id })
    .from(schema.grupos)
    .where(eq(schema.grupos.id, id))
    .get();

  if (!existing) return c.json({ error: 'Grupo no encontrado' }, 404);

  // Guard 409: grupo referenciado como primario o en socio_grupos
  const primario = db
    .select({ id: schema.socios.id })
    .from(schema.socios)
    .where(eq(schema.socios.grupoPrimarioId, id))
    .get();

  const adicional = db
    .select({ socioId: schema.socioGrupos.socioId })
    .from(schema.socioGrupos)
    .where(eq(schema.socioGrupos.grupoId, id))
    .get();

  if (primario || adicional) {
    return c.json({ error: 'Cannot delete: group has associated socios' }, 409);
  }

  db.delete(schema.grupos).where(eq(schema.grupos.id, id)).run();

  return c.json(listaCompleta());
});

export default grupos;
