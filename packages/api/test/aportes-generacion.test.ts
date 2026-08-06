// Phase 6 / Capability payments: generación SINGLE definition-driven (D8, D9).
// monto y tipo derivan de la definición (`aporteId`); NO hay override manual
// (monto/tipo en el body → 400). Anual → 12, unico/extraordinario → 1,
// mensual → ventana de vigencia. Enforcement por estado vía `permite(...)`.
// Los ids de las definiciones ahora son UUIDs del server (D14): las suites los
// leen del helper `crearDefinicion` y NO hardcodean slugs. `crearSocio` ya
// auto-genera la gestión actual (D16) → los endpoints manuales apuntan a una
// gestión pasada (2025) o a ventanas que no cubren el año actual.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrarDb, limpiarDatos, requestJson, crearSocio, crearGrupo, crearDefinicion, fila, filas, IDS } from './helpers';

beforeAll(() => migrarDb());
beforeEach(() => limpiarDatos());

const ERROR_PERMISO = 'El socio no puede realizar esta acción en su estado actual';

describe('Aportes — generación single definition-driven', () => {
  it('mensual usa el monto de la definición y cuenta los meses de la ventana (3 registros)', async () => {
    const def = await crearDefinicion({
      nombre: 'Con Ventana',
      monto: 50,
      recurrencia: 'mensual',
      inicio: '2025-03-01',
      fin: '2025-05-31',
    });
    const s1 = (await crearSocio({ aporteIds: [def.id] })).data.id;

    const { status, data } = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: def.id, gestion: 2025 },
    });

    expect(status).toBe(201);
    expect(data.count).toBe(3);
    expect(data.items.map((i: any) => i.mes).sort((a: number, b: number) => a - b)).toEqual([3, 4, 5]);
    for (const item of data.items) expect(item.montoBase).toBe(50);

    const rows = filas('SELECT mes, monto_base, aporte_id FROM aportes WHERE socio_id = ?', [s1]);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.monto_base === 50 && r.aporte_id === def.id)).toBe(true);
  });

  it('anual crea exactamente 12 registros mes 1..12 con monto y tipo de la definición', async () => {
    const def = await crearDefinicion({ nombre: 'Anual', monto: 500, recurrencia: 'anual' });
    const s1 = (await crearSocio({ aporteIds: [def.id] })).data.id;

    const { status, data } = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: def.id, gestion: 2025 },
    });

    expect(status).toBe(201);
    expect(data.count).toBe(12);
    const meses = data.items.map((i: any) => i.mes).sort((a: number, b: number) => a - b);
    expect(meses).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const item of data.items) expect(item).toMatchObject({ socioId: s1, tipo: 'anual', montoBase: 500 });
  });

  it('unico crea exactamente 1 registro', async () => {
    const def = await crearDefinicion({ nombre: 'Único', monto: 200, recurrencia: 'unico' });
    const s1 = (await crearSocio({ aporteIds: [def.id] })).data.id;

    const { status, data } = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: def.id, gestion: 2025 },
    });

    expect(status).toBe(201);
    expect(data.count).toBe(1);
    expect(data.items[0]).toMatchObject({ mes: 1, tipo: 'unico', montoBase: 200 });
  });

  it('extraordinario crea exactamente 1 registro', async () => {
    const def = await crearDefinicion({ nombre: 'Extraordinario', monto: 80, recurrencia: 'extraordinario' });
    const s1 = (await crearSocio({ aporteIds: [def.id] })).data.id;

    const { status, data } = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: def.id, gestion: 2025 },
    });

    expect(status).toBe(201);
    expect(data.count).toBe(1);
    expect(data.items[0]).toMatchObject({ mes: 1, tipo: 'extraordinario', montoBase: 80 });
  });

  it('un socio que hereda la definición por grupo genera registros', async () => {
    const g1 = await crearGrupo('Grupo A');
    const def = await crearDefinicion({
      nombre: 'Fondo Grupo',
      monto: 100,
      recurrencia: 'mensual',
      inicio: '2025-01-01',
      fin: '2025-02-28',
      grupoIds: [g1],
    });
    const s1 = (await crearSocio({ grupoPrimarioId: g1, aporteIds: [] })).data.id;

    const { status, data } = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: def.id, gestion: 2025 },
    });

    expect(status).toBe(201);
    expect(data.count).toBe(2);
    expect(data.items.map((i: any) => i.mes).sort((a: number, b: number) => a - b)).toEqual([1, 2]);
    for (const item of data.items) expect(item.montoBase).toBe(100);
  });

  it('rechaza monto en el body (no hay override) con 400 y no crea registros para la gestión pedida', async () => {
    const s1 = (await crearSocio({ aporteIds: [IDS.apMensual] })).data.id;

    const { status, data } = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: IDS.apMensual, gestion: 2025, monto: 999 },
    });

    expect(status).toBe(400);
    expect(data.error).toMatch(/no se acepta override/);
    // crearSocio ya auto-generó la gestión actual (D16); la pedida (2025) queda vacía.
    expect(filas('SELECT * FROM aportes WHERE gestion = 2025')).toHaveLength(0);
  });

  it('rechaza una definición inactiva con 400', async () => {
    const def = await crearDefinicion({ nombre: 'Inactivo', monto: 10, activo: 0 });
    const s1 = (await crearSocio()).data.id;

    const { status, data } = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: def.id, gestion: 2025 },
    });

    expect(status).toBe(400);
    expect(data.error).toMatch(/está inactiva/);
  });

  it('definición fuera de su ventana de vigencia genera {count: 0}', async () => {
    const def = await crearDefinicion({ nombre: 'Vencida', monto: 50, recurrencia: 'mensual', fin: '2024-12-31' });
    const s1 = (await crearSocio({ aporteIds: [def.id] })).data.id;

    const { status, data } = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: def.id, gestion: 2025 },
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

  it('re-run de una generación ya materializada es dedup-safe ({ count: 0, items: [] })', async () => {
    const def = await crearDefinicion({
      nombre: 'ReRun',
      monto: 50,
      recurrencia: 'mensual',
      inicio: '2025-03-01',
      fin: '2025-05-31',
    });
    const s1 = (await crearSocio({ aporteIds: [def.id] })).data.id;

    const primero = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: def.id, gestion: 2025 },
    });
    expect(primero.status).toBe(201);
    expect(primero.data.count).toBe(3);

    // Segundo run: las mismas (socio, aporte, mes, gestion) ya existen → 0 nuevas.
    const segundo = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, aporteId: def.id, gestion: 2025 },
    });
    expect(segundo.status).toBe(201);
    expect(segundo.data).toEqual({ count: 0, items: [] });

    const filasRegistros = fila('SELECT COUNT(*) AS n FROM aportes WHERE socio_id = ? AND aporte_id = ?', [s1, def.id]);
    expect(filasRegistros).toMatchObject({ n: 3 });
  });
});
