// Phase 6 / Capability payments: generación BULK y BULK/ALL definition-driven
// (D8, D9 — monto y count de la definición, NO override) + GET /:id/pagos
// preservado (movimientos ingreso no anulados, orden, vacío, 404). Los ids de
// las definiciones son UUIDs del server (D14) → helper `crearDefinicion`;
// `crearSocio` auto-genera la gestión actual (D16) → los endpoints manuales
// apuntan a 2025 o a ventanas que no cubren el año actual. Los re-runs de
// bulk/bulk-all son dedup-safe (D13): `{ count: 0, items: [] }`.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrarDb, limpiarDatos, requestJson, crearSocio, crearDefinicion, fila, filas, ejecutar, IDS } from './helpers';

beforeAll(() => migrarDb());
beforeEach(() => limpiarDatos());

const NO_ELIGIBLES = 'Ningún socio puede participar en esta acción en su estado actual';

function bulk(body: Record<string, unknown>) {
  return requestJson('/api/aportes/bulk', { method: 'POST', body });
}

function bulkAll(body: Record<string, unknown>) {
  return requestJson('/api/aportes/bulk/all', { method: 'POST', body });
}

describe('Aportes — POST /api/aportes/bulk (definition-driven)', () => {
  it('bulk mensual usa el monto de la definición y genera 2 registros por socio', async () => {
    const def = await crearDefinicion({
      nombre: 'Bulk',
      monto: 50,
      recurrencia: 'mensual',
      inicio: '2025-04-01',
      fin: '2025-05-31',
    });
    const s1 = (await crearSocio({ aporteIds: [def.id] })).data.id;
    const s2 = (await crearSocio({ aporteIds: [def.id] })).data.id;

    const { status, data } = await bulk({ socioIds: [s1, s2], aporteIds: [def.id], gestion: 2025 });

    expect(status).toBe(201);
    expect(data.count).toBe(4);
    for (const item of data.items) expect(item.montoBase).toBe(50);

    const rows = filas('SELECT socio_id, monto_base, aporte_id FROM aportes');
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.monto_base === 50 && r.aporte_id === def.id)).toBe(true);
  });

  it('bulk anual crea 12 registros por socio (mes 1..12)', async () => {
    const def = await crearDefinicion({ nombre: 'Anual Bulk', monto: 500, recurrencia: 'anual' });
    const s1 = (await crearSocio({ aporteIds: [def.id] })).data.id;
    const s2 = (await crearSocio({ aporteIds: [def.id] })).data.id;

    const { status, data } = await bulk({ socioIds: [s1, s2], aporteIds: [def.id], gestion: 2025 });

    expect(status).toBe(201);
    expect(data.count).toBe(24);

    const mesesS1 = data.items
      .filter((i: any) => i.socioId === s1)
      .map((i: any) => i.mes)
      .sort((a: number, b: number) => a - b);
    expect(mesesS1).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('rechaza monto/tipo en el body (no override) con 400 y no crea registros para la gestión pedida', async () => {
    const s1 = (await crearSocio()).data.id;

    const { status, data } = await bulk({ socioIds: [s1], aporteIds: [IDS.apMensual], gestion: 2025, monto: 999 });

    expect(status).toBe(400);
    expect(data.error).toMatch(/no se acepta override/);
    // crearSocio ya auto-generó la gestión actual (D16); la pedida (2025) queda vacía.
    expect(filas('SELECT * FROM aportes WHERE gestion = 2025')).toHaveLength(0);
  });

  it('excluye socios cuyo estado no permite aportes', async () => {
    const s1 = (await crearSocio({ aporteIds: [IDS.apMensual] })).data.id; // est-activo → permite
    const s2 = (await crearSocio({ estadoId: IDS.estSuspendido, aporteIds: [IDS.apMensual] })).data.id; // NO permite

    const { status, data } = await bulk({ socioIds: [s1, s2], aporteIds: [IDS.apMensual], gestion: 2025 });

    expect(status).toBe(201);
    expect(data.items.every((i: any) => i.socioId === s1)).toBe(true);
    expect(data.count).toBe(12); // ap-mensual sin ventana → 12 meses, solo s1

    const rows = filas('SELECT DISTINCT socio_id FROM aportes');
    expect(rows.map((r) => r.socio_id)).toEqual([s1]);
  });

  it('bulk con todos los socios excluidos devuelve 400', async () => {
    const s2 = (await crearSocio({ estadoId: IDS.estSuspendido, aporteIds: [IDS.apMensual] })).data.id;

    const { status, data } = await bulk({ socioIds: [s2], aporteIds: [IDS.apMensual], gestion: 2025 });

    expect(status).toBe(400);
    expect(data.error).toBe(NO_ELIGIBLES);
  });

  it('bulk con una definición inactiva devuelve 400', async () => {
    const def = await crearDefinicion({ nombre: 'Inactivo Bulk', monto: 10, activo: 0 });
    const s1 = (await crearSocio()).data.id;

    const { status, data } = await bulk({ socioIds: [s1], aporteIds: [def.id], gestion: 2025 });

    expect(status).toBe(400);
    expect(data.error).toMatch(/está inactiva/);
  });

  it('re-run de un bulk ya materializado es dedup-safe ({ count: 0, items: [] })', async () => {
    const def = await crearDefinicion({
      nombre: 'Bulk ReRun',
      monto: 50,
      recurrencia: 'mensual',
      inicio: '2025-04-01',
      fin: '2025-05-31',
    });
    const s1 = (await crearSocio({ aporteIds: [def.id] })).data.id;
    const s2 = (await crearSocio({ aporteIds: [def.id] })).data.id;

    const primero = await bulk({ socioIds: [s1, s2], aporteIds: [def.id], gestion: 2025 });
    expect(primero.status).toBe(201);
    expect(primero.data.count).toBe(4);

    const segundo = await bulk({ socioIds: [s1, s2], aporteIds: [def.id], gestion: 2025 });
    expect(segundo.status).toBe(201);
    expect(segundo.data).toEqual({ count: 0, items: [] });

    const total = fila('SELECT COUNT(*) AS n FROM aportes WHERE aporte_id = ?', [def.id]);
    expect(total).toMatchObject({ n: 4 });
  });
});

