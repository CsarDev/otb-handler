// Phase 6 / multiselect-paginacion-listas — suite NUEVA (D40, Slice A).
//
// 1) POST /api/multas/bulk con `grupoIds` (payments spec scenarios 1-8): el set
//    objetivo es la unión DEDUPED de los `socioIds` directos y los miembros
//    ACTUALES (primario O adicional) de todos los grupos; se reutiliza el filtro
//    de permiso existente (`permite(...,'multas')`) y el loop bulk; una multa
//    por socio; semántica POINT-IN-TIME (un socio que ingresa después NO es
//    retrocargado); sin tracking M:N (`multa_grupos` NO existe).
// 2) GET /api/multas — envelope `{ items, total, page, pageSize }` (pagination
//    spec): ORDER BY fecha_gen DESC, id DESC, clamps/fallbacks, filtros ANTES de
//    paginar con COUNT que espeja el mismo FROM + LEFT JOIN + WHERE.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  migrarDb,
  limpiarDatos,
  requestJson,
  crearSocio,
  crearGrupo,
  filas,
  fila,
  ejecutar,
  IDS,
} from './helpers';

beforeAll(() => migrarDb());
beforeEach(() => limpiarDatos());

const CONCEPTO = 'Falta injustificada';
const MONTO = 50;

function bulkMultas(body: Record<string, unknown>) {
  return requestJson('/api/multas/bulk', { method: 'POST', body });
}

/** Crea `n` socios (est-activo por defecto → permiten 'multas') y devuelve sus ids. */
async function crearSocios(n: number, overrides: Record<string, unknown> = {}): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const { status, data } = await crearSocio({
      nombre: `Socio${i}`,
      apellidoPaterno: 'Test',
      aporteIds: [],
      ...overrides,
    });
    if (status !== 201)
      throw new Error(`crearSocio ${i} falló (${status}): ${JSON.stringify(data)}`);
    ids.push(data.id);
  }
  return ids;
}

