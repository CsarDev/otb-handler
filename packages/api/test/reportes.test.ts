// Suite NUEVA — libro-diario envelope (D48/D50, Slice A). NO existía suite de
// reportes: espeja la matriz de envelope de multas.test.ts (D40).
//
// 1) GET /api/reportes/libro-diario SIEMPRE responde el envelope
//    `{ items, total, page, pageSize }` (reemplaza el array plano): defaults
//    1/25 vía parsePaginacion, cap 100, fallbacks para no-integers/negativos.
// 2) ORDER BY fecha ASC, id DESC (tiebreak determinista dentro de la misma
//    fecha); total = COUNT filtrado ANTES de la paginación (mismo FROM + LEFT
//    JOIN + WHERE — los filtros estadoId/grupoId referencian schema.socios).
// 3) Filtros existentes preservados verbatim (anulado=0 + tipo/fechas/gestion/
//    mes/estadoId/grupoId); SIN default "últimos 30 días" (flag D51).
//
// Escrito RED antes del cambio GREEN en reportes.ts (T2.1): hoy el endpoint
// devuelve un array plano, así que `data.items`/`data.total` no existen.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  migrarDb,
  limpiarDatos,
  initAuth,
  requestJson,
  crearSocio,
  crearGrupo,
  filas,
  ejecutar,
  IDS,
} from './helpers';

beforeAll(async () => {
  migrarDb();
  await initAuth();
});
beforeEach(() => limpiarDatos());

const FECHAS = ['2026-01-15', '2026-02-15', '2026-03-15'];

/** Crea `n` socios (est-activo por defecto) y devuelve sus ids. */
async function crearSocios(n: number, overrides: Record<string, unknown> = {}): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const { status, data } = await crearSocio({
      nombre: `Socio${i}`,
      apellidoPaterno: 'Test',
      aporteIds: [],
      ...overrides,
    });
    if (status !== 201) throw new Error(`crearSocio ${i} falló (${status}): ${JSON.stringify(data)}`);
    ids.push(data.id);
  }
  return ids;
}

/** Insert directo de un movimiento (ids/fechas explícitos → orden determinista, D50). */
function insertarMovimiento(
  id: string,
  overrides: {
    tipo?: 'ingreso' | 'egreso';
    socioId?: string | null;
    monto?: number;
    numeroRecibo?: string | null;
    nota?: string | null;
    fecha?: string;
    anulado?: number;
  } = {},
): void {
  ejecutar(
    'INSERT INTO movimientos (id, tipo, socio_id, monto, numero_recibo, nota, fecha, anulado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      id,
      overrides.tipo ?? 'ingreso',
      overrides.socioId ?? null,
      overrides.monto ?? 100,
      overrides.numeroRecibo ?? null,
      overrides.nota ?? null,
      overrides.fecha ?? FECHAS[0],
      overrides.anulado ?? 0,
    ],
  );
}

/**
 * 60 movs: 20 por fecha (m01..m20 en 2026-01-15, m21..m40 en 2026-02-15,
 * m41..m60 en 2026-03-15), tipo alternado ingreso/egreso, todos con socioId de
 * un socio est-activo. Devuelve los 60 ids (m01..m60).
 */
async function sembrar60Movimientos(): Promise<string[]> {
  const [socioId] = await crearSocios(1);
  const ids: string[] = [];
  for (let i = 1; i <= 60; i++) {
    const id = `m${String(i).padStart(2, '0')}`;
    insertarMovimiento(id, {
      socioId,
      fecha: FECHAS[Math.floor((i - 1) / 20)],
      tipo: i % 2 === 0 ? 'egreso' : 'ingreso',
    });
    ids.push(id);
  }
  return ids;
}

