import type { FC } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '@otb/core';
import { cn } from '../lib/utils';
import { paginasVisibles } from '../lib/paginacion-window';

export type PaginationProps = {
  /** Página actual (1-based). */
  page: number;
  /** Total de filas FILTRADAS (envelope.total). */
  total: number;
  /** Filas por página (envelope.pageSize). */
  pageSize: number;
  onPageChange: (page: number) => void;
  /** Presente → renderiza el <select> "Filas por página" a la izquierda (D45). */
  onPageSizeChange?: (pageSize: number) => void;
  /** Opciones del select — default DEFAULT_PAGE_SIZE_OPTIONS [10, 25, 50, 100] (D45/D51). */
  pageSizeOptions?: number[];
  /** Ventana de números de página (D43) — default 7. */
  maxSlots?: number;
};

/**
 * Control de paginación [select?][Primera][Anterior][números][info][Siguiente][Última]
 * (D42–D46). Additivo: las props nuevas son opcionales — los call sites existentes
 * (multas.tsx, aportes.tsx) compilan sin cambios. `total === 0` → no renderiza
 * controles; botones NATIVOS (Tab-focusable, Enter/Space activan) con `disabled`
 * real para que el foco los saltee. `aria-live="polite"` en la info. Debajo de
 * `sm:` se ocultan números + Primera/Última (`hidden sm:flex`), quedando visibles
 * el select (si hay onPageSizeChange), Anterior, la info y Siguiente (D46).
 */
export const Pagination: FC<PaginationProps> = ({
  page,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions,
  maxSlots = 7,
}) => {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (total === 0) return null;

  const slots = paginasVisibles(page, totalPages, maxSlots);

  const btnCls = cn(
    'inline-flex items-center gap-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm',
    'disabled:text-gray-300 disabled:cursor-not-allowed',
    'text-gray-700 hover:bg-gray-50 disabled:hover:bg-transparent',
  );
  const numBtnCls = cn(
    'h-8 w-8 inline-flex items-center justify-center border rounded-md text-sm',
    'disabled:text-gray-300 disabled:cursor-not-allowed',
  );

  return (
    <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
      {onPageSizeChange && (
        <select
          aria-label="Filas por página"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
        >
          {(pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(1)}
        aria-label="Primera página"
        className={cn(btnCls, 'hidden sm:inline-flex')}
      >
        <ChevronsLeft className="h-4 w-4" />
        Primera
      </button>

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

      {/* Números + ellipsis vía paginasVisibles (D43/D44). Claves por índice
          (open question resuelta: lista chica y estática por render — seguro). */}
      <div className="hidden items-center gap-1 sm:flex">
        {slots.map((slot, i) =>
          slot === 'ellipsis' ? (
            <span key={i} aria-hidden="true" className="px-1 text-sm text-gray-400">
              …
            </span>
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => onPageChange(slot)}
              aria-label={`Página ${slot}`}
              aria-current={slot === page ? 'page' : undefined}
              className={cn(
                numBtnCls,
                slot === page
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50',
              )}
            >
              {slot}
            </button>
          ),
        )}
      </div>

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

      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(totalPages)}
        aria-label="Última página"
        className={cn(btnCls, 'hidden sm:inline-flex')}
      >
        Última
        <ChevronsRight className="h-4 w-4" />
      </button>
    </div>
  );
};
