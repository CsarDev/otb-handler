// Suite NUEVA — socios envelope (D60, U1). NO existía suite de socios: espeja
// la matriz de envelope de multas.test.ts (D40) sobre GET /api/socios.
//
// 1) GET /api/socios SIEMPRE responde el envelope `{ items, total, page,
//    pageSize }` (reemplaza el array plano): defaults 1/25 vía parsePaginacion,
//    cap 100, fallbacks para no-integers/negativos, total = COUNT filtrado
//    ANTES de la paginación (mismo FROM + LEFT JOIN estadosSocio + WHERE, incl.
//    subquery grupoId — D52).
// 2) ORDER BY asc(nombre), asc(apellidoPaterno), asc(id) (directorio, D53);
//    tiebreak PK → orden total sin duplicados/gaps entre páginas (R2).
// 3) NUEVO GET /api/socios/catalogo → array plano FULL `armarSocio` (mismo
//    ORDER BY, ignora page/pageSize) — consumidores-selector (multas/aportes/
//    asistencia/reportes) siguen listando el catálogo completo (R5).
//
// Escrito RED antes del cambio GREEN en socios.ts (T1.1): hoy el endpoint
// devuelve un array plano, así que `data.items`/`data.total` no existen.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  migrarDb,
  limpiarDatos,
  requestJson,
  crearSocio,
  crearGrupo,
  filas,
  ejecutar,
  IDS,
} from './helpers';

beforeAll(() => migrarDb());
beforeEach(() => limpiarDatos());

/** Crea `n` socios (est-activo por defecto) y devuelve sus ids. */
async function crearSocios(n: number, overrides: Record<string, unknown> = {}): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const { status, data } = await crearSocio({
      nombre: `Socio${String(i).padStart(2, '0')}`,
      apellidoPaterno: 'Test',
      aporteIds: [],
      ...overrides,
    });
    if (status !== 201) throw new Error(`crearSocio ${i} falló (${status}): ${JSON.stringify(data)}`);
    ids.push(data.id);
  }
  return ids;
}

