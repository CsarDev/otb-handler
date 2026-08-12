// Suite NUEVA — egresos envelope (D60, U2a). Espeja la matriz de envelope de
// multas.test.ts (D40) sobre GET /api/egresos (spec egresos-paginados).
//
// 1) GET /api/egresos SIEMPRE responde el envelope `{ items, total, page,
//    pageSize }` (reemplaza el array plano): defaults 1/25 vía parsePaginacion,
//    cap 100, fallbacks para no-integers/negativos, total = COUNT filtrado
//    ANTES de la paginación (tabla simple, sin joins — D56).
// 2) ORDER BY desc(fecha), desc(id) (flujo de caja, más reciente primero; D34/
//    D56); tiebreak PK → orden total sin duplicados/gaps entre páginas (R2).
// 3) Filtros categoria (eq), fechaDesde (gte), fechaHasta (lte) con COUNT
//    espejo (mismo WHERE); shape del item INTACTA
//    `{ id, categoria, beneficiario, monto, descripcion, fecha, numRecibo }`.
//
// Escrito RED antes del cambio GREEN en egresos.ts (T2.1): hoy el endpoint
// devuelve un array plano, así que `data.items`/`data.total` no existen.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrarDb, limpiarDatos, requestJson, filas, ejecutar } from './helpers';

beforeAll(() => migrarDb());
beforeEach(() => limpiarDatos());

/** INSERT crudo de un egreso con id explícito (precedente reportes.test.ts). */
function insertarEgreso(id: string, overrides: Record<string, unknown> = {}) {
  ejecutar(
    'INSERT INTO egresos (id, categoria, beneficiario, monto, descripcion, fecha, num_recibo) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      id,
      overrides.categoria ?? 'Servicios',
      overrides.beneficiario ?? `Beneficiario ${id}`,
      overrides.monto ?? 100,
      overrides.descripcion ?? null,
      overrides.fecha ?? '2026-01-15',
      overrides.numRecibo ?? null,
    ],
  );
}

/** Seed e01..e60: 20 por fecha 2026-01-15 / 02-15 / 03-15 (D60). */
function seedEgresos(n = 60) {
  for (let i = 1; i <= n; i++) {
    const id = `e${String(i).padStart(2, '0')}`;
    const fecha = i <= 20 ? '2026-01-15' : i <= 40 ? '2026-02-15' : '2026-03-15';
    insertarEgreso(id, { fecha });
  }
}

