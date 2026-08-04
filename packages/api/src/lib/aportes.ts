import { db, schema } from '@otb/db';
import { eq, sql } from 'drizzle-orm';
import type { Aporte } from '@otb/core';

// Helpers de definición de aporte (modelo corregido D1–D11). El aporte ES la
// definición dinámica (`aportes_definicion`); la aplicabilidad a un socio es
// directa (`socio_aportes`) O por grupo (`aplica_grupo_id`) resuelta en
// lectura/generación. NO hay override de monto/tipo: los `monto`/`tipo` de los
// registros derivan de la definición (D2, D8).

/**
 * Lee una definición por su id (slug estable). Devuelve `undefined` si no
 * existe o si se pasa un id nulo/vacío.
 */
export function aporteDefPorId(id: string | null | undefined): Aporte | undefined {
  if (!id) return undefined;
  const def = db
    .select()
    .from(schema.aportesDefinicion)
    .where(eq(schema.aportesDefinicion.id, id))
    .get();
  return def ? (def as unknown as Aporte) : undefined;
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
  return def ? (def as unknown as Aporte) : undefined;
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
 * explícita en `socio_aportes`) O si `def.aplicaGrupoId` coincide con el grupo
 * primario del socio o con alguno de sus grupos adicionales (aplicación dinámica
 * por grupo, D5). `grupos` son los id de los grupos adicionales del socio.
 */
export function socioHoldsAporte(
  socio: { aporteIds: string[] | undefined; grupoPrimarioId: string | null },
  def: { id: string; aplicaGrupoId: string | null },
  grupos: string[],
): boolean {
  if (socio.aporteIds?.includes(def.id)) return true;
  if (def.aplicaGrupoId == null) return false;
  return def.aplicaGrupoId === socio.grupoPrimarioId || grupos.includes(def.aplicaGrupoId);
}