describe('Aportes — POST /api/aportes/bulk/all (solo permitidos por estado)', () => {
  it('genera solo para socios permitidos que sostienen la definición', async () => {
    const s1 = (await crearSocio({ aporteIds: [IDS.apMensual] })).data.id; // permite + sostiene
    await crearSocio({ estadoId: IDS.estSuspendido, aporteIds: [IDS.apMensual] }); // no permite
    await crearSocio({ aporteIds: [] }); // permite pero no sostiene la definición

    const { status, data } = await bulkAll({ aporteIds: [IDS.apMensual], gestion: 2025 });

    expect(status).toBe(201);
    expect(data.items.every((i: any) => i.socioId === s1)).toBe(true);
    expect(data.count).toBe(12);

    const rows = filas('SELECT DISTINCT socio_id FROM aportes');
    expect(rows.map((r) => r.socio_id)).toEqual([s1]);
  });

  it('bulk/all sin socios elegibles devuelve 400', async () => {
    await crearSocio({ estadoId: IDS.estSuspendido });
    await crearSocio({ estadoId: IDS.estInactivo });

    const { status, data } = await bulkAll({ aporteIds: [IDS.apMensual], gestion: 2025 });

    expect(status).toBe(400);
    expect(data.error).toBe(NO_ELIGIBLES);
  });

  it('bulk/all anual crea 12 registros mes 1..12 por socio permitido', async () => {
    const def = await crearDefinicion({ nombre: 'Anual All', monto: 500, recurrencia: 'anual' });
    const s1 = (await crearSocio({ aporteIds: [def.id] })).data.id;

    const { status, data } = await bulkAll({ aporteIds: [def.id], gestion: 2025 });

    expect(status).toBe(201);
    expect(data.count).toBe(12);
    const meses = data.items.map((i: any) => i.mes).sort((a: number, b: number) => a - b);
    expect(meses).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(data.items.every((i: any) => i.socioId === s1)).toBe(true);
  });

  it('re-run de un bulk/all ya materializado es dedup-safe ({ count: 0, items: [] })', async () => {
    const def = await crearDefinicion({
      nombre: 'All ReRun',
      monto: 50,
      recurrencia: 'mensual',
      inicio: '2025-04-01',
      fin: '2025-05-31',
    });
    await crearSocio({ aporteIds: [def.id] });
    await crearSocio({ aporteIds: [def.id] });

    const primero = await bulkAll({ aporteIds: [def.id], gestion: 2025 });
    expect(primero.status).toBe(201);
    expect(primero.data.count).toBe(4);

    const segundo = await bulkAll({ aporteIds: [def.id], gestion: 2025 });
    expect(segundo.status).toBe(201);
    expect(segundo.data).toEqual({ count: 0, items: [] });

    const total = fila('SELECT COUNT(*) AS n FROM aportes WHERE aporte_id = ?', [def.id]);
    expect(total).toMatchObject({ n: 4 });
  });
});

