import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq, and, like, or, inArray, sql } from 'drizzle-orm';
import type { Aporte, AporteInherited, Socio } from '@otb/core';
import { cargarPermisosPorEstado, permite } from '../lib/permisos';
import { generarAportes, definicionesPorIds, definicionesDeGrupos } from '../lib/aportes';

const socios = new Hono();

// Columnas del socio SIN el legacy `estado` (se dropea en fase 0004) y SIN el
// legacy `tipoAporteId`/`aporteBase` (modelo corregido D1): el socio ya no tiene
// un único tipo; las asignaciones de aporte viven en `socio_aportes` (directas,
// `aporteIds`) y la herencia por grupo se resuelve dinámicamente en lectura (D5).
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

// Asignaciones DIRECTAS de aporte: socioId → aporteIds (desde socio_aportes).
// Query batch para listas, sin N+1.
function aportesDirectosPorSocio(ids: string[]): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  if (ids.length === 0) return mapa;

  const filas = db
    .select({
      socioId: schema.socioAportes.socioId,
      aporteId: schema.socioAportes.aporteId,
    })
    .from(schema.socioAportes)
    .where(inArray(schema.socioAportes.socioId, ids))
    .orderBy(sql`rowid`) // orden de inserción (el orden enviado en POST)
    .all();

  for (const f of filas) {
    const arr = mapa.get(f.socioId) ?? [];
    arr.push(f.aporteId);
    mapa.set(f.socioId, arr);
  }
  return mapa;
}

// Aportes HEREDADOS por grupo, resueltos dinámicamente (D5): definiciones cuyo
// `aplicaGrupoId` ∈ { grupoPrimarioId ∪ grupos adicionales } del socio, con el
// nombre del grupo que las aplica (join a `grupos`). Batch para listas, sin N+1.
// La dedup contra asignaciones directas se hace en `armarSocio`.
function aportesInheritedPorSocio(
  filas: FilaSocio[],
  grupos: Map<string, { id: string; nombre: string }[]>,
): Map<string, AporteInherited[]> {
  const mapa = new Map<string, AporteInherited[]>();
  if (filas.length === 0) return mapa;

  const grupoIds = new Set<string>();
  for (const f of filas) {
    if (f.grupoPrimarioId) grupoIds.add(f.grupoPrimarioId);
    for (const g of grupos.get(f.id) ?? []) grupoIds.add(g.id);
  }
  if (grupoIds.size === 0) return mapa;

  const defs = db
    .select({
      id: schema.aportesDefinicion.id,
      nombre: schema.aportesDefinicion.nombre,
      grupoId: schema.aportesDefinicion.aplicaGrupoId,
      grupoNombre: schema.grupos.nombre,
    })
    .from(schema.aportesDefinicion)
    .innerJoin(schema.grupos, eq(schema.aportesDefinicion.aplicaGrupoId, schema.grupos.id))
    .where(inArray(schema.aportesDefinicion.aplicaGrupoId, [...grupoIds]))
    .all();

  const defsPorGrupo = new Map<string, AporteInherited[]>();
  for (const d of defs) {
    if (!d.grupoId) continue;
    const arr = defsPorGrupo.get(d.grupoId) ?? [];
    arr.push({ id: d.id, nombre: d.nombre, grupoId: d.grupoId, grupoNombre: d.grupoNombre ?? '' });
    defsPorGrupo.set(d.grupoId, arr);
  }

  for (const f of filas) {
    const grupoIdsDelSocio = new Set<string>();
    if (f.grupoPrimarioId) grupoIdsDelSocio.add(f.grupoPrimarioId);
    for (const g of grupos.get(f.id) ?? []) grupoIdsDelSocio.add(g.id);

    // dedup por id de definición: una definición aplica por un único grupo
    const set = new Map<string, AporteInherited>();
    for (const gid of grupoIdsDelSocio) {
      for (const d of defsPorGrupo.get(gid) ?? []) set.set(d.id, d);
    }
    mapa.set(f.id, [...set.values()]);
  }
  return mapa;
}

type QuerySocios = ReturnType<typeof selectSociosConEstado>;
type FilaSocio = Awaited<ReturnType<QuerySocios['all']>>[number];

