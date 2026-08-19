import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq, inArray } from 'drizzle-orm';
import type { Aporte, ModalidadPago, Recurrencia } from '@otb/core';
import { cargarPermisosPorEstado, permite } from '../lib/permisos';
import { generarAportes, grupoIdsPorDefinicion } from '../lib/aportes';
import { authMiddleware, requirePermission } from '../middleware/auth';

// Router CRUD de definiciones de aporte (`/api/aportes-definicion`). El aporte
// ES la definición (`aportes_definicion`). El `id` es generado por el SERVER
// (UUID, D14): un `id` del body se IGNORA (nunca se valida, nunca se rechaza).
// POST acepta `socioIds?` (D18) y `grupoIds?` (D26, M:N — cada id debe existir)
// y genera los cobros en la MISMA transacción para el target set = unión
// deduplicada de socioIds ∪ miembros ACTUALES (primario O adicional) de TODOS
// los grupoIds. PUT (D27, SUPERSEDE D19) acepta `socioIds?`/`grupoIds?` con
// replace-when-declared / preserve-when-omitted (espejo del PUT de socios),
// genera SOLO los registros faltantes y NUNCA borra registros generados;
// responde `{ definiciones, generados }` (200). GET / hidrata `grupoIds` +
// `socioIds` por definición (D28, batch sin N+1) para el pre-fill de edición.
// DELETE conserva el guard 409 (D10): asignaciones en `socio_aportes` O
// registros generados con `aporte_id`; las filas de la join M:N se limpian en
// la MISMA transacción (son metadata de la definición, NO trigger de 409).

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
  grupoIds: string[]; // M:N vía aportes_definicion_grupos; [] = global (D23/D26)
  activo: number;
};

/**
 * Valida un body de POST/PUT. Comparte la misma lógica en ambos (la task exige
 * que PUT valide igual que POST). Devuelve los valores a persistir o un error.
 * `grupoIds` se valida aquí (cada id debe existir → 400) pero NO es una columna:
 * la ruta lo persiste vía la join y lo separa del update escalar.
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

  let activo = 1; // default 1
  if (body.activo !== undefined) {
    if (body.activo !== 0 && body.activo !== 1) {
      return { ok: false, error: 'activo is invalid' };
    }
    activo = body.activo;
  }

  // grupoIds: ausente/null/[] → [] (global); no-array → 400; cada id DEBE
  // existir en `grupos` (lote único, sin N+1) antes de cualquier insert (D26).
  let grupoIds: string[] = [];
  if (body.grupoIds !== undefined && body.grupoIds !== null) {
    if (!Array.isArray(body.grupoIds)) {
      return { ok: false, error: 'grupoIds must be an array' };
    }
    grupoIds = [...new Set(body.grupoIds.map(String))];
    if (grupoIds.length > 0) {
      const existentes = db
        .select({ id: schema.grupos.id })
        .from(schema.grupos)
        .where(inArray(schema.grupos.id, grupoIds))
        .all();
      if (existentes.length !== grupoIds.length) {
        return { ok: false, error: 'grupoIds contains an invalid group' };
      }
    }
  }

  return {
    ok: true,
    values: { nombre: body.nombre, monto: body.monto, recurrencia, inicio, fin, modalidadPago, grupoIds, activo },
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

/**
 * socioId → aporteIds (batch, sin N+1, D28): `aporteId → socioId[]` invertido
 * sobre `socio_aportes` para hidratar `socioIds` en el catálogo.
 */
function socioIdsPorDefinicion(ids: string[]): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  if (ids.length === 0) return mapa;
  const filas = db
    .select({ aporteId: schema.socioAportes.aporteId, socioId: schema.socioAportes.socioId })
    .from(schema.socioAportes)
    .where(inArray(schema.socioAportes.aporteId, ids))
    .all();
  for (const f of filas) {
    const arr = mapa.get(f.aporteId) ?? [];
    arr.push(f.socioId);
    mapa.set(f.aporteId, arr);
  }
  return mapa;
}

/**
 * Catálogo COMPLETO hidratado con `grupoIds` y `socioIds` por definición
 * (batch, sin N+1 — D28). Se usa en GET / y en las respuestas de POST/PUT.
 */
function catalogoHidratado(): Aporte[] {
  const defs = db.select().from(schema.aportesDefinicion).all() as unknown as Aporte[];
  const ids = defs.map((d) => d.id);
  const grupoIdsPorDef = grupoIdsPorDefinicion(ids);
  const socioIdsPorDef = socioIdsPorDefinicion(ids);
  return defs.map((d) => ({
    ...d,
    grupoIds: grupoIdsPorDef.get(d.id) ?? [],
    socioIds: socioIdsPorDef.get(d.id) ?? [],
  }));
}

const aportesDefinicion = new Hono();

