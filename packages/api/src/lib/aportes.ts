import { db, schema } from '@otb/db';
import { eq, and, inArray, sql } from 'drizzle-orm';
import type { Aporte } from '@otb/core';

// Helpers de definición de aporte (modelo corregido D1–D11). El aporte ES la
// definición dinámica (`aportes_definicion`); la aplicabilidad a un socio es
// directa (`socio_aportes`) O por grupo M:N (`aportes_definicion_grupos`,
// D23) resuelta en lectura/generación. NO hay override de monto/tipo: los
// `monto`/`tipo` de los registros derivan de la definición (D2, D8).

/**
 * Lee una definición por su id (slug estable). Devuelve `undefined` si no
 * existe o si se pasa un id nulo/vacío. SIEMPRE devuelve la definición
 * hidratada con `grupoIds` (invariante D25: nunca `undefined`).
 */
export function aporteDefPorId(id: string | null | undefined): Aporte | undefined {
  if (!id) return undefined;
  const def = db
    .select()
    .from(schema.aportesDefinicion)
    .where(eq(schema.aportesDefinicion.id, id))
    .get();
  return def ? hidratarGrupoIds([def as unknown as Aporte])[0] : undefined;
}

/**
 * Primera definición ACTIVA en orden de inserción (rowid). Es el default que
 * la API usa para derivar `aporteMensualBase` en `routes/config.ts` (D11).
 * Devuelve `undefined` si no hay ninguna definición activa.
 */
export function aporteDefActivoDefault(): Aporte | undefined {
  const def = db
    .select()
    .from(schema.aportesDefinicion)
    .where(eq(schema.aportesDefinicion.activo, 1))
    .orderBy(sql`rowid`)
    .get();
  return def ? hidratarGrupoIds([def as unknown as Aporte])[0] : undefined;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Primer instante del mes `m` de `gestion`, como `YYYY-MM-01`. */
function fechaInicioMes(gestion: number, mes: number): string {
  return `${gestion}-${pad2(mes)}-01`;
}

/** Último día del mes `m` de `gestion`, como `YYYY-MM-DD`. */
function finDeMesYMD(gestion: number, mes: number): string {
  const ultimo = new Date(gestion, mes, 0).getDate(); // day 0 del mes siguiente = último día
  return `${gestion}-${pad2(mes)}-${pad2(ultimo)}`;
}

/**
 * Meses `m ∈ [1..12]` de `gestion` dentro de la ventana de vigencia de la
 * definición: `(inicio==null || dateK(g,m) >= inicio)` AND `(fin==null ||
 * finDeMes(g,m) <= fin)`. El `mes` opcional eleva la cota inferior a
 * `max(1, mes)` (D3/D8). Comparación de fechas por string `YYYY-MM-DD`.
 */
export function mesesDefinicion(
  def: { inicio: string | null; fin: string | null },
  gestion: number,
  mes?: number,
): number[] {
  const cotaInferior = typeof mes === 'number' ? Math.max(1, mes) : 1;
  const resultado: number[] = [];
  for (let m = cotaInferior; m <= 12; m++) {
    const inicioOk = def.inicio == null || fechaInicioMes(gestion, m) >= def.inicio;
    const finOk = def.fin == null || finDeMesYMD(gestion, m) <= def.fin;
    if (inicioOk && finOk) resultado.push(m);
  }
  return resultado;
}

/**
 * Aplicabilidad de una definición a un socio (predicado puro, sin DB):
 * TRUE si la definición está entre los `aporteIds` directos del socio (asignación
 * explícita en `socio_aportes`) O si `def.grupoIds` intersecta el grupo primario
 * del socio o sus grupos adicionales (aplicación dinámica por grupo M:N, D23/D25).
 * `def.grupoIds` vacío = global → NUNCA "held" por grupo (solo por asignación directa).
 * `grupos` son los id de los grupos adicionales del socio.
 */
export function socioHoldsAporte(
  socio: { aporteIds: string[] | undefined; grupoPrimarioId: string | null },
  def: { id: string; grupoIds: string[] },
  grupos: string[],
): boolean {
  if (socio.aporteIds?.includes(def.id)) return true;
  if (def.grupoIds.length === 0) return false; // global → nunca "held" por grupo
  const gruposDelSocio = new Set<string>();
  if (socio.grupoPrimarioId) gruposDelSocio.add(socio.grupoPrimarioId);
  for (const g of grupos) gruposDelSocio.add(g);
  return def.grupoIds.some((g) => gruposDelSocio.has(g)); // intersección de sets
}

// ─────────────────────────────────────────────────────────────────────────────
// Generador compartido (D8/D13/D15/D16): un SOLO code path para cada trigger —
// endpoints manuales single/bulk/bulk-all, creación de definición con
// asignación y guardado de socio. Movido desde routes/aportes.ts (T1.3).
// ─────────────────────────────────────────────────────────────────────────────

export type SocioParaGenerar = { id: string; estadoId: string | null; grupoPrimarioId: string | null };
export type AporteCreado = {
  id: string;
  socioId: string;
  aporteId: string | null;
  mes: number;
  gestion: number;
  tipo: string;
  montoBase: number;
};
export type TxAportes = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * `gestion` debe ser un año válido; `mes` (opcional, cota inferior para
 * `mensual`) debe ser 1..12 cuando se envía. Default de gestión: año actual
 * (D12 — mismo default en todos los paths de generación).
 */
export function validarGestionMes(
  body: Record<string, unknown>,
): { gestion: number; mes?: number } | { error: string; status: 400 } {
  const gestion = Number(body.gestion ?? new Date().getFullYear());
  if (!Number.isInteger(gestion) || gestion <= 0) {
    return { error: 'gestion is invalid', status: 400 };
  }

  let mes: number | undefined;
  if (body.mes !== undefined && body.mes !== null) {
    mes = Number(body.mes);
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      return { error: 'mes must be between 1 and 12', status: 400 };
    }
  }

  return { gestion, mes };
}

