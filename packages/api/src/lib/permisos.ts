import { db, schema } from '@otb/db';
import { eq } from 'drizzle-orm';
import { socioPermite } from '@otb/core';

export type MapaPermisos = Map<string, Set<string>>; // estadoId → Set<clave>

/**
 * Carga el M:N estado→acciones UNA sola vez por request y lo resuelve por estadoId,
 * evitando N+1 en rutas que validan permisos de un socio.
 */
export function cargarPermisosPorEstado(): MapaPermisos {
  const filas = db
    .select({
      estadoId: schema.estadoAcciones.estadoId,
      clave: schema.accionesSocio.clave,
    })
    .from(schema.estadoAcciones)
    .innerJoin(schema.accionesSocio, eq(schema.estadoAcciones.accionId, schema.accionesSocio.id))
    .all();

  const mapa: MapaPermisos = new Map();
  for (const f of filas) {
    if (!mapa.has(f.estadoId)) mapa.set(f.estadoId, new Set());
    mapa.get(f.estadoId)!.add(f.clave);
  }
  return mapa;
}

/**
 * Resuelve si el estado del socio permite la acción. Consume el predicado puro
 * `socioPermite` de @otb/core con el Set<clave> del estado cargado en el mapa.
 */
export function permite(mapa: MapaPermisos, estadoId: string | null, accionClave: string): boolean {
  const claves = estadoId ? mapa.get(estadoId) : undefined;
  return claves ? socioPermite(claves, accionClave) : false;
}

export const ERROR_PERMISO = { error: 'El socio no puede realizar esta acción en su estado actual' };