// El shape de salida expone las asignaciones DIRECTAS (`aporteIds`, editables)
// y los aportes HEREDADOS por grupo (`aportesInherited`, read-only, D5).
// La dedup es: una definición asignada directamente NO se repite en inherited.
function armarSocio(
  fila: FilaSocio,
  grupos: Map<string, { id: string; nombre: string }[]>,
  aporteIds: string[],
  inherited: AporteInherited[],
): Socio {
  const directos = new Set(aporteIds);
  return {
    ...fila,
    aporteIds,
    aportesInherited: inherited.filter((i) => !directos.has(i.id)),
    esActivo: fila.esActivo ?? 0,
    grupos: grupos.get(fila.id) ?? [],
  };
}

/**
 * Unión de las definiciones que aplican al socio tras el guardado (D16):
 * directas (`definicionesPorIds`, activas) + group-scoped de la membresía final
 * (`definicionesDeGrupos`, D20), deduplicadas por id de definición.
 */
function definicionesFinales(
  aporteIds: string[],
  grupoPrimarioId: string | null,
  grupoAdicionalIds: string[],
): Aporte[] {
  const porId = new Map<string, Aporte>();
  for (const d of definicionesPorIds(aporteIds)) porId.set(d.id, d);

  const grupoIds = new Set<string>();
  if (grupoPrimarioId) grupoIds.add(grupoPrimarioId);
  for (const g of grupoAdicionalIds) grupoIds.add(g);
  for (const d of definicionesDeGrupos([...grupoIds])) porId.set(d.id, d);

  return [...porId.values()];
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

  const ids = filas.map((f) => f.id);
  const grupos = gruposPorSocio(ids);
  const directos = aportesDirectosPorSocio(ids);
  const inherited = aportesInheritedPorSocio(filas, grupos);

  return c.json(filas.map((f) => armarSocio(f, grupos, directos.get(f.id) ?? [], inherited.get(f.id) ?? [])));
});

socios.get('/:id', (c) => {
  const { id } = c.req.param();
  const fila = selectSociosConEstado().where(eq(schema.socios.id, id)).get();

  if (!fila) return c.json({ error: 'Not found' }, 404);

  const grupos = gruposPorSocio([id]);
  const directos = aportesDirectosPorSocio([id]);
  const inherited = aportesInheritedPorSocio([fila], grupos);
  return c.json(armarSocio(fila, grupos, directos.get(id) ?? [], inherited.get(id) ?? []));
});

// ---- Validaciones compartidas POST/PUT ----

// Validación de `aporteIds` (spec socios-estados, multiselect):
// - ausente/null → [] (sin asignaciones directas; NO hay default-type fallback);
// - presente pero NO array → 400 "aporteIds must be an array";
// - cada id debe existir en `aportes_definicion` Y estar activo (400 si no).
function validarAporteIds(body: Record<string, unknown>): { aporteIds: string[] } | { error: string; status: 400 } {
  if (body.aporteIds === undefined || body.aporteIds === null) {
    return { aporteIds: [] };
  }
  if (!Array.isArray(body.aporteIds)) {
    return { error: 'aporteIds must be an array', status: 400 };
  }

  const aporteIds = [...new Set(body.aporteIds.map(String))];
  if (aporteIds.length === 0) return { aporteIds: [] };

  const filas = db
    .select({ id: schema.aportesDefinicion.id, activo: schema.aportesDefinicion.activo })
    .from(schema.aportesDefinicion)
    .where(inArray(schema.aportesDefinicion.id, aporteIds))
    .all();
  const activoPorId = new Map(filas.map((f) => [f.id, f.activo]));

  for (const id of aporteIds) {
    const activo = activoPorId.get(id);
    if (activo === undefined) {
      return { error: 'aporteIds contains an invalid aporte', status: 400 };
    }
    if (activo !== 1) {
      return { error: 'aporteIds contains an inactive aporte', status: 400 };
    }
  }
  return { aporteIds };
}

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