describe('GET /api/egresos — envelope paginado (spec egresos-paginados)', () => {
  it('escenario default: 60 egresos → { items: [25], total: 60, page: 1, pageSize: 25 }', async () => {
    seedEgresos(60);

    const { status, data } = await requestJson('/api/egresos');

    expect(status).toBe(200);
    expect(data.items).toHaveLength(25);
    expect(data.total).toBe(60);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(25);
  });

  it('pageSize=500 → clamp a 100 (echo 100; 60 < 100 → 60 items)', async () => {
    seedEgresos(60);

    const { status, data } = await requestJson('/api/egresos?pageSize=500');

    expect(status).toBe(200);
    expect(data.pageSize).toBe(100);
    expect(data.total).toBe(60);
    expect(data.items).toHaveLength(60);
  });

  it('page=9 fuera de rango → { items: [], total: 60, page: 9, pageSize: 25 }', async () => {
    seedEgresos(60);

    const { status, data } = await requestJson('/api/egresos?page=9&pageSize=25');

    expect(status).toBe(200);
    expect(data.items).toEqual([]);
    expect(data.total).toBe(60);
    expect(data.page).toBe(9);
    expect(data.pageSize).toBe(25);
  });

  it('lista vacía → { items: [], total: 0, page: 1, pageSize: 25 }', async () => {
    const { status, data } = await requestJson('/api/egresos');

    expect(status).toBe(200);
    expect(data).toEqual({ items: [], total: 0, page: 1, pageSize: 25 });
  });

  it('page=abc&pageSize=-5 → fallback a defaults page 1 / pageSize 25', async () => {
    seedEgresos(60);

    const { status, data } = await requestJson('/api/egresos?page=abc&pageSize=-5');

    expect(status).toBe(200);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(25);
    expect(data.items).toHaveLength(25);
  });

  it('orden determinista: desc(fecha), desc(id), sin duplicados/gaps', async () => {
    seedEgresos(60);

    const page1 = (await requestJson('/api/egresos?page=1&pageSize=25')).data;
    // Cross-check con SQL crudo: el orden de la API espeja ORDER BY fecha, id
    // (tiebreak PK — D56). Marzo (e41..e60) → e60..e41; luego febrero → e40...
    const sqlIds = filas('SELECT id FROM egresos ORDER BY fecha DESC, id DESC LIMIT 25').map(
      (r) => r.id,
    );
    expect(page1.items.map((i: any) => i.id)).toEqual(sqlIds);
    expect(page1.items.slice(0, 20).map((i: any) => i.id)).toEqual(
      Array.from({ length: 20 }, (_, k) => `e${String(60 - k).padStart(2, '0')}`),
    );

    // Unión de páginas 1..3 = las 60, sin duplicados ni gaps.
    const vistos = new Set<string>();
    const tamaños: number[] = [];
    for (const p of [1, 2, 3]) {
      const page = (await requestJson(`/api/egresos?page=${p}&pageSize=25`)).data;
      tamaños.push(page.items.length);
      for (const item of page.items) vistos.add(item.id);
    }
    expect(tamaños).toEqual([25, 25, 10]);
    expect(vistos.size).toBe(60);
    expect([...vistos].sort()).toEqual(
      Array.from({ length: 60 }, (_, k) => `e${String(k + 1).padStart(2, '0')}`).sort(),
    );
  });

  it('filtro categoria: 40 egresos, 10 "Mantenimiento" → { items: [10], total: 10 }', async () => {
    seedEgresos(30); // e01..e30, categoria 'Servicios'
    for (let i = 31; i <= 40; i++) {
      insertarEgreso(`e${i}`, { categoria: 'Mantenimiento' });
    }

    const { status, data } = await requestJson('/api/egresos?categoria=Mantenimiento&pageSize=25');

    expect(status).toBe(200);
    expect(data.total).toBe(10);
    expect(data.items).toHaveLength(10);
    expect(data.items.every((i: any) => i.categoria === 'Mantenimiento')).toBe(true);
  });

  it('rango fechas: feb 2026 → solo febrero, fecha DESC + tiebreak id DESC, total 20', async () => {
    seedEgresos(60);

    const { status, data } = await requestJson(
      '/api/egresos?fechaDesde=2026-02-01&fechaHasta=2026-02-28',
    );

    expect(status).toBe(200);
    expect(data.total).toBe(20);
    expect(data.items).toHaveLength(20);
    expect(data.items.every((i: any) => i.fecha === '2026-02-15')).toBe(true);
    // Misma fecha → tiebreak id DESC: e40..e21.
    expect(data.items.map((i: any) => i.id)).toEqual(
      Array.from({ length: 20 }, (_, k) => `e${String(40 - k).padStart(2, '0')}`),
    );
  });

  it('filtros sin matches → { items: [], total: 0, page: 1, pageSize: 25 }', async () => {
    seedEgresos(60);

    const { status, data } = await requestJson(
      '/api/egresos?categoria=NoExiste&fechaDesde=2030-01-01',
    );

    expect(status).toBe(200);
    expect(data).toEqual({ items: [], total: 0, page: 1, pageSize: 25 });
  });

  it('shape intacta: { id, categoria, beneficiario, monto, descripcion, fecha, numRecibo }', async () => {
    insertarEgreso('e01', {
      categoria: 'Mantenimiento',
      beneficiario: 'Ferretería La Paz',
      monto: 230,
      descripcion: 'Materiales reparación sede',
      fecha: '2026-03-15',
      numRecibo: 'EG-2026-003',
    });

    const { status, data } = await requestJson('/api/egresos?pageSize=25');

    expect(status).toBe(200);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toEqual({
      id: 'e01',
      categoria: 'Mantenimiento',
      beneficiario: 'Ferretería La Paz',
      monto: 230,
      descripcion: 'Materiales reparación sede',
      fecha: '2026-03-15',
      numRecibo: 'EG-2026-003',
    });
  });
});