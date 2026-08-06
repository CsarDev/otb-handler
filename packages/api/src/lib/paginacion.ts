// Paginación compartida de los list endpoints (D33) — GET /api/multas y
// GET /api/aportes. Naming en español como `validarGestionMes` /
// `cargarPermisosPorEstado`.

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/**
 * `page`/`pageSize` query → `{ page, pageSize }` efectivos (D33).
 * Defaults: page 1, pageSize 25. `pageSize > 100` se CLAMPEA a 100 (el echo
 * muestra 100). No-integers, `page < 1` y `pageSize < 1` (0, negativos, NaN)
 * caen a los defaults.
 */
export function parsePaginacion(query: { page?: string; pageSize?: string }): {
  page: number;
  pageSize: number;
} {
  const page = Number(query.page);
  const pageSize = Number(query.pageSize);
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize:
      Number.isInteger(pageSize) && pageSize >= 1
        ? Math.min(pageSize, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE,
  };
}