// Campos editables del socio (whitelist: excluye id, estadoId, grupos, baja y
// cualquier campo legacy de aporte — el monto ya NO es escribible; los aportes
// se asignan por `aporteIds`).
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

  const aportes = validarAporteIds(body);
  if ('error' in aportes) return c.json({ error: aportes.error }, aportes.status);

  const grupos = validarGrupos(body);
  if ('error' in grupos) return c.json({ error: grupos.error }, grupos.status);

  const id = crypto.randomUUID();

  const values = {
    id,
    ...camposSocio(body),
    estadoId: estado.estadoId,
    ...(grupos.grupoPrimarioId ? { grupoPrimarioId: grupos.grupoPrimarioId } : {}),
  } as typeof schema.socios.$inferInsert;

  // Sets FINALES del socio (POST: los declarados; no hay preservación).
  const finalAporteIds = aportes.aporteIds;
  const finalGrupoPrimario = grupos.grupoPrimarioId ?? null;
  const finalGrupoAdicionales = grupos.grupoAdicionalIds ?? [];
  const finalEstadoId = estado.estadoId;

  const generados = db.transaction((tx) => {
    tx.insert(schema.socios)
      .values(values)
      .run();

    for (const grupoId of finalGrupoAdicionales) {
      tx.insert(schema.socioGrupos).values({ socioId: id, grupoId }).run();
    }

    // Asignaciones directas de aporte (multiselect, patrón socio_grupos).
    // Ausente/vacío → [] sin filas (no hay default-type fallback).
    for (const aporteId of finalAporteIds) {
      tx.insert(schema.socioAportes).values({ socioId: id, aporteId }).run();
    }

    // D16: generación en la MISMA transacción, sobre la unión (directa ∪ grupo)
    // del set final. Dedup → solo filas faltantes; socio no permitido → 0
    // registros, sin 409 (bulk-exclusion, D9).
    const permisos = cargarPermisosPorEstado();
    if (permite(permisos, finalEstadoId, 'aportes')) {
      const definiciones = definicionesFinales(finalAporteIds, finalGrupoPrimario, finalGrupoAdicionales);
      const socio = { id, estadoId: finalEstadoId, grupoPrimarioId: finalGrupoPrimario };
      return generarAportes(
        tx,
        [socio],
        definiciones,
        new Map([[id, finalAporteIds]]),
        new Map([[id, finalGrupoAdicionales]]),
        new Date().getFullYear(), // D12: gestión actual, sin mes
      );
    }
    return [];
  });

  const fila = selectSociosConEstado().where(eq(schema.socios.id, id)).get()!;
  const gruposMap = gruposPorSocio([id]);
  const directos = aportesDirectosPorSocio([id]);
  const inherited = aportesInheritedPorSocio([fila], gruposMap);
  // D16: shape estándar + generados (solo filas NUEVAS).
  return c.json(
    {
      ...armarSocio(fila, gruposMap, directos.get(id) ?? [], inherited.get(id) ?? []),
      generados: { count: generados.length },
    },
    201,
  );
});