aportesDefinicion.use('*', authMiddleware);

aportesDefinicion.get('/', requirePermission('aportes', 'read'), (c) => {
  return c.json(catalogoHidratado());
});

aportesDefinicion.post('/', requirePermission('aportes', 'create'), async (c) => {
  const body = await c.req.json();

  const v = validarAporte(body);
  if (!v.ok) return c.json({ error: v.error }, 400);

  // D18: validación ANTES de cualquier insert (no definición, no asignación, no registros).
  const sids = validarSocioIds(body);
  if ('error' in sids) return c.json({ error: sids.error }, sids.status);

  // D14: el id SIEMPRE lo genera el server; un `id` del body se IGNORA.
  const id = crypto.randomUUID();
  const socioIds = sids.socioIds;
  const grupoIds = v.values.grupoIds;
  // D12: gestión actual, SIN mes (los endpoints manuales conservan su mes/gestion).
  const gestion = new Date().getFullYear();

  const generados = db.transaction((tx) => {
    // 1) Insertar la definición con el UUID del server (grupoIds NO es columna).
    const { grupoIds: _g, ...escalares } = v.values;
    tx.insert(schema.aportesDefinicion).values({ id, ...escalares }).run();

    // 2) Asignación directa: socio_aportes para cada socioId (D15 paso 3).
    for (const sid of socioIds) {
      tx.insert(schema.socioAportes).values({ socioId: sid, aporteId: id }).run();
    }

    // 3) Join M:N: una fila por grupoId (D26). La join queda dinámica: NO
    //    materializa socio_aportes para los miembros del grupo.
    for (const gid of grupoIds) {
      tx.insert(schema.aportesDefinicionGrupos).values({ definitionId: id, grupoId: gid }).run();
    }

    // 4) Target set = socioIds ∪ miembros ACTUALES (primario O adicional) de
    //    TODOS los grupoIds, deduplicado por socio (solape genera una sola vez).
    const target = new Set<string>(socioIds);
    for (const gid of grupoIds) {
      const primarios = tx
        .select({ id: schema.socios.id })
        .from(schema.socios)
        .where(eq(schema.socios.grupoPrimarioId, gid))
        .all();
      for (const p of primarios) target.add(p.id);

      const adicionales = tx
        .select({ socioId: schema.socioGrupos.socioId })
        .from(schema.socioGrupos)
        .where(eq(schema.socioGrupos.grupoId, gid))
        .all();
      for (const a of adicionales) target.add(a.socioId);
    }
    const idsTarget = [...target];

    // 5) Socios target + sus grupos adicionales (batch, sin N+1).
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

    // 6) Bulk-exclusion (D15): los socios cuyo estado no permite 'aportes'
    //    conservan la asignación pero generan 0 registros; la respuesta es 201
    //    (nunca 409, nunca 400 — a diferencia de /bulk).
    const permisos = cargarPermisosPorEstado();
    const permitidos = socios.filter((s) => permite(permisos, s.estadoId, 'aportes'));

    // 7) Directos: los asignados vía socioIds sostienen la definición por la
    //    join recién insertada; los miembros del grupo la sostienen vía
    //    socioHoldsAporte (join dinámica, D5 — sin filas socio_aportes).
    const directos = new Map<string, string[]>();
    for (const sid of socioIds) directos.set(sid, [id]);

    const defNueva: Aporte = { id, ...v.values };
    return generarAportes(tx, permitidos, [defNueva], directos, gruposAdicionales, gestion);
  });

  // D15: 201 { definiciones: catálogo COMPLETO hidratado, generados: solo filas NUEVAS (D13) }.
  return c.json(
    {
      definiciones: catalogoHidratado(),
      generados: { count: generados.length, items: generados },
    },
    201,
  );
});

