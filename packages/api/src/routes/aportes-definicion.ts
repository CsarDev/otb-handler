import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq } from 'drizzle-orm';
import type { ModalidadPago, Recurrencia } from '@otb/core';

// Router CRUD de definiciones de aporte (`/api/aportes-definicion`). El aporte
// ES la definición (`aportes_definicion`), con slug `id` provisto por el cliente
// e inmutable tras la creación (D7). Valida el modelo corregido (D1, D4, D6,
// D7) y guarda el DELETE con 409 cuando la definición tiene referencias
// (D10): asignaciones en `socio_aportes` O registros generados con `aporte_id`.

const recurrencias: Recurrencia[] = ['mensual', 'anual', 'unico', 'extraordinario'];
const modalidades: ModalidadPago[] = ['cuotas', 'parciales', 'pago_unico'];
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

const EN_USO_MSG = 'No se puede eliminar: hay socios o registros usando este aporte';

type ValoresAporte = {
  nombre: string;
  monto: number;
  recurrencia: Recurrencia;
  inicio: string | null;
  fin: string | null;
  modalidadPago: ModalidadPago;
  aplicaGrupoId: string | null;
  activo: number;
};

/**
 * Valida un body de POST/PUT. Comparte la misma lógica en ambos (la task exige
 * que PUT valide igual que POST). Devuelve los valores a persistir o un error.
 */
function validarAporte(
  body: Record<string, unknown>,
): { ok: true; values: ValoresAporte } | { ok: false; error: string } {
  if (typeof body.nombre !== 'string' || body.nombre.trim() === '') {
    return { ok: false, error: 'nombre is required' };
  }

  if (typeof body.monto !== 'number' || Number.isNaN(body.monto) || body.monto < 0) {
    return { ok: false, error: 'monto is required and must be a non-negative number' };
  }

  const recurrencia = (body.recurrencia ?? 'mensual') as Recurrencia; // default 'mensual' (D6)
  if (!recurrencias.includes(recurrencia)) {
    return { ok: false, error: 'recurrencia is invalid' };
  }

  const inicio = body.inicio == null ? null : String(body.inicio);
  const fin = body.fin == null ? null : String(body.fin);
  if (inicio != null && !FECHA_RE.test(inicio)) return { ok: false, error: 'inicio is invalid' };
  if (fin != null && !FECHA_RE.test(fin)) return { ok: false, error: 'fin is invalid' };
  if (inicio != null && fin != null && fin < inicio) {
    return { ok: false, error: 'El periodo de vigencia es inválido (fin debe ser >= inicio)' };
  }

  const modalidadPago = (body.modalidadPago ?? 'cuotas') as ModalidadPago; // default 'cuotas' (D4)
  if (!modalidades.includes(modalidadPago)) {
    return { ok: false, error: 'modalidadPago is invalid' };
  }

  let aplicaGrupoId: string | null = null;
  if (body.aplicaGrupoId != null) {
    aplicaGrupoId = String(body.aplicaGrupoId);
    const grupo = db
      .select({ id: schema.grupos.id })
      .from(schema.grupos)
      .where(eq(schema.grupos.id, aplicaGrupoId))
      .get();
    if (!grupo) return { ok: false, error: 'aplicaGrupoId is invalid' };
  }

  let activo = 1; // default 1
  if (body.activo !== undefined) {
    if (body.activo !== 0 && body.activo !== 1) {
      return { ok: false, error: 'activo is invalid' };
    }
    activo = body.activo;
  }

  return {
    ok: true,
    values: { nombre: body.nombre, monto: body.monto, recurrencia, inicio, fin, modalidadPago, aplicaGrupoId, activo },
  };
}

const aportesDefinicion = new Hono();

aportesDefinicion.get('/', (c) => {
  return c.json(db.select().from(schema.aportesDefinicion).all());
});

aportesDefinicion.post('/', async (c) => {
  const body = await c.req.json();
  const v = validarAporte(body);
  if (!v.ok) return c.json({ error: v.error }, 400);

  // Slug del cliente (D7); si no se provee se genera uno. Duplicado → 400.
  const id = body.id != null && String(body.id).trim() !== '' ? String(body.id) : crypto.randomUUID();
  const duplicado = db
    .select({ id: schema.aportesDefinicion.id })
    .from(schema.aportesDefinicion)
    .where(eq(schema.aportesDefinicion.id, id))
    .get();
  if (duplicado) return c.json({ error: 'Ya existe un aporte con ese id' }, 400);

  db.insert(schema.aportesDefinicion)
    .values({ id, ...v.values })
    .run();

  return c.json(db.select().from(schema.aportesDefinicion).all(), 201);
});

aportesDefinicion.put('/:id', async (c) => {
  const { id } = c.req.param();
  const existing = db
    .select({ id: schema.aportesDefinicion.id })
    .from(schema.aportesDefinicion)
    .where(eq(schema.aportesDefinicion.id, id))
    .get();
  if (!existing) return c.json({ error: 'Aporte definition not found' }, 404);

  const body = await c.req.json();
  const v = validarAporte(body);
  if (!v.ok) return c.json({ error: v.error }, 400);

  // PUT NO renombra el id (D7): ignora cualquier `id` enviado en el body y
  // actualiza el identificado por la ruta.
  db.update(schema.aportesDefinicion)
    .set(v.values)
    .where(eq(schema.aportesDefinicion.id, id))
    .run();

  return c.json(db.select().from(schema.aportesDefinicion).all());
});

aportesDefinicion.delete('/:id', (c) => {
  const { id } = c.req.param();
  const existing = db
    .select({ id: schema.aportesDefinicion.id })
    .from(schema.aportesDefinicion)
    .where(eq(schema.aportesDefinicion.id, id))
    .get();
  if (!existing) return c.json({ error: 'Aporte definition not found' }, 404);

  // Guard 409 (D10): referencias por asignación M:N o por registros generados.
  const asignacion = db
    .select({ socioId: schema.socioAportes.socioId })
    .from(schema.socioAportes)
    .where(eq(schema.socioAportes.aporteId, id))
    .get();
  if (asignacion) return c.json({ error: EN_USO_MSG }, 409);

  const registro = db
    .select({ id: schema.aportes.id })
    .from(schema.aportes)
    .where(eq(schema.aportes.aporteId, id))
    .get();
  if (registro) return c.json({ error: EN_USO_MSG }, 409);

  db.delete(schema.aportesDefinicion)
    .where(eq(schema.aportesDefinicion.id, id))
    .run();

  return c.json(db.select().from(schema.aportesDefinicion).all());
});

export default aportesDefinicion;