socios.put('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = db
    .select({
      id: schema.socios.id,
      estadoId: schema.socios.estadoId,
      grupoPrimarioId: schema.socios.grupoPrimarioId,
    })
    .from(schema.socios)
    .where(eq(schema.socios.id, id))
    .get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const grupos = validarGrupos(body);
  if ('error' in grupos) return c.json({ error: grupos.error }, grupos.status);

  // Update parcial: estadoId solo se cambia si se envía explícitamente; si se omite,
  // se preserva el estado vigente (no se resetea a esDefecto silenciosamente).
  let estadoId: string | undefined;
  if (body.estadoId !== undefined) {
    const estado = validarEstadoId(body);
    if ('error' in estado) return c.json({ error: estado.error }, estado.status);
    estadoId = estado.estadoId;
  }

  // aporteIds: parcial — SOLO si el body lo declara se reemplaza el set de
  // asignaciones directas (atómico, en la misma transacción). Si se omite, se
  // preservan las asignaciones vigentes (spec: PUT preserve).
  let aporteIds: string[] | undefined;
  if (body.aporteIds !== undefined) {
    const aportes = validarAporteIds(body);
    if ('error' in aportes) return c.json({ error: aportes.error }, aportes.status);
    aporteIds = aportes.aporteIds;
  }

  // Sets FINALES en memoria (D16): declarado ?? preservado. La generación corre
  // sobre estos sets dentro de la transacción de persistencia.
  const finalAporteIds =
    aporteIds ??
    db
      .select({ aporteId: schema.socioAportes.aporteId })
      .from(schema.socioAportes)
      .where(eq(schema.socioAportes.socioId, id))
      .all()
      .map((r) => r.aporteId);
  const finalGrupoAdicionales =
    grupos.grupoAdicionalIds ??
    db
      .select({ grupoId: schema.socioGrupos.grupoId })
      .from(schema.socioGrupos)
      .where(eq(schema.socioGrupos.socioId, id))
      .all()
      .map((r) => r.grupoId);
  const finalGrupoPrimario = grupos.grupoPrimarioId !== undefined ? grupos.grupoPrimarioId : existing.grupoPrimarioId;
  const finalEstadoId = estadoId ?? existing.estadoId;

  const generados = db.transaction((tx) => {
    // Update parcial: campos editables + relaciones solo cuando el body los declara.
    // Los campos legacy (`aporteBase`/`tipoAporteId`) no son escribibles y se
    // ignoran (spec: PUT con legacy no tiene efecto, no 500).
    const updateFields = {
      ...camposSocio(body),
      ...(estadoId !== undefined ? { estadoId } : {}),
      // conserva grupoId si no se envía
      ...(grupos.grupoPrimarioId !== undefined ? { grupoPrimarioId: grupos.grupoPrimarioId } : {}),
    };
    if (Object.keys(updateFields).length > 0) {
      tx.update(schema.socios)
        .set(updateFields)
        .where(eq(schema.socios.id, id))
        .run();
    }

    // Reemplazo atómico de grupos adicionales: SOLO cuando el body los declara.
    // Si el cliente no envía grupoAdicionalIds (update parcial), se preservan
    // las membresías existentes en vez de borrarlas silenciosamente.
    if (grupos.grupoAdicionalIds !== undefined) {
      tx.delete(schema.socioGrupos).where(eq(schema.socioGrupos.socioId, id)).run();
      for (const grupoId of grupos.grupoAdicionalIds) {
        tx.insert(schema.socioGrupos).values({ socioId: id, grupoId }).run();
      }
    }

    // Reemplazo atómico de aportes directos: SOLO cuando el body declara
    // `aporteIds`. Si se omite, se preserva la asignación vigente.
    if (aporteIds !== undefined) {
      tx.delete(schema.socioAportes).where(eq(schema.socioAportes.socioId, id)).run();
      for (const aporteId of aporteIds) {
        tx.insert(schema.socioAportes).values({ socioId: id, aporteId }).run();
      }
    }

    // D16: generación sobre el set final (dedup → solo faltantes; removals
    // NUNCA borran registros ya generados; no permitido → 0, sin 409).
    const permisos = cargarPermisosPorEstado();
    if (permite(permisos, finalEstadoId, 'aportes')) {
      const definiciones = definicionesFinales(finalAporteIds, finalGrupoPrimario ?? null, finalGrupoAdicionales);
      const socio = { id, estadoId: finalEstadoId, grupoPrimarioId: finalGrupoPrimario ?? null };
      return generarAportes(
        tx,
        [socio],
        definiciones,
        new Map([[id, finalAporteIds]]),
        new Map([[id, finalGrupoAdicionales]]),
        new Date().getFullYear(), // D12: gestión actual, sin mes
      );
    }
    return [];
  });

  const fila = selectSociosConEstado().where(eq(schema.socios.id, id)).get()!;
  const gruposMap = gruposPorSocio([id]);
  const directos = aportesDirectosPorSocio([id]);
  const inherited = aportesInheritedPorSocio([fila], gruposMap);
  // D16: shape estándar + generados (solo filas NUEVAS).
  return c.json({
    ...armarSocio(fila, gruposMap, directos.get(id) ?? [], inherited.get(id) ?? []),
    generados: { count: generados.length },
  });
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
  const directos = aportesDirectosPorSocio([id]);
  const inherited = aportesInheritedPorSocio([fila], gruposMap);
  return c.json(armarSocio(fila, gruposMap, directos.get(id) ?? [], inherited.get(id) ?? []));
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