describe('POST /api/multas/bulk — grupoIds (payments 1-8)', () => {
  it('escenario 1: [g1] con s1 primario + s2 adicional → 201 { count: 2 }, una multa por socio', async () => {
    const g1 = await crearGrupo('Grupo A');
    const s1 = (
      await crearSocio({ nombre: 'S1', apellidoPaterno: 'T', aporteIds: [], grupoPrimarioId: g1 })
    ).data.id;
    const s2 = (
      await crearSocio({
        nombre: 'S2',
        apellidoPaterno: 'T',
        aporteIds: [],
        grupoAdicionalIds: [g1],
      })
    ).data.id;

    const { status, data } = await bulkMultas({ grupoIds: [g1], concepto: CONCEPTO, monto: MONTO });

    expect(status).toBe(201);
    expect(data.count).toBe(2);
    expect(data.items).toHaveLength(2);
    expect(new Set(data.items.map((i: any) => i.socioId))).toEqual(new Set([s1, s2]));
    for (const item of data.items) {
      expect(item.concepto).toBe(CONCEPTO);
      expect(item.monto).toBe(MONTO);
    }
    expect(fila('SELECT COUNT(*) AS n FROM multas WHERE socio_id = ?', [s1])).toMatchObject({
      n: 1,
    });
    expect(fila('SELECT COUNT(*) AS n FROM multas WHERE socio_id = ?', [s2])).toMatchObject({
      n: 1,
    });
  });

  it('escenario 2: socio en el grupo Y en socioIds se carga UNA sola vez (dedup de la unión)', async () => {
    const g1 = await crearGrupo('Grupo A');
    const s1 = (
      await crearSocio({ nombre: 'S1', apellidoPaterno: 'T', aporteIds: [], grupoPrimarioId: g1 })
    ).data.id;
    const s2 = (await crearSocio({ nombre: 'S2', apellidoPaterno: 'T', aporteIds: [] })).data.id;

    const { status, data } = await bulkMultas({
      socioIds: [s1, s2],
      grupoIds: [g1],
      concepto: 'x',
      monto: 10,
    });

    expect(status).toBe(201);
    expect(data.count).toBe(2);
    expect(fila('SELECT COUNT(*) AS n FROM multas WHERE socio_id = ?', [s1])).toMatchObject({
      n: 1,
    });
    expect(fila('SELECT COUNT(*) AS n FROM multas WHERE socio_id = ?', [s2])).toMatchObject({
      n: 1,
    });
  });

  it('escenario 3: grupo vacío no aporta multas (count 1 solo del socio directo)', async () => {
    const gEmpty = await crearGrupo('Grupo Vacío');
    const s2 = (await crearSocio({ nombre: 'S2', apellidoPaterno: 'T', aporteIds: [] })).data.id;

    const { status, data } = await bulkMultas({
      socioIds: [s2],
      grupoIds: [gEmpty],
      concepto: 'x',
      monto: 10,
    });

    expect(status).toBe(201);
    expect(data.count).toBe(1);
    expect(data.items[0].socioId).toBe(s2);
    expect(filas('SELECT * FROM multas')).toHaveLength(1);
  });

  it('escenario 4: miembro cuyo estado NO permite multas queda excluido (count 1)', async () => {
    const g1 = await crearGrupo('Grupo A');
    const s1 = (
      await crearSocio({ nombre: 'S1', apellidoPaterno: 'T', aporteIds: [], grupoPrimarioId: g1 })
    ).data.id;
    const s3 = (
      await crearSocio({
        nombre: 'S3',
        apellidoPaterno: 'T',
        aporteIds: [],
        estadoId: IDS.estSuspendido,
        grupoAdicionalIds: [g1],
      })
    ).data.id;

    const { status, data } = await bulkMultas({ grupoIds: [g1], concepto: 'x', monto: 10 });

    expect(status).toBe(201);
    expect(data.count).toBe(1);
    expect(data.items[0].socioId).toBe(s1);
    expect(filas('SELECT * FROM multas WHERE socio_id = ?', [s3])).toHaveLength(0);
  });

  it('escenario 5: socio que ingresa al grupo DESPUÉS no es retrocargado (point-in-time, sin M:N)', async () => {
    const g1 = await crearGrupo('Grupo A');
    const s1 = (
      await crearSocio({ nombre: 'S1', apellidoPaterno: 'T', aporteIds: [], grupoPrimarioId: g1 })
    ).data.id;

    const { status, data } = await bulkMultas({ grupoIds: [g1], concepto: 'x', monto: 10 });
    expect(status).toBe(201);
    expect(data.count).toBe(1);
    expect(filas('SELECT * FROM multas')).toHaveLength(1);

    // s9 se une a g1 DESPUÉS de la creación (cambio de membresía posterior).
    const s9 = (await crearSocio({ nombre: 'S9', apellidoPaterno: 'T', aporteIds: [] })).data.id;
    ejecutar('UPDATE socios SET grupo_primario_id = ? WHERE id = ?', [g1, s9]);

    expect(filas('SELECT * FROM multas')).toHaveLength(1); // sin retrocarga
    expect(filas('SELECT * FROM multas WHERE socio_id = ?', [s9])).toHaveLength(0);
    // NO existe la tabla M:N `multa_grupos` (semántica point-in-time, sin tracking).
    expect(
      filas("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'multa_grupos'"),
    ).toHaveLength(0);
  });

  it('escenario 6: grupoId desconocido → 400 y NO crea multas', async () => {
    const s1 = (await crearSocio({ nombre: 'S1', apellidoPaterno: 'T', aporteIds: [] })).data.id;

    const { status, data } = await bulkMultas({
      socioIds: [s1],
      grupoIds: ['fake-group'],
      concepto: 'x',
      monto: 10,
    });

    expect(status).toBe(400);
    expect(data).toEqual({ error: 'grupoIds contains an invalid group' });
    expect(filas('SELECT * FROM multas')).toHaveLength(0);
  });

  it('escenario 7: grupoIds no-array → 400', async () => {
    const s1 = (await crearSocio({ nombre: 'S1', apellidoPaterno: 'T', aporteIds: [] })).data.id;

    const { status, data } = await bulkMultas({
      socioIds: [s1],
      grupoIds: 'g1',
      concepto: 'x',
      monto: 10,
    });

    expect(status).toBe(400);
    expect(data).toEqual({ error: 'grupoIds must be an array' });
    expect(filas('SELECT * FROM multas')).toHaveLength(0);
  });

  it('escenario 8 (regresión): sin grupoIds se comporta exactamente como hoy (s2 excluido → count 1)', async () => {
    const s1 = (await crearSocio({ nombre: 'S1', apellidoPaterno: 'T', aporteIds: [] })).data.id;
    const s2 = (
      await crearSocio({
        nombre: 'S2',
        apellidoPaterno: 'T',
        aporteIds: [],
        estadoId: IDS.estSuspendido,
      })
    ).data.id;

    const { status, data } = await bulkMultas({ socioIds: [s1, s2], concepto: 'Falta', monto: 30 });

    expect(status).toBe(201);
    expect(data.count).toBe(1);
    expect(data.items[0].socioId).toBe(s1);
    expect(filas('SELECT * FROM multas WHERE socio_id = ?', [s2])).toHaveLength(0);
  });

  it('escenario 9: grupo cuyo TODOS los miembros quedan excluidos → 400 con el mensaje existente', async () => {
    const g1 = await crearGrupo('Grupo A');
    await crearSocio({
      nombre: 'S3',
      apellidoPaterno: 'T',
      aporteIds: [],
      estadoId: IDS.estSuspendido,
      grupoPrimarioId: g1,
    });

    const { status, data } = await bulkMultas({ grupoIds: [g1], concepto: 'x', monto: 10 });

    expect(status).toBe(400);
    expect(data).toEqual({
      error: 'Ningún socio puede participar en esta acción en su estado actual',
    });
    expect(filas('SELECT * FROM multas')).toHaveLength(0);
  });

  it('sin socioIds ni grupoIds → 400 con el mensaje requerido de siempre', async () => {
    const { status, data } = await bulkMultas({ concepto: 'x', monto: 10 });

    expect(status).toBe(400);
    expect(data).toEqual({ error: 'socioIds (array), concepto, and monto are required' });
    expect(filas('SELECT * FROM multas')).toHaveLength(0);
  });

  it('grupoIds vacío sin socioIds → 400 (equivale a ausente: socioIds sigue requerido)', async () => {
    const { status, data } = await bulkMultas({ grupoIds: [], concepto: 'x', monto: 10 });

    expect(status).toBe(400);
    expect(data).toEqual({ error: 'socioIds (array), concepto, and monto are required' });
  });
});

