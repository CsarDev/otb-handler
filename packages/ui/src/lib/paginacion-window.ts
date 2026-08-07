// Ventana de números de página para el Pagination (D43).
// Set visible = {1, totalPages, page-1, page, page+1} ∩ [1, totalPages], ordenado;
// 'ellipsis' donde el gap entre consecutivos es > 1. totalPages ≤ maxSlots → TODAS
// las páginas sin ellipsis. NUNCA excede maxSlots elementos. Determinista y sin
// efectos (pura). `page` NO se clampea ANTES del set: los vecinos fuera de rango
// se descartan por la intersección (p.ej. paginasVisibles(30, 20) → [1,'ellipsis',20]).

export type PaginaSlot = number | 'ellipsis';

export function paginasVisibles(page: number, totalPages: number, maxSlots = 7): PaginaSlot[] {
  // Defensivo (D43 test plan): totalPages < 1 → sin páginas. El set visible
  // {1, totalPages, page-1, page, page+1} ∩ [1, totalPages] queda vacío; el clamp
  // `Math.max(1, totalPages)` del pseudocódigo D43 mapearía 0→1 página, contradiciendo
  // el plan de tests del propio diseño — el guard se aplica ANTES.
  if (totalPages < 1) return [];
  const tp = Math.max(1, totalPages);
  if (tp <= maxSlots) return Array.from({ length: tp }, (_, i) => i + 1);

  const nums = [...new Set([1, tp, page - 1, page, page + 1])]
    .filter((n) => n >= 1 && n <= tp)
    .sort((a, b) => a - b);

  // Guard de cap SOLO para maxSlots < 7 (config custom): quita números interiores
  // (nunca 1, tp ni `page`) hasta que números + ellipsis quepan en maxSlots.
  // Con el default 7 el set (≤5 números) + ellipsis (≤2) ya cumple (≤7) — el guard
  // jamás se dispara en los casos pinneados por el spec.
  let final = nums;
  while (final.length + contarEllipsis(final) > maxSlots && final.length > 2) {
    const candidato =
      final.find((n) => n !== 1 && n !== tp && n !== page) ??
      final.find((n) => n !== 1 && n !== tp) ??
      page;
    final = final.filter((n) => n !== candidato);
  }

  const out: PaginaSlot[] = [];
  for (let i = 0; i < final.length; i++) {
    if (i > 0 && final[i] - final[i - 1] > 1) out.push('ellipsis');
    out.push(final[i]);
  }
  return out;
}

function contarEllipsis(nums: number[]): number {
  let e = 0;
  for (let i = 1; i < nums.length; i++) if (nums[i] - nums[i - 1] > 1) e++;
  return e;
}