/**
 * Valida que TODAS las definiciones pedidas existan y estén activas (400 si no).
 * Devuelve la lista de definiciones para generar.
 */
export function validarDefinicionesActivas(aporteIds: string[]): Aporte[] | { error: string; status: 400 } {
  const definiciones: Aporte[] = [];
  for (const id of aporteIds) {
    const def = aporteDefPorId(id);
    if (!def) return { error: `La definición de aporte "${id}" no existe`, status: 400 };
    if (def.activo !== 1) return { error: `La definición de aporte "${id}" está inactiva`, status: 400 };
    definiciones.push(def);
  }
  return definiciones;
}

// Meses de generación según la recurrencia de la definición (D8):
// - anual → [1..12] (ignora ventana y `mes`);
// - mensual → mesesDefinicion(def, gestion, mes?) (ventana ∩ gestión, cota inferior opcional);
// - unico/extraordinario → [mes ?? 1].
export function mesesParaDefinicion(def: Aporte, gestion: number, mes?: number): number[] {
  if (def.recurrencia === 'anual') {
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }
  if (def.recurrencia === 'mensual') {
    return mesesDefinicion(def, gestion, mes);
  }
  return [mes ?? 1];
}

/** Asignaciones directas batch: socioId → aporteIds (desde socio_aportes). */
export function aportesDirectosPorSocio(ids: string[]): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  if (ids.length === 0) return mapa;

  const filas = db
    .select({ socioId: schema.socioAportes.socioId, aporteId: schema.socioAportes.aporteId })
    .from(schema.socioAportes)
    .where(inArray(schema.socioAportes.socioId, ids))
    .all();
  for (const f of filas) {
    const arr = mapa.get(f.socioId) ?? [];
    arr.push(f.aporteId);
    mapa.set(f.socioId, arr);
  }
  return mapa;
}

/** Grupos adicionales batch: socioId → grupoIds (desde socio_grupos). */
export function gruposAdicionalesPorSocio(ids: string[]): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  if (ids.length === 0) return mapa;

  const filas = db
    .select({ socioId: schema.socioGrupos.socioId, grupoId: schema.socioGrupos.grupoId })
    .from(schema.socioGrupos)
    .where(inArray(schema.socioGrupos.socioId, ids))
    .all();
  for (const f of filas) {
    const arr = mapa.get(f.socioId) ?? [];
    arr.push(f.grupoId);
    mapa.set(f.socioId, arr);
  }
  return mapa;
}

/**
 * definition_id → grupoId[] (batch, sin N+1, D25). Lote único `inArray` sobre
 * la join M:N `aportes_definicion_grupos`, ensamblado en memoria. Espejo de
 * `gruposAdicionalesPorSocio`.
 */
export function grupoIdsPorDefinicion(ids: string[]): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  if (ids.length === 0) return mapa;
  const filas = db
    .select({
      definitionId: schema.aportesDefinicionGrupos.definitionId,
      grupoId: schema.aportesDefinicionGrupos.grupoId,
    })
    .from(schema.aportesDefinicionGrupos)
    .where(inArray(schema.aportesDefinicionGrupos.definitionId, ids))
    .orderBy(sql`rowid`) // orden de inserción (el orden enviado en POST/PUT) — D29
    .all();
  for (const f of filas) {
    const arr = mapa.get(f.definitionId) ?? [];
    arr.push(f.grupoId);
    mapa.set(f.definitionId, arr);
  }
  return mapa;
}

/**
 * Adjunta `grupoIds` (default `[]`) a definiciones — ÚNICA fuente de
 * hidratación (D25). Invariante: todo `Aporte` devuelto por los paths de
 * lectura/generación lleva `grupoIds` (nunca `undefined`): un `grupoIds ===
 * undefined` tendría `length === 0` y la generación group-scoped dejaría de
 * funcionar silenciosamente.
 */