describe('GET /api/multas — envelope paginado (pagination spec)', () => {
  /** 60 multas en 3 fechas distintas (3 bulks × 20 socios); devuelve ids por fecha (fecha más reciente primero). */
  async function sembrar60Multas(): Promise<string[][]> {
    const idsPorFecha: string[][] = [];
    for (const fecha of ['2026-03-15', '2026-02-15', '2026-01-15']) {
      const socios = await crearSocios(20);
      const { status, data } = await bulkMultas({
        socioIds: socios,
        concepto: CONCEPTO,
        monto: MONTO,
        fecha,
      });
      if (status !== 201) throw new Error(`bulk falló (${status}): ${JSON.stringify(data)}`);
      idsPorFecha.push(data.items.map((i: any) => i.id));
    }
    return idsPorFecha;
  }

  it('escenario default: 60 multas → { items: [25], total: 60, page: 1, pageSize: 25 }', async () => {
    await sembrar60Multas();

    const { status, data } = await requestJson('/api/multas');

    expect(status).toBe(200);
    expect(data.items).toHaveLength(25);
    expect(data.total).toBe(60);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(25);
  });

  it('pageSize=500 → clamp a 100 (echo 100, todos los items porque 60 < 100)', async () => {
    await sembrar60Multas();

    const { status, data } = await requestJson('/api/multas?pageSize=500');

    expect(status).toBe(200);
    expect(data.pageSize).toBe(100);
    expect(data.total).toBe(60);
    expect(data.items).toHaveLength(60);
  });

  it('page=9 fuera de rango → { items: [], total: 60, page: 9, pageSize: 25 }', async () => {
    await sembrar60Multas();

    const { status, data } = await requestJson('/api/multas?page=9&pageSize=25');

    expect(status).toBe(200);
    expect(data.items).toEqual([]);
    expect(data.total).toBe(60);
    expect(data.page).toBe(9);
    expect(data.pageSize).toBe(25);
  });

  it('lista vacía → { items: [], total: 0, page: 1, pageSize: 25 }', async () => {
    const { status, data } = await requestJson('/api/multas');

    expect(status).toBe(200);
    expect(data).toEqual({ items: [], total: 0, page: 1, pageSize: 25 });
  });

  it('page=abc&pageSize=-5 → fallback a defaults page 1 / pageSize 25', async () => {
    await sembrar60Multas();

    const { status, data } = await requestJson('/api/multas?page=abc&pageSize=-5');

    expect(status).toBe(200);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(25);
    expect(data.items).toHaveLength(25);
  });

  it('orden determinista: fechaGen DESC + id DESC, sin duplicados/gaps entre páginas', async () => {
    const [marzo, febrero, enero] = await sembrar60Multas();
    const marzoDesc = [...marzo].sort().reverse();
    const febreroDesc = [...febrero].sort().reverse();

    const page1 = (await requestJson('/api/multas?page=1&pageSize=25')).data;
    // Página 1 = las 20 de marzo (id DESC) + las 5 primeras de febrero (id DESC).
    expect(page1.items.map((i: any) => i.id)).toEqual([...marzoDesc, ...febreroDesc.slice(0, 5)]);

    // Unión de páginas 1..3 = las 60, sin duplicados ni gaps.
    const vistos = new Set<string>();
    const tamaños: number[] = [];
    for (const p of [1, 2, 3]) {
      const page = (await requestJson(`/api/multas?page=${p}&pageSize=25`)).data;
      tamaños.push(page.items.length);
      for (const item of page.items) vistos.add(item.id);
    }
    expect(tamaños).toEqual([25, 25, 10]);
    expect(vistos.size).toBe(60);

    // Cross-check con SQL crudo: el orden de la API espeja ORDER BY fecha_gen DESC, id DESC.
    const sqlIds = filas('SELECT id FROM multas ORDER BY fecha_gen DESC, id DESC').map((r) => r.id);
    expect(page1.items.map((i: any) => i.id)).toEqual(sqlIds.slice(0, 25));
  });

  it('filtro estado=anulado sobre 40 multas (10 anuladas) → { items: [10], total: 10 }', async () => {
    const socios = await crearSocios(40);
    const bulk = await bulkMultas({
      socioIds: socios,
      concepto: CONCEPTO,
      monto: MONTO,
      fecha: '2026-03-15',
    });
    expect(bulk.status).toBe(201);
    expect(bulk.data.count).toBe(40);

    for (const item of bulk.data.items.slice(0, 10)) {
      const anulada = await requestJson(`/api/multas/${item.id}/anular`, {
        method: 'POST',
        body: { razon: 'test' },
      });
      expect(anulada.status).toBe(200);
    }

    const { status, data } = await requestJson('/api/multas?estado=anulado&pageSize=25');

    expect(status).toBe(200);
    expect(data.items).toHaveLength(10);
    expect(data.total).toBe(10);
    // Regresión: el filtro estado=anulado sigue devolviendo SOLO anuladas.
    expect(data.items.every((i: any) => i.estado === 'anulado')).toBe(true);
  });

  it('filtros combinados grupoId + estadoId → subset + total (COUNT con los mismos joins)', async () => {
    const g1 = await crearGrupo('Grupo A');
    const g2 = await crearGrupo('Grupo B');
    const s1 = (
      await crearSocio({ nombre: 'S1', apellidoPaterno: 'T', aporteIds: [], grupoPrimarioId: g1 })
    ).data.id;
    const s2 = (
      await crearSocio({ nombre: 'S2', apellidoPaterno: 'T', aporteIds: [], grupoPrimarioId: g1 })
    ).data.id;
    const s3 = (
      await crearSocio({ nombre: 'S3', apellidoPaterno: 'T', aporteIds: [], grupoPrimarioId: g2 })
    ).data.id;
    // s4 en g2 con estado suspendido → sin multa (excluido ya en el bulk).
    await crearSocio({
      nombre: 'S4',
      apellidoPaterno: 'T',
      aporteIds: [],
      estadoId: IDS.estSuspendido,
      grupoPrimarioId: g2,
    });

    const bulk = await bulkMultas({
      socioIds: [s1, s2, s3],
      concepto: CONCEPTO,
      monto: MONTO,
      fecha: '2026-03-15',
    });
    expect(bulk.status).toBe(201);

    // g1 + est-activo → solo s1 y s2.
    const res = await requestJson(`/api/multas?grupoId=${g1}&estadoId=${IDS.estActivo}&page=1`);
    expect(res.status).toBe(200);
    expect(res.data.items.map((i: any) => i.socioId).sort()).toEqual([s1, s2].sort());
    expect(res.data.total).toBe(2);

    // g1 + est-suspendido → 0 (el filtro de estado aplica sobre el socio via LEFT JOIN).
    const res2 = await requestJson(`/api/multas?grupoId=${g1}&estadoId=${IDS.estSuspendido}`);
    expect(res2.status).toBe(200);
    expect(res2.data.items).toEqual([]);
    expect(res2.data.total).toBe(0);
  });
});
