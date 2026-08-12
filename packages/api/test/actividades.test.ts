// Suite NUEVA — actividades envelope + /catalogo (D60, U2b). Espeja la matriz
// de envelope de multas.test.ts (D40) sobre GET /api/actividades (spec
// actividades-paginadas).
//
// 1) GET /api/actividades SIEMPRE responde el envelope `{ items, total, page,
//    pageSize }` (reemplaza el array plano): defaults 1/25 vía parsePaginacion,
//    cap 100, fallbacks para no-integers/negativos, total = COUNT de TODAS las
//    actividades ANTES de la paginación (sin filtros server-side — D55).
// 2) ORDER BY desc(fecha), desc(id) (más reciente primero; D34/D55); tiebreak
//    PK → orden total sin duplicados/gaps entre páginas (R2).
// 3) LEFT JOIN tipos_actividad preservado en items Y catálogo (regresión
//    join-fixes R3): tipoNombre en cada item, null cuando el tipo no existe.
// 4) NUEVO GET /api/actividades/catalogo → array plano completo con tipoNombre,
//    mismo ORDER BY, IGNORA page/pageSize (R4) — consumido como catálogo por
//    multas.tsx/asistencia.tsx (bias spec 1).
//
// Escrito RED antes del cambio GREEN en actividades.ts (T2.3): hoy el endpoint
// devuelve un array plano y no existe /catalogo.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrarDb, limpiarDatos, requestJson, filas, ejecutar } from './helpers';

beforeAll(() => migrarDb());

/**
 * Seed idempotente del tipo `t-reunion`. `INSERT OR IGNORE` lo hace repetible;
 * se re-siembra en CADA test (beforeEach) porque el test del dangle borra el
 * tipo (D60: "si un test borra tipos, repetir el seed en beforeEach"; y
 * limpiarDatos NO toca tipos_actividad).
 */
function seedTipoReunion() {
  ejecutar(
    `INSERT OR IGNORE INTO tipos_actividad (id, nombre, opciones, multas, tolerancia)
     VALUES ('t-reunion', 'Reunión', '["asistio","falta","tardanza","justificado"]', NULL, 0)`,
  );
}

beforeEach(() => {
  limpiarDatos();
  seedTipoReunion();
});

/** INSERT crudo de una actividad con id explícito (precedente reportes.test.ts). */
function insertarActividad(id: string, overrides: Record<string, unknown> = {}) {
  ejecutar(
    'INSERT INTO actividades (id, tipo_id, fecha, hora, descripcion) VALUES (?, ?, ?, ?, ?)',
    [
      id,
      overrides.tipoId ?? 't-reunion',
      overrides.fecha ?? '2026-01-15',
      overrides.hora ?? '18:00',
      overrides.descripcion ?? null,
    ],
  );
}

/** Seed a01..a60: 20 por fecha 2026-01-15 / 02-15 / 03-15 (D60). */
function seedActividades(n = 60) {
  for (let i = 1; i <= n; i++) {
    const id = `a${String(i).padStart(2, '0')}`;
    const fecha = i <= 20 ? '2026-01-15' : i <= 40 ? '2026-02-15' : '2026-03-15';
    insertarActividad(id, { fecha });
  }
}

