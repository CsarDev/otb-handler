import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq, inArray } from 'drizzle-orm';
import type { Aporte, ModalidadPago, Recurrencia } from '@otb/core';
import { cargarPermisosPorEstado, permite } from '../lib/permisos';
import { generarAportes } from '../lib/aportes';

// Router CRUD de definiciones de aporte (`/api/aportes-definicion`). El aporte
// ES la definición (`aportes_definicion`). El `id` es generado por el SERVER
// (UUID, D14): un `id` del body se IGNORA (nunca se valida, nunca se rechaza).
// POST acepta `socioIds?` (asignación directa, D18) y genera los cobros en la
// MISMA transacción para el target set (socioIds ∪ miembros actuales del grupo,
// D15). DELETE conserva el guard 409 (D10): asignaciones en `socio_aportes` O
// registros generados con `aporte_id`.

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

/**
 * Valida `socioIds` (D18): cada id DEBE referenciar un socio existente, si no →
 * 400 ANTES de cualquier insert (sin definición, sin asignación, sin registros).
 * Ausente/null → sin asignación directa; no-array → 400.
 */
function validarSocioIds(body: Record<string, unknown>): { socioIds: string[] } | { error: string; status: 400 } {
  if (body.socioIds === undefined || body.socioIds === null) {
    return { socioIds: [] };
  }
  if (!Array.isArray(body.socioIds)) {
    return { error: 'socioIds must be an array', status: 400 };
  }

  const socioIds = [...new Set(body.socioIds.map(String))];
  if (socioIds.length === 0) return { socioIds: [] };

  const existentes = db
    .select({ id: schema.socios.id })
    .from(schema.socios)
    .where(inArray(schema.socios.id, socioIds))
    .all();
  if (existentes.length !== socioIds.length) {
    return { error: 'socioIds contains an invalid socio', status: 400 };
  }
  return { socioIds };
}

const aportesDefinicion = new Hono();

aportesDefinicion.get('/', (c) => {
  return c.json(db.select().from(schema.aportesDefinicion).all());
});

aportesDefinicion.post('/', async (c) => {
  const body = await c.req.json();

  const v = validarAporte(body);
  if (!v.ok) return c.json({ error: v.error }, 400);

  // D18: validación ANTES de cualquier insert (no definición, no asignación, no registros).
  const sids = validarSocioIds(body);
  if ('error' in sids) return c.json({ error: sids.error }, sids.status);

  // D14: el id SIEMPRE lo genera el server; un `id` del body se IGNORA.
  const id = crypto.randomUUID();
  const socioIds = sids.socioIds;
  const grupoId = v.values.aplicaGrupoId;
  // D12: gestión actual, SIN mes (los endpoints manuales conservan su mes/gestion).
  const gestion = new Date().getFullYear();

  const generados = db.transaction((tx) => {
    // 1) Insertar la definición con el UUID del server.
    tx.insert(schema.aportesDefinicion).values({ id, ...v.values }).run();

    // 2) Asignación directa: socio_aportes para cada socioId (D15 paso 3).
    for (const sid of socioIds) {
      tx.insert(schema.socioAportes).values({ socioId: sid, aporteId: id }).run();
    }

    // 3) Target set = socioIds ∪ miembros ACTUALES del grupo (primario O
    //    adicional), deduplicado por socioId (solape genera una sola vez).
    const target = new Set<string>(socioIds);
    if (grupoId) {
      const primarios = tx
        .select({ id: schema.socios.id })
        .from(schema.socios)
        .where(eq(schema.socios.grupoPrimarioId, grupoId))
        .all();
      for (const p of primarios) target.add(p.id);

      const adicionales = tx
        .select({ socioId: schema.socioGrupos.socioId })
        .from(schema.socioGrupos)
        .where(eq(schema.socioGrupos.grupoId, grupoId))
        .all();
      for (const a of adicionales) target.add(a.socioId);
    }
    const idsTarget = [...target];

    // 4) Socios target + sus grupos adicionales (batch, sin N+1).
    const socios = idsTarget.length
      ? tx
          .select({
            id: schema.socios.id,
            estadoId: schema.socios.estadoId,
            grupoPrimarioId: schema.socios.grupoPrimarioId,
          })
          .from(schema.socios)
          .where(inArray(schema.socios.id, idsTarget))
          .all()
      : [];
    const gruposAdicionales = new Map<string, string[]>();
    if (idsTarget.length) {
      const filasGrupos = tx
        .select({ socioId: schema.socioGrupos.socioId, grupoId: schema.socioGrupos.grupoId })
        .from(schema.socioGrupos)
        .where(inArray(schema.socioGrupos.socioId, idsTarget))
        .all();
      for (const f of filasGrupos) {
        const arr = gruposAdicionales.get(f.socioId) ?? [];
        arr.push(f.grupoId);
        gruposAdicionales.set(f.socioId, arr);
      }
    }

    // 5) Bulk-exclusion (D15): los socios cuyo estado no permite 'aportes'
    //    conservan la asignación pero generan 0 registros; la respuesta es 201
    //    (nunca 409, nunca 400 — a diferencia de /bulk).
    const permisos = cargarPermisosPorEstado();
    const permitidos = socios.filter((s) => permite(permisos, s.estadoId, 'aportes'));

    // 6) Directos: los asignados vía socioIds sostienen la definición por la
    //    join recién insertada; los miembros del grupo la sostienen vía
    //    socioHoldsAporte (join dinámica, D5 — sin filas socio_aportes).
    const directos = new Map<string, string[]>();
    for (const sid of socioIds) directos.set(sid, [id]);

    const defNueva: Aporte = { id, ...v.values };
    return generarAportes(tx, permitidos, [defNueva], directos, gruposAdicionales, gestion);
  });

  // D15: 201 { definiciones: catálogo COMPLETO, generados: solo filas NUEVAS (D13) }.
  return c.json(
    {
      definiciones: db.select().from(schema.aportesDefinicion).all(),
      generados: { count: generados.length, items: generados },
    },
    201,
  );
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

  // PUT es field-edit only (D19): NO acepta socioIds, NO cambia asignaciones,
  // NO genera. Ignora cualquier `id` del body (D14) y actualiza el de la ruta.
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