function hidratarGrupoIds(defs: Aporte[]): Aporte[] {
  const mapa = grupoIdsPorDefinicion(defs.map((d) => d.id));
  return defs.map((d) => ({ ...d, grupoIds: mapa.get(d.id) ?? [] }));
}

/**
 * Definiciones ACTIVAS cuya aplicación M:N (`aportes_definicion_grupos`)
 * incluye alguno de los `grupoIds` (D20/D25): join a través de la tabla M:N,
 * lote único, sin N+1. Dedup por id de definición (una definición listada bajo
 * varios grupos pedidos aparece una vez). Solo activas: una definición de grupo
 * inactiva deja de generar para miembros nuevos (los registros ya generados
 * quedan). El resultado va HIDRATADO (invariante D25).
 */
export function definicionesDeGrupos(grupoIds: string[]): Aporte[] {
  if (grupoIds.length === 0) return [];
  const filas = db
    .select({ def: schema.aportesDefinicion })
    .from(schema.aportesDefinicionGrupos)
    .innerJoin(
      schema.aportesDefinicion,
      eq(schema.aportesDefinicionGrupos.definitionId, schema.aportesDefinicion.id),
    )
    .where(
      and(
        inArray(schema.aportesDefinicionGrupos.grupoId, grupoIds),
        eq(schema.aportesDefinicion.activo, 1),
      ),
    )
    .all();
  const unicos = new Map<string, Aporte>();
  for (const f of filas) unicos.set(f.def.id, f.def as unknown as Aporte);
  return hidratarGrupoIds([...unicos.values()]);
}

/** Definiciones ACTIVAS por id (lote único) — mitad directa de la unión del socio-save (D16). Hidratadas (D25). */
export function definicionesPorIds(ids: string[]): Aporte[] {
  if (ids.length === 0) return [];
  const filas = db
    .select()
    .from(schema.aportesDefinicion)
    .where(and(inArray(schema.aportesDefinicion.id, ids), eq(schema.aportesDefinicion.activo, 1)))
    .all();
  return hidratarGrupoIds(filas as unknown as Aporte[]);
}

/**
 * Genera los registros de aporte DENTRO de la transacción abierta. Compartido
 * por POST /, /bulk, /bulk/all, POST /api/aportes-definicion (D15) y el
 * guardado de socio (D16): por cada (socio × definición que el socio "holds" —
 * directa vía socio_aportes O heredada por grupo vía socioHoldsAporte) inserta
 * `mesesParaDefinicion(def)` registros con monto = def.monto (snapshot →
 * monto_base), tipo = def.recurrencia (snapshot → tipo) y aporte_id = def.id.
 *
 * DEDUP (D13): antes de cada INSERT se hace un SELECT-before-INSERT sobre
 * (socioId, aporteId, mes, gestion) — si la fila ya existe se salta y NO se
 * cuenta; el insert lleva `onConflictDoNothing()` como defensa en profundidad
 * (no-op cuando el índice parcial `aporte_dedup_unico` de 0006 existe). El
 * conteo devuelto son SOLO filas recién insertadas (re-run → count 0).
 */
export function generarAportes(
  tx: TxAportes,
  socios: SocioParaGenerar[],
  definiciones: Aporte[],
  directos: Map<string, string[]>,
  gruposAdicionales: Map<string, string[]>,
  gestion: number,
  mes?: number,
): AporteCreado[] {
  const items: AporteCreado[] = [];

  for (const socio of socios) {
    const directosSocio = directos.get(socio.id) ?? [];
    const gruposSocio = gruposAdicionales.get(socio.id) ?? [];

    for (const def of definiciones) {
      if (!socioHoldsAporte({ aporteIds: directosSocio, grupoPrimarioId: socio.grupoPrimarioId }, def, gruposSocio)) {
        continue;
      }

      for (const m of mesesParaDefinicion(def, gestion, mes)) {
        // Dedup (D13): SELECT-before-INSERT sobre la clave del índice parcial.
        // better-sqlite3 es single-connection y la transacción ve sus propios
        // inserts sin commit, así que el chequeo es race-free en este stack.
        const existente = tx
          .select({ id: schema.aportes.id })
          .from(schema.aportes)
          .where(
            and(
              eq(schema.aportes.socioId, socio.id),
              eq(schema.aportes.aporteId, def.id),
              eq(schema.aportes.mes, m),
              eq(schema.aportes.gestion, gestion),
            ),
          )
          .get();
        if (existente) continue;

        const id = crypto.randomUUID();
        tx.insert(schema.aportes)
          .values({
            id,
            socioId: socio.id,
            aporteId: def.id,
            mes: m,
            gestion,
            tipo: def.recurrencia,
            montoBase: def.monto,
            montoPagado: 0,
            saldoPendiente: def.monto,
            estado: 'pendiente',
          })
          .onConflictDoNothing()
          .run();
        items.push({ id, socioId: socio.id, aporteId: def.id, mes: m, gestion, tipo: def.recurrencia, montoBase: def.monto });
      }
    }
  }

  return items;
}