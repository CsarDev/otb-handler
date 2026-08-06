import type { FC } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

export type PaginationProps = {
  /** Página actual (1-based). */
  page: number;
  /** Total de filas FILTRADAS (envelope.total). */
  total: number;
  /** Filas por página (envelope.pageSize). */
  pageSize: number;
  onPageChange: (page: number) => void;
};

/**
 * Control de paginación prev/next hand-rolled, sin dependencias nuevas (D37).
 * `total === 0` → no renderiza controles; botones NATIVOS (Tab-focusable,
 * Enter/Space activan) con `disabled` real para que el foco los saltee.
 * `aria-live="polite"` en la info para anunciar cambios de página a lectores.
 */
export const Pagination: FC<PaginationProps> = ({ page, total, pageSize, onPageChange }) => {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (total === 0) return null;

  const btnCls = cn(
    'inline-flex items-center gap-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm',
    'disabled:text-gray-300 disabled:cursor-not-allowed',
    'text-gray-700 hover:bg-gray-50 disabled:hover:bg-transparent',
  );

  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Página anterior"
        className={btnCls}
      >
        <ChevronLeft className="h-4 w-4" />
        Anterior
      </button>
      <span aria-live="polite" className="text-sm text-gray-500">
        Página {page} de {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Página siguiente"
        className={btnCls}
      >
        Siguiente
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
};
