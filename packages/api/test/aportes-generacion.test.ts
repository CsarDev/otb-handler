// Phase 6 / Capability payments: generación SINGLE definition-driven (D8, D9).
// monto y tipo derivan de la definición (`aporteId`); NO hay override manual
// (monto/tipo en el body → 400). Anual → 12, unico/extraordinario → 1,
// mensual → ventana de vigencia. Enforcement por estado vía `permite(...)`.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrarDb, limpiarDatos, requestJson, crearSocio, crearGrupo, crearDefinicion, filas, IDS } from './helpers';

beforeAll(() => migrarDb());
beforeEach(() => limpiarDatos());

const ERROR_PERMISO = 'El socio no puede realizar esta acción en su estado actual';

describe('Aportes — generación single definition-driven', () => {
  it('mensual usa el monto de la definición y cuenta los meses de la ventana (3 registros)', async () => {
    await crearDefinicion({
      id: 'ap-ventana',
      nombre: 'Con Ventana',
      monto: 50,
      recurrencia: 'mensual',
      inicio: '2025-03-01',
      fin: '2025-05-31',
    });
    const s1 = (await crearSocio({ aporteIds: ['ap-ventana'] })).data.id;

    const { status, data } = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: 'ap-ventana', gestion: 2025 },
    });

    expect(status).toBe(201);
    expect(data.count).toBe(3);
    expect(data.items.map((i: any) => i.mes).sort((a: number, b: number) => a - b)).toEqual([3, 4, 5]);
    for (const item of data.items) expect(item.montoBase).toBe(50);

    const rows = filas('SELECT mes, monto_base, aporte_id FROM aportes WHERE socio_id = ?', [s1]);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.monto_base === 50 && r.aporte_id === 'ap-ventana')).toBe(true);
  });

  it('anual crea exactamente 12 registros mes 1..12 con monto y tipo de la definición', async () => {
    await crearDefinicion({ id: 'ap-anual', nombre: 'Anual', monto: 500, recurrencia: 'anual' });
    const s1 = (await crearSocio({ aporteIds: ['ap-anual'] })).data.id;

    const { status, data } = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: 'ap-anual', gestion: 2025 },
    });

    expect(status).toBe(201);
    expect(data.count).toBe(12);
    const meses = data.items.map((i: any) => i.mes).sort((a: number, b: number) => a - b);
    expect(meses).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const item of data.items) expect(item).toMatchObject({ socioId: s1, tipo: 'anual', montoBase: 500 });
  });

  it('unico crea exactamente 1 registro', async () => {
    await crearDefinicion({ id: 'ap-unico', nombre: 'Único', monto: 200, recurrencia: 'unico' });
    const s1 = (await crearSocio({ aporteIds: ['ap-unico'] })).data.id;

    const { status, data } = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: 'ap-unico', gestion: 2025 },
    });

    expect(status).toBe(201);
    expect(data.count).toBe(1);
    expect(data.items[0]).toMatchObject({ mes: 1, tipo: 'unico', montoBase: 200 });
  });

  it('extraordinario crea exactamente 1 registro', async () => {
    await crearDefinicion({ id: 'ap-extra', nombre: 'Extraordinario', monto: 80, recurrencia: 'extraordinario' });
    const s1 = (await crearSocio({ aporteIds: ['ap-extra'] })).data.id;

    const { status, data } = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: 'ap-extra', gestion: 2025 },
    });

    expect(status).toBe(201);
    expect(data.count).toBe(1);
    expect(data.items[0]).toMatchObject({ mes: 1, tipo: 'extraordinario', montoBase: 80 });
  });

  it('un socio que hereda la definición por grupo genera registros', async () => {
    const g1 = await crearGrupo('Grupo A');
    await crearDefinicion({
      id: 'ap-grupo',
      nombre: 'Fondo Grupo',
      monto: 100,
      recurrencia: 'mensual',
      inicio: '2025-01-01',
      fin: '2025-02-28',
      aplicaGrupoId: g1,
    });
    const s1 = (await crearSocio({ grupoPrimarioId: g1, aporteIds: [] })).data.id;

    const { status, data } = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: 'ap-grupo', gestion: 2025 },
    });

    expect(status).toBe(201);
    expect(data.count).toBe(2);
    expect(data.items.map((i: any) => i.mes).sort((a: number, b: number) => a - b)).toEqual([1, 2]);
    for (const item of data.items) expect(item.montoBase).toBe(100);
  });

  it('rechaza monto en el body (no hay override) con 400 y no crea registros', async () => {
    const s1 = (await crearSocio({ aporteIds: [IDS.apMensual] })).data.id;

    const { status, data } = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: IDS.apMensual, gestion: 2025, monto: 999 },
    });

    expect(status).toBe(400);
    expect(data.error).toMatch(/no se acepta override/);
    expect(filas('SELECT * FROM aportes')).toHaveLength(0);
  });

  it('rechaza una definición inactiva con 400', async () => {
    await crearDefinicion({ id: 'ap-inactivo', nombre: 'Inactivo', monto: 10, activo: 0 });
    const s1 = (await crearSocio()).data.id;

    const { status, data } = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: 'ap-inactivo', gestion: 2025 },
    });

    expect(status).toBe(400);
    expect(data.error).toMatch(/está inactiva/);
  });

  it('definición fuera de su ventana de vigencia genera {count: 0}', async () => {
    await crearDefinicion({ id: 'ap-vencida', nombre: 'Vencida', monto: 50, recurrencia: 'mensual', fin: '2024-12-31' });
    const s1 = (await crearSocio({ aporteIds: ['ap-vencida'] })).data.id;

    const { status, data } = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: 'ap-vencida', gestion: 2025 },
    });

    expect(status).toBe(201);
    expect(data).toEqual({ count: 0, items: [] });
  });

  it('rechaza un socio que no sostiene la definición con 400', async () => {
    const s1 = (await crearSocio({ aporteIds: [IDS.apFamiliar] })).data.id; // NO tiene ap-mensual

    const { status, data } = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: IDS.apMensual, gestion: 2025 },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('El socio no tiene asignado este aporte');
  });

  it('rechaza un socio cuyo estado no permite aportes con 409 (enforcement D9)', async () => {
    const s1 = (await crearSocio({ estadoId: IDS.estSuspendido })).data.id;

    const { status, data } = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: IDS.apMensual, gestion: 2025 },
    });

    expect(status).toBe(409);
    expect(data).toEqual({ error: ERROR_PERMISO });
    expect(filas('SELECT * FROM aportes')).toHaveLength(0);
  });

  it('devuelve 404 si el socio no existe', async () => {
    const { status, data } = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: 'fake-id', aporteId: IDS.apMensual, gestion: 2025 },
    });

    expect(status).toBe(404);
    expect(data).toEqual({ error: 'Socio not found' });
  });
});