describe('GET /api/reportes/libro-diario — envelope paginado (reports spec)', () => {
  it('escenario default: 60 movs → { items: [25], total: 60, page: 1, pageSize: 25 }', async () => {
    await sembrar60Movimientos();

    const { status, data } = await requestJson('/api/reportes/libro-diario');

    expect(status).toBe(200);
    expect(data.items).toHaveLength(25);
    expect(data.total).toBe(60);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(25);
  });

  it('pageSize=500 → clamp a 100 (echo 100; 60 < 100 → 60 items)', async () => {
    await sembrar60Movimientos();

    const { status, data } = await requestJson('/api/reportes/libro-diario?pageSize=500');

    expect(status).toBe(200);
    expect(data.pageSize).toBe(100);
    expect(data.total).toBe(60);
    expect(data.items).toHaveLength(60);
  });

  it('page=9 fuera de rango → { items: [], total: 60, page: 9, pageSize: 25 }', async () => {
    await sembrar60Movimientos();

    const { status, data } = await requestJson('/api/reportes/libro-diario?page=9&pageSize=25');

    expect(status).toBe(200);
    expect(data.items).toEqual([]);
    expect(data.total).toBe(60);
    expect(data.page).toBe(9);
    expect(data.pageSize).toBe(25);
  });

  it('lista vacía → { items: [], total: 0, page: 1, pageSize: 25 }', async () => {
    const { status, data } = await requestJson('/api/reportes/libro-diario');

    expect(status).toBe(200);
    expect(data).toEqual({ items: [], total: 0, page: 1, pageSize: 25 });
  });

  it('page=abc&pageSize=-5 → fallback a defaults page 1 / pageSize 25', async () => {
    await sembrar60Movimientos();

    const { status, data } = await requestJson('/api/reportes/libro-diario?page=abc&pageSize=-5');

    expect(status).toBe(200);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(25);
    expect(data.items).toHaveLength(25);
  });

  it('orden determinista: fecha ASC + id DESC, sin duplicados/gaps entre páginas', async () => {
    await sembrar60Movimientos();

    // Página 1 = las 20 de enero (más antiguas) en id DESC + 5 de febrero en id DESC.
    const page1 = (await requestJson('/api/reportes/libro-diario?page=1&pageSize=25')).data;
    const eneroDesc = Array.from({ length: 20 }, (_, i) => `m${String(20 - i).padStart(2, '0')}`); // m20..m01
    const febreroDesc = Array.from({ length: 20 }, (_, i) => `m${String(40 - i).padStart(2, '0')}`); // m40..m21
    expect(page1.items.map((i: any) => i.id)).toEqual([...eneroDesc, ...febreroDesc.slice(0, 5)]);

    // Unión de páginas 1..3 = las 60, sin duplicados ni gaps.
    const vistos = new Set<string>();
    const tamaños: number[] = [];
    for (const p of [1, 2, 3]) {
      const page = (await requestJson(`/api/reportes/libro-diario?page=${p}&pageSize=25`)).data;
      tamaños.push(page.items.length);
      for (const item of page.items) vistos.add(item.id);
    }
    expect(tamaños).toEqual([25, 25, 10]);
    expect(vistos.size).toBe(60);

    // Cross-check con SQL crudo: el orden de la API espeja ORDER BY fecha ASC, id DESC.
    const sqlIds = filas('SELECT id FROM movimientos ORDER BY fecha ASC, id DESC').map((r) => r.id);
    expect(page1.items.map((i: any) => i.id)).toEqual(sqlIds.slice(0, 25));
  });

  it('tiebreak misma fecha: dentro de 2026-01-15 los ids van DESC (m20..m01)', async () => {
    await sembrar60Movimientos();

    const { data } = await requestJson('/api/reportes/libro-diario?pageSize=20');

    // pageSize 20 → página 1 = SOLO enero (20 movs), id DESC.
    expect(data.items.map((i: any) => i.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => `m${String(20 - i).padStart(2, '0')}`),
    );
  });

  it('filtro tipo antes de la paginación → subset + total filtrado', async () => {
    await sembrar60Movimientos(); // 30 ingreso + 30 egreso alternados

    const { status, data } = await requestJson('/api/reportes/libro-diario?tipo=ingreso');

    expect(status).toBe(200);
    expect(data.items).toHaveLength(25);
    expect(data.total).toBe(30);
    expect(data.items.every((i: any) => i.tipo === 'ingreso')).toBe(true);
  });

  it('filtro estadoId → solo movs de socios con ese estado + total filtrado', async () => {
    const [s1] = await crearSocios(1, { nombre: 'S1' }); // est-activo
    const [s2] = await crearSocios(1, { nombre: 'S2', estadoId: IDS.estSuspendido });
    for (let i = 1; i <= 5; i++) insertarMovimiento(`s1m${i}`, { socioId: s1 });
    for (let i = 1; i <= 3; i++) insertarMovimiento(`s2m${i}`, { socioId: s2, tipo: 'egreso' });

    const { status, data } = await requestJson(
      `/api/reportes/libro-diario?estadoId=${IDS.estSuspendido}`,
    );

    expect(status).toBe(200);
    expect(data.items).toHaveLength(3);
    expect(data.total).toBe(3);
    expect(new Set(data.items.map((i: any) => i.socioId))).toEqual(new Set([s2]));
  });

  it('filtro grupoId (primario) → solo movs del socio del grupo + total filtrado', async () => {
    const g1 = await crearGrupo('Grupo A');
    const [s1] = await crearSocios(1, { nombre: 'S1', grupoPrimarioId: g1 });
    const [s3] = await crearSocios(1, { nombre: 'S3' }); // sin grupo
    for (let i = 1; i <= 4; i++) insertarMovimiento(`g1m${i}`, { socioId: s1 });
    for (let i = 1; i <= 2; i++) insertarMovimiento(`s3m${i}`, { socioId: s3, tipo: 'egreso' });

    const { status, data } = await requestJson(`/api/reportes/libro-diario?grupoId=${g1}`);

    expect(status).toBe(200);
    expect(data.items).toHaveLength(4);
    expect(data.total).toBe(4);
    expect(new Set(data.items.map((i: any) => i.socioId))).toEqual(new Set([s1]));
  });

  it('filtro fechaDesde/fechaHasta → solo el rango + total filtrado', async () => {
    await sembrar60Movimientos(); // 20 por fecha: ene/feb/mar

    const { status, data } = await requestJson(
      '/api/reportes/libro-diario?fechaDesde=2026-02-01&fechaHasta=2026-02-28',
    );

    expect(status).toBe(200);
    expect(data.items).toHaveLength(20);
    expect(data.total).toBe(20);
    expect(data.items.every((i: any) => i.fecha === '2026-02-15')).toBe(true);
  });

  it('regresión anulado=0: la fila anulada NUNCA aparece y los campos del row se preservan', async () => {
    await sembrar60Movimientos();
    insertarMovimiento('m-anulada', { socioId: null, fecha: '2026-01-15', anulado: 1 });

    const { status, data } = await requestJson('/api/reportes/libro-diario?pageSize=100');

    expect(status).toBe(200);
    expect(data.total).toBe(60); // la anulada NO cuenta
    expect(data.items.map((i: any) => i.id)).not.toContain('m-anulada');

    // Shape del row intacta (regresión reports: campos del LEFT JOIN presentes).
    const row = data.items[0];
    for (const campo of [
      'id',
      'tipo',
      'monto',
      'fecha',
      'nota',
      'numeroRecibo',
      'referenciaId',
      'socioId',
      'socioNombre',
      'socioApellido',
    ]) {
      expect(campo in row).toBe(true);
    }
  });

  it('regresión estadoId+grupoId combinados → subset + total (COUNT espeja los joins)', async () => {
    const g1 = await crearGrupo('Grupo A');
    const [s1] = await crearSocios(1, { nombre: 'S1', grupoPrimarioId: g1 }); // est-activo
    const [s2] = await crearSocios(1, {
      nombre: 'S2',
      estadoId: IDS.estSuspendido,
      grupoPrimarioId: g1,
    });
    for (let i = 1; i <= 5; i++) insertarMovimiento(`s1m${i}`, { socioId: s1 });
    for (let i = 1; i <= 7; i++) insertarMovimiento(`s2m${i}`, { socioId: s2, tipo: 'egreso' });

    const { status, data } = await requestJson(
      `/api/reportes/libro-diario?estadoId=${IDS.estActivo}&grupoId=${g1}`,
    );

    expect(status).toBe(200);
    expect(data.items).toHaveLength(5);
    expect(data.total).toBe(5);
    expect(new Set(data.items.map((i: any) => i.socioId))).toEqual(new Set([s1]));
  });
});