describe('GET /api/actividades — envelope paginado (spec actividades-paginadas)', () => {
  it('escenario default: 60 actividades → { items: [25], total: 60, page: 1, pageSize: 25 }', async () => {
    seedActividades(60);

    const { status, data } = await requestJson('/api/actividades');

    expect(status).toBe(200);
    expect(data.items).toHaveLength(25);
    expect(data.total).toBe(60);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(25);
  });

  it('pageSize=500 → clamp a 100 (echo 100; 60 < 100 → 60 items)', async () => {
    seedActividades(60);

    const { status, data } = await requestJson('/api/actividades?pageSize=500');

    expect(status).toBe(200);
    expect(data.pageSize).toBe(100);
    expect(data.total).toBe(60);
    expect(data.items).toHaveLength(60);
  });

  it('page=9 fuera de rango → { items: [], total: 60, page: 9, pageSize: 25 }', async () => {
    seedActividades(60);

    const { status, data } = await requestJson('/api/actividades?page=9&pageSize=25');

    expect(status).toBe(200);
    expect(data.items).toEqual([]);
    expect(data.total).toBe(60);
    expect(data.page).toBe(9);
    expect(data.pageSize).toBe(25);
  });

  it('lista vacía → { items: [], total: 0, page: 1, pageSize: 25 }', async () => {
    const { status, data } = await requestJson('/api/actividades');

    expect(status).toBe(200);
    expect(data).toEqual({ items: [], total: 0, page: 1, pageSize: 25 });
  });

  it('page=abc&pageSize=-5 → fallback a defaults page 1 / pageSize 25', async () => {
    seedActividades(60);

    const { status, data } = await requestJson('/api/actividades?page=abc&pageSize=-5');

    expect(status).toBe(200);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(25);
    expect(data.items).toHaveLength(25);
  });

  it('orden determinista: desc(fecha), desc(id), sin duplicados/gaps', async () => {
    seedActividades(60);

    const page1 = (await requestJson('/api/actividades?page=1&pageSize=25')).data;
    // Cross-check con SQL crudo: el orden de la API espeja ORDER BY fecha, id
    // (tiebreak PK — D55). Marzo (a41..a60) → a60..a41; luego febrero → a40...
    const sqlIds = filas(
      'SELECT id FROM actividades ORDER BY fecha DESC, id DESC LIMIT 25',
    ).map((r) => r.id);
    expect(page1.items.map((i: any) => i.id)).toEqual(sqlIds);
    expect(page1.items.slice(0, 20).map((i: any) => i.id)).toEqual(
      Array.from({ length: 20 }, (_, k) => `a${String(60 - k).padStart(2, '0')}`),
    );

    // Unión de páginas 1..3 = las 60, sin duplicados ni gaps.
    const vistos = new Set<string>();
    const tamaños: number[] = [];
    for (const p of [1, 2, 3]) {
      const page = (await requestJson(`/api/actividades?page=${p}&pageSize=25`)).data;
      tamaños.push(page.items.length);
      for (const item of page.items) vistos.add(item.id);
    }
    expect(tamaños).toEqual([25, 25, 10]);
    expect(vistos.size).toBe(60);
    expect([...vistos].sort()).toEqual(
      Array.from({ length: 60 }, (_, k) => `a${String(k + 1).padStart(2, '0')}`).sort(),
    );
  });

  it('tipoNombre via LEFT JOIN en cada item: { id, tipoId, tipoNombre, fecha, hora, descripcion }', async () => {
    seedActividades(1); // a01, tipo_id 't-reunion'

    const { status, data } = await requestJson('/api/actividades');

    expect(status).toBe(200);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toEqual({
      id: 'a01',
      tipoId: 't-reunion',
      tipoNombre: 'Reunión',
      fecha: '2026-01-15',
      hora: '18:00',
      descripcion: null,
    });
  });

  it('tipoId sin tipo resoluble → tipoNombre null (LEFT JOIN dangle, regresión join-fixes)', async () => {
    seedActividades(1);
    // @otb/db activa foreign_keys=ON (packages/db/src/index.ts:14) → el DELETE
    // del tipo con hijos vivos viola la FK del padre. Se desactiva el pragma
    // solo durante la simulación del dangle (fallback D60: "borrar la fila del
    // tipo") y se restaura de inmediato. limpiarDatos NO repone el tipo → se
    // re-siembra al final para no romper los tests siguientes.
    ejecutar('PRAGMA foreign_keys = OFF');
    ejecutar("DELETE FROM tipos_actividad WHERE id = 't-reunion'");
    ejecutar('PRAGMA foreign_keys = ON');

    const { status, data } = await requestJson('/api/actividades');

    expect(status).toBe(200);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].id).toBe('a01');
    expect(data.items[0].tipoId).toBe('t-reunion');
    expect(data.items[0].tipoNombre).toBeNull();
    // El beforeEach re-siembra el tipo para los tests siguientes.
  });
});

describe('GET /api/actividades/catalogo — array plano completo (R4)', () => {
  it('devuelve las 60 actividades en array plano SIN envelope, mismo ORDER BY y tipoNombre', async () => {
    seedActividades(60);

    const { status, data } = await requestJson('/api/actividades/catalogo');

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(60);
    expect(data.items).toBeUndefined();
    expect(data.total).toBeUndefined();
    // Mismo ORDER BY desc(fecha), desc(id) (cross-check SQL crudo).
    const sqlIds = filas(
      'SELECT id FROM actividades ORDER BY fecha DESC, id DESC',
    ).map((r) => r.id);
    expect(data.map((a: any) => a.id)).toEqual(sqlIds);
    // cada item incluye tipoNombre (mismo shape que los items paginados).
    expect(data.every((a: any) => a.tipoNombre === 'Reunión' && a.tipoId === 't-reunion')).toBe(
      true,
    );
  });

  it('ignora page/pageSize: ?page=2&pageSize=10 → siguen siendo las 60', async () => {
    seedActividades(60);

    const { status, data } = await requestJson('/api/actividades/catalogo?page=2&pageSize=10');

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(60);
  });
});