aportesDefinicion.put('/:id', requirePermission('aportes', 'update'), async (c) => {
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

  // D18: validación de socioIds (si el body la declara) ANTES de la transacción.
  const sids = validarSocioIds(body);
  if ('error' in sids) return c.json({ error: sids.error }, sids.status);

  // D27 (SUPERSEDE D19): replace-when-declared / preserve-when-omitted.
  // Sets FINALES en memoria: declarado ?? preservado (estado actual de la DB).
  const finalSocioIds =
    body.socioIds !== undefined
      ? sids.socioIds
      : db
          .select({ socioId: schema.socioAportes.socioId })
          .from(schema.socioAportes)
          .where(eq(schema.socioAportes.aporteId, id))
          .all()
          .map((r) => r.socioId);
  const finalGrupoIds =
    body.grupoIds !== undefined
      ? v.values.grupoIds
      : db
          .select({ grupoId: schema.aportesDefinicionGrupos.grupoId })
          .from(schema.aportesDefinicionGrupos)
          .where(eq(schema.aportesDefinicionGrupos.definitionId, id))
          .all()
          .map((r) => r.grupoId);

  const socioIdsDeclarados = body.socioIds !== undefined;
  const grupoIdsDeclarados = body.grupoIds !== undefined;

  const gestion = new Date().getFullYear(); // D12: gestión actual, sin mes

  const generados = db.transaction((tx) => {
    // 1) Update de campos escalares (validado; grupoIds NO es columna, se
    //    persiste vía la join; un `id` del body se IGNORA, D14).
    const { grupoIds: _g, ...escalares } = v.values;
    tx.update(schema.aportesDefinicion)
      .set(escalares)
      .where(eq(schema.aportesDefinicion.id, id))
      .run();

    // 2) Reemplazo atómico de socio_aportes: SOLO cuando el body declara
    //    `socioIds` (D27, espejo del PUT de socios).
    if (socioIdsDeclarados) {
      tx.delete(schema.socioAportes).where(eq(schema.socioAportes.aporteId, id)).run();
      for (const sid of finalSocioIds) {
        tx.insert(schema.socioAportes).values({ socioId: sid, aporteId: id }).run();
      }
    }

    // 3) Reemplazo atómico de la join M:N: SOLO cuando el body declara
    //    `grupoIds`. Si se omite, se preserva la aplicación vigente.
    if (grupoIdsDeclarados) {
      tx.delete(schema.aportesDefinicionGrupos).where(eq(schema.aportesDefinicionGrupos.definitionId, id)).run();
      for (const gid of finalGrupoIds) {
        tx.insert(schema.aportesDefinicionGrupos).values({ definitionId: id, grupoId: gid }).run();
      }
    }

    // 4) Target set = finalSocioIds ∪ miembros ACTUALES de TODOS los
    //    finalGrupoIds, deduplicado por socio.
    const target = new Set<string>(finalSocioIds);
    for (const gid of finalGrupoIds) {
      const primarios = tx
        .select({ id: schema.socios.id })
        .from(schema.socios)
        .where(eq(schema.socios.grupoPrimarioId, gid))
        .all();
      for (const p of primarios) target.add(p.id);

      const adicionales = tx
        .select({ socioId: schema.socioGrupos.socioId })
        .from(schema.socioGrupos)
        .where(eq(schema.socioGrupos.grupoId, gid))
        .all();
      for (const a of adicionales) target.add(a.socioId);
    }
    const idsTarget = [...target];

    // 5) Socios target + grupos adicionales (batch).
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

    // 6) Bulk-exclusion: los socios no permitidos conservan la asignación
    //    pero generan 0 registros (201/200, nunca 409).
    const permisos = cargarPermisosPorEstado();
    const permitidos = socios.filter((s) => permite(permisos, s.estadoId, 'aportes'));

    // 7) defNueva hidratada con el estado FINAL de la join: socioHoldsAporte
    //    evalúa correctamente a los miembros group-only. Directos vía mapa.
    const directos = new Map<string, string[]>();
    for (const sid of finalSocioIds) directos.set(sid, [id]);

    const defNueva: Aporte = { id, ...v.values, grupoIds: finalGrupoIds };
    // D27: genera SOLO los registros FALTANTES (D13); removals NUNCA borran.
    return generarAportes(tx, permitidos, [defNueva], directos, gruposAdicionales, gestion);
  });

  // D27: 200 { definiciones: catálogo hidratado, generados: solo filas NUEVAS }.
  return c.json({
    definiciones: catalogoHidratado(),
    generados: { count: generados.length, items: generados },
  });
});

aportesDefinicion.delete('/:id', requirePermission('aportes', 'delete'), (c) => {
  const { id } = c.req.param();
  const existing = db
    .select({ id: schema.aportesDefinicion.id })
    .from(schema.aportesDefinicion)
    .where(eq(schema.aportesDefinicion.id, id))
    .get();
  if (!existing) return c.json({ error: 'Aporte definition not found' }, 404);

  // Guard 409 (D10): referencias por asignación M:N o por registros generados.
  // Las filas de `aportes_definicion_grupos` son metadata de la definición y NO
  // disparan 409 (se limpian en la misma transacción, D28).
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

  // D28: limpieza de la join M:N en la MISMA transacción antes de borrar la
  // definición (con foreign_keys=ON y ON DELETE no action, borrar el padre con
  // filas de la join lanzaría una violación de FK).
  db.transaction((tx) => {
    tx.delete(schema.aportesDefinicionGrupos).where(eq(schema.aportesDefinicionGrupos.definitionId, id)).run();
    tx.delete(schema.aportesDefinicion).where(eq(schema.aportesDefinicion.id, id)).run();
  });

  return c.json(catalogoHidratado());
});

export default aportesDefinicion;