describe('Aportes — GET /:id/pagos (historial preservado)', () => {
  async function crearAporteConPagos(): Promise<{ aporteId: string }> {
    const def = await crearDefinicion({ nombre: 'Para Pagos', monto: 50, recurrencia: 'unico' });
    const s1 = (await crearSocio({ aporteIds: [def.id] })).data.id;
    const generado = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: def.id, gestion: 2025 },
    });
    const aporteId = generado.data.items[0].id;

    // Dos pagos parciales → dos movimientos ingreso con fechas distintas.
    await requestJson(`/api/aportes/${aporteId}/pagar`, {
      method: 'POST',
      body: { monto: 20, fechaPago: '2025-01-05' },
    });
    await requestJson(`/api/aportes/${aporteId}/pagar`, {
      method: 'POST',
      body: { monto: 30, fechaPago: '2025-01-10' },
    });
    return { aporteId };
  }

  it('devuelve los movimientos ingreso no anulados ordenados por fecha', async () => {
    const { aporteId } = await crearAporteConPagos();

    const { status, data } = await requestJson(`/api/aportes/${aporteId}/pagos`);

    expect(status).toBe(200);
    expect(data).toHaveLength(2);
    expect(data.map((m: any) => m.fecha)).toEqual(['2025-01-05', '2025-01-10']);
    expect(data.every((m: any) => m.tipo === 'ingreso' && m.anulado === 0)).toBe(true);
  });

  it('excluye movimientos anulados del historial', async () => {
    const { aporteId } = await crearAporteConPagos();

    const movs = filas('SELECT id FROM movimientos WHERE referencia_id = ?', [aporteId]);
    expect(movs.length).toBe(2);
    ejecutar('UPDATE movimientos SET anulado = 1 WHERE id = ?', [movs[0].id]);

    const { status, data } = await requestJson(`/api/aportes/${aporteId}/pagos`);

    expect(status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].anulado).toBe(0);
  });

  it('aporte sin pagos devuelve []', async () => {
    const def = await crearDefinicion({ nombre: 'Sin Pagos', monto: 50, recurrencia: 'unico' });
    const s1 = (await crearSocio({ aporteIds: [def.id] })).data.id;
    const generado = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: def.id, gestion: 2025 },
    });

    const { status, data } = await requestJson(`/api/aportes/${generado.data.items[0].id}/pagos`);

    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  it('aporte inexistente devuelve 404', async () => {
    const { status, data } = await requestJson('/api/aportes/fake-id/pagos');

    expect(status).toBe(404);
    expect(data).toEqual({ error: 'Aporte not found' });
  });
});
