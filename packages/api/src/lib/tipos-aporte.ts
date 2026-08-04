import { db, schema } from '@otb/db';
import { eq, sql } from 'drizzle-orm';

export type TipoAporteRef = { id: string; nombre: string; montoBase: number };

/**
 * Primer tipo ACTIVO del catálogo (orden de inserción = rowid). Es el default
 * que la API garantiza en socio POST/PUT sin tipo y la derivación de monto
 * cuando un socio legacy no tiene tipo (D3). Devuelve null solo si no hay
 * ningún tipo activo.
 */
export function tipoAporteActivoDefault(): TipoAporteRef | null {
  const tipo = db
    .select({
      id: schema.tiposAporte.id,
      nombre: schema.tiposAporte.nombre,
      montoBase: schema.tiposAporte.montoBase,
    })
    .from(schema.tiposAporte)
    .where(eq(schema.tiposAporte.activo, 1))
    .orderBy(sql`rowid`)
    .get();
  return tipo ?? null;
}

/** Último recurso de lectura (dev), nunca debería usarse en una DB sembrada. */
export function tipoAportePrimero(): TipoAporteRef | null {
  const tipo = db
    .select({
      id: schema.tiposAporte.id,
      nombre: schema.tiposAporte.nombre,
      montoBase: schema.tiposAporte.montoBase,
    })
    .from(schema.tiposAporte)
    .orderBy(sql`rowid`)
    .get();
  return tipo ?? null;
}

export function tipoAportePorId(id: string | null): TipoAporteRef | null {
  if (!id) return null;
  const tipo = db
    .select({
      id: schema.tiposAporte.id,
      nombre: schema.tiposAporte.nombre,
      montoBase: schema.tiposAporte.montoBase,
    })
    .from(schema.tiposAporte)
    .where(eq(schema.tiposAporte.id, id))
    .get();
  return tipo ?? null;
}

/**
 * D6: resuelve el monto de un registro de aporte generado.
 * Regla de override (D4): `monto` se honra SOLO para `unico`/`extraordinario`.
 * Para `mensual`/`anual` SIEMPRE se deriva del `montoBase` del tipo del socio
 * (el override se ignora). Sin tipo (legacy) → cae al tipo activo por defecto.
 */
export function resolverMonto(
  socio: { tipoAporteId: string | null },
  tipo: string,
  monto?: number,
): number {
  if ((tipo === 'unico' || tipo === 'extraordinario') && monto !== undefined) {
    return Number(monto);
  }
  const delTipo = tipoAportePorId(socio.tipoAporteId) ?? tipoAporteActivoDefault();
  return delTipo?.montoBase ?? 0;
}