describe('GET /api/socios — envelope paginado (spec listado-socios-paginado)', () => {
  it('escenario default: 60 socios → { items: [25], total: 60, page: 1, pageSize: 25 }', async () => {
    await crearSocios(60);

    const { status, data } = await requestJson('/api/socios');

    expect(status).toBe(200);
    expect(data.items).toHaveLength(25);
    expect(data.total).toBe(60);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(25);
  });

  it('pageSize=500 → clamp a 100 (echo 100; 60 < 100 → 60 items)', async () => {
    await crearSocios(60);

    const { status, data } = await requestJson('/api/socios?pageSize=500');

    expect(status).toBe(200);
    expect(data.pageSize).toBe(100);
    expect(data.total).toBe(60);
    expect(data.items).toHaveLength(60);
  });

  it('page=9 fuera de rango → { items: [], total: 60, page: 9, pageSize: 25 }', async () => {
    await crearSocios(60);

    const { status, data } = await requestJson('/api/socios?page=9&pageSize=25');

    expect(status).toBe(200);
    expect(data.items).toEqual([]);
    expect(data.total).toBe(60);
    expect(data.page).toBe(9);
    expect(data.pageSize).toBe(25);
  });

  it('lista vacía → { items: [], total: 0, page: 1, pageSize: 25 }', async () => {
    const { status, data } = await requestJson('/api/socios');

    expect(status).toBe(200);
    expect(data).toEqual({ items: [], total: 0, page: 1, pageSize: 25 });
  });

  it('page=abc&pageSize=-5 → fallback a defaults page 1 / pageSize 25', async () => {
    await crearSocios(60);

    const { status, data } = await requestJson('/api/socios?page=abc&pageSize=-5');

    expect(status).toBe(200);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(25);
    expect(data.items).toHaveLength(25);
  });

  it('orden determinista: asc(nombre), asc(apellidoPaterno), asc(id), sin duplicados/gaps', async () => {
    const ids = await crearSocios(60);

    const page1 = (await requestJson('/api/socios?page=1&pageSize=25')).data;
    // Cross-check con SQL crudo: el orden de la API espeja ORDER BY nombre,
    // apellido_paterno, id (tiebreak PK — D53).
    const sqlIds = filas('SELECT id FROM socios ORDER BY nombre ASC, apellido_paterno ASC, id ASC LIMIT 25').map(
      (r) => r.id,
    );
    expect(page1.items.map((i: any) => i.id)).toEqual(sqlIds);

    // Unión de páginas 1..3 = las 60, sin duplicados ni gaps.
    const vistos = new Set<string>();
    const tamaños: number[] = [];
    for (const p of [1, 2, 3]) {
      const page = (await requestJson(`/api/socios?page=${p}&pageSize=25`)).data;
      tamaños.push(page.items.length);
      for (const item of page.items) vistos.add(item.id);
    }
    expect(tamaños).toEqual([25, 25, 10]);
    expect(vistos.size).toBe(60);
    expect([...vistos].sort()).toEqual([...ids].sort());
  });

  it('filtro search: 40 socios, 10 "Juan" en nombre → { items: [10], total: 10 }', async () => {
    await crearSocios(30); // Socio00..Socio29, apellidoPaterno 'Test'
    for (let i = 0; i < 10; i++) {
      const { status } = await crearSocio({
        nombre: 'Juan',
        apellidoPaterno: `Test${i}`,
        aporteIds: [],
      });
      expect(status).toBe(201);
    }

    const { status, data } = await requestJson('/api/socios?search=juan&pageSize=25');

    expect(status).toBe(200);
    expect(data.total).toBe(10);
    expect(data.items).toHaveLength(10);
    expect(data.items.every((i: any) => i.nombre === 'Juan')).toBe(true);
  });

  it('filtros combinados grupoId + estadoId → subset + total (COUNT con subquery espejo)', async () => {
    const g1 = await crearGrupo('Grupo A');
    const g2 = await crearGrupo('Grupo B');
    const s1 = (
      await crearSocio({ nombre: 'S1', apellidoPaterno: 'T', aporteIds: [], grupoPrimarioId: g1 })
    ).data.id;
    const s2 = (
      await crearSocio({
        nombre: 'S2',
        apellidoPaterno: 'T',
        aporteIds: [],
        grupoAdicionalIds: [g1], // membresía vía `socio_grupos` (subquery)
      })
    ).data.id;
    const s3 = (
      await crearSocio({ nombre: 'S3', apellidoPaterno: 'T', aporteIds: [], grupoPrimarioId: g2 })
    ).data.id;
    // s4 en g2 con estado suspendido → excluido por el filtro de estado.
    await crearSocio({
      nombre: 'S4',
      apellidoPaterno: 'T',
      aporteIds: [],
      estadoId: IDS.estSuspendido,
      grupoPrimarioId: g2,
    });

    // g1 + est-activo → s1 (primario) + s2 (adicional vía subquery).
    const res = await requestJson(`/api/socios?grupoId=${g1}&estadoId=${IDS.estActivo}&page=1`);
    expect(res.status).toBe(200);
    expect(res.data.items.map((i: any) => i.id).sort()).toEqual([s1, s2].sort());
    expect(res.data.total).toBe(2);

    // g1 + est-suspendido → 0 (sin miembros suspendidos en g1; COUNT espeja el WHERE).
    const res2 = await requestJson(`/api/socios?grupoId=${g1}&estadoId=${IDS.estSuspendido}`);
    expect(res2.status).toBe(200);
    expect(res2.data.items).toEqual([]);
    expect(res2.data.total).toBe(0);
  });

  it('filtro sin matches → { items: [], total: 0, page: 1, pageSize: 25 }', async () => {
    await crearSocios(10);

    const { status, data } = await requestJson('/api/socios?search=zzzz-no-match');

    expect(status).toBe(200);
    expect(data).toEqual({ items: [], total: 0, page: 1, pageSize: 25 });
  });

  it('shape R4: item FULL armarSocio (estadoNombre/estadoColor/esActivo/grupos/aporteIds/aportesInherited)', async () => {
    const g1 = await crearGrupo('Grupo A');
    // Aporte heredado por grupo: ap-familiar aplica a g1 vía la join M:N.
    ejecutar('INSERT INTO aportes_definicion_grupos (definition_id, grupo_id) VALUES (?, ?)', [
      IDS.apFamiliar,
      g1,
    ]);
    await crearSocio({
      nombre: 'Enriquecido',
      apellidoPaterno: 'Test',
      grupoAdicionalIds: [g1], // `grupos` en el shape = solo adicionales (socio_grupos)
      aporteIds: [IDS.apMensual], // directo
    });

    const { status, data } = await requestJson('/api/socios?search=Enriquecido&pageSize=25');

    expect(status).toBe(200);
    expect(data.items).toHaveLength(1);
    const socio = data.items[0];
    expect(socio.estadoNombre).toBeDefined();
    expect(socio.estadoColor).toBeDefined();
    expect(socio.esActivo).toBeDefined();
    expect(socio.grupos).toEqual([{ id: g1, nombre: 'Grupo A' }]);
    expect(socio.aporteIds).toEqual([IDS.apMensual]);
    // ap-familiar viene por grupo (inherited); ap-mensual es directo → no se repite.
    expect(socio.aportesInherited).toEqual([
      { id: IDS.apFamiliar, nombre: 'Aporte Familiar', grupoId: g1, grupoNombre: 'Grupo A' },
    ]);
  });
});

describe('GET /api/socios/catalogo — array plano FULL (R5)', () => {
  it('devuelve los 60 socios en array plano SIN envelope, mismo ORDER BY', async () => {
    await crearSocios(60);

    const { status, data } = await requestJson('/api/socios/catalogo');

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(60);
    expect(data.items).toBeUndefined();
    expect(data.total).toBeUndefined();
    // Mismo ORDER BY alfabético (cross-check SQL crudo).
    const sqlIds = filas('SELECT id FROM socios ORDER BY nombre ASC, apellido_paterno ASC, id ASC').map(
      (r) => r.id,
    );
    expect(data.map((s: any) => s.id)).toEqual(sqlIds);
  });

  it('ignora page/pageSize: ?page=2&pageSize=10 → siguen siendo los 60', async () => {
    await crearSocios(60);

    const { status, data } = await requestJson('/api/socios/catalogo?page=2&pageSize=10');

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(60);
  });

  it('acepta los filtros y devuelve shape full en cada item', async () => {
    const g1 = await crearGrupo('Grupo A');
    await crearSocio({
      nombre: 'Enriquecido',
      apellidoPaterno: 'Test',
      grupoAdicionalIds: [g1],
      aporteIds: [IDS.apMensual],
    });

    const { status, data } = await requestJson('/api/socios/catalogo?search=Enriquecido');

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].estadoNombre).toBeDefined();
    expect(data[0].grupos).toEqual([{ id: g1, nombre: 'Grupo A' }]);
    expect(data[0].aporteIds).toEqual([IDS.apMensual]);
    expect(data[0].aportesInherited).toEqual([]);
  });
});