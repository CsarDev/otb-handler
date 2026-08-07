// Suite NUEVA — PRIMER test file de @otb/ui (D43/D50).
//
// Contrato puro de `paginasVisibles` (spec paginacion-window): ventana de
// números de página para el Pagination. Set visible = {1, totalPages, page-1,
// page, page+1} ∩ [1, totalPages] ordenado; 'ellipsis' donde el gap entre
// consecutivos es > 1; totalPages ≤ maxSlots → TODAS las páginas sin ellipsis;
// NUNCA excede maxSlots elementos; determinista y sin efectos.
//
// TODOS los casos del spec tienen un test que aserta el array EXACTO (escenario
// "Every contract case has a test"). Escrito RED antes que la implementación
// (T1.3) — referencias `./paginacion-window`, que aún no existe.
import { describe, expect, it } from 'vitest';
import { paginasVisibles } from './paginacion-window';

describe('paginasVisibles — ventana de elipsis (spec paginacion-window)', () => {
  it('todas las páginas cuando totalPages ≤ 7 (sin elipsis)', () => {
    expect(paginasVisibles(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('ventana alrededor de una página media (5 de 20)', () => {
    expect(paginasVisibles(5, 20)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 20]);
  });

  it('página 1 (borde inferior)', () => {
    expect(paginasVisibles(1, 20)).toEqual([1, 2, 'ellipsis', 20]);
  });

  it('página totalPages (borde superior)', () => {
    expect(paginasVisibles(20, 20)).toEqual([1, 'ellipsis', 19, 20]);
  });

  it('elipsis en ambos lados lejos de los bordes (10 de 20)', () => {
    expect(paginasVisibles(10, 20)).toEqual([1, 'ellipsis', 9, 10, 11, 'ellipsis', 20]);
  });

  it('página fuera de rango pequeño (9 de 2) → ventana navegable [1, 2]', () => {
    expect(paginasVisibles(9, 2)).toEqual([1, 2]);
  });

  it('página fuera de rango grande (30 de 20) → [1, ellipsis, 20]', () => {
    expect(paginasVisibles(30, 20)).toEqual([1, 'ellipsis', 20]);
  });

  it('maxSlots NUNCA se excede con el default 7 (sweep 1..10_000 páginas)', () => {
    for (let page = 1; page <= 10_000; page++) {
      expect(paginasVisibles(page, 10_000).length).toBeLessThanOrEqual(7);
    }
  });

  it('maxSlots custom 5 → longitud ≤ 5 y resultado navegable', () => {
    const result = paginasVisibles(10, 20, 5);
    expect(result.length).toBeLessThanOrEqual(5);
    expect(result).toEqual([1, 'ellipsis', 10, 'ellipsis', 20]);
  });

  it('totalPages defensivo (0 y negativos) → []', () => {
    expect(paginasVisibles(1, 0)).toEqual([]);
    expect(paginasVisibles(1, -3)).toEqual([]);
  });

  it('determinista: misma llamada dos veces → deep-equal', () => {
    const a = paginasVisibles(5, 20);
    const b = paginasVisibles(5, 20);
    expect(a).toEqual(b);
    expect(a).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 20]);
  });

  it('bordes N=1, N=2 y N=3 → todas las páginas', () => {
    expect(paginasVisibles(1, 1)).toEqual([1]);
    expect(paginasVisibles(2, 2)).toEqual([1, 2]);
    expect(paginasVisibles(3, 3)).toEqual([1, 2, 3]);
  });
});
