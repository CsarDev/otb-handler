import type { EstadoSocio, AccionSocio } from '@otb/core';

/**
 * Derivado UI (sin N+1): resuelve si el estado de un socio permite una acción
 * (por `clave`) usando los catálogos del store. El server ya aplanó `accionIds`
 * en cada estado, así que solo hace falta mapear accionId → clave localmente.
 *
 * Reutilizado por asistencia (selector), reportes (selector resumen) y las
 * listas (ocultar/deshabilitar socios cuyo estado bloquea la acción del módulo).
 */
export function socioPermiteUI(
  estadosSocio: EstadoSocio[],
  accionesSocio: AccionSocio[],
  estadoId: string | null,
  accionClave: string,
): boolean {
  const estado = estadosSocio.find((e) => e.id === estadoId);
  if (!estado) return false;
  const claves = new Set(
    accionesSocio
      .filter((a) => estado.accionIds.includes(a.id))
      .map((a) => a.clave),
  );
  return claves.has(accionClave);
}
