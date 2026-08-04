// Task-10 / Capability payments: generación de aportes deriva monto del tipo,
// anual==12 (ignora meses) y override solo unico/extraordinario.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrarDb, limpiarDatos, requestJson, crearSocio, filas, IDS } from './helpers';

beforeAll(() => migrarDb());
beforeEach(() => limpiarDatos());

describe('Aportes — generación con monto del tipo y override', () => {
  it('bulk mensual deriva montoBase de cada tipo de socio', async () => {
    const s1 = (await crearSocio()).data.id; // ta-pleno → 50
    const s2 = (await crearSocio({ tipoAporteId: IDS.taFamiliar })).data.id; // → 30

    const { status, data } = await requestJson('/api/aportes/bulk', {
      method: 'POST',
      body: { socioIds: [s1, s2], tipo: 'mensual', gestion: 2025, mes: 1, meses: 1 },
    });

    expect(status).toBe(201);
    expect(data.count).toBe(2);
    const monto = Object.fromEntries(data.items.map((i: any) => [i.socioId, i.montoBase]));
    expect(monto[s1]).toBe(50);
    expect(monto[s2]).toBe(30);

    // Se persiste en la DB real.
    const rows = filas('SELECT socio_id, monto_base FROM aportes');
    expect(rows).toHaveLength(2);
  });

  it('bulk anual crea exactamente 12 registros mes 1..12 ignorando body.meses', async () => {
    const s1 = (await crearSocio()).data.id;

    const { status, data } = await requestJson('/api/aportes/bulk', {
      method: 'POST',
      body: { socioIds: [s1], tipo: 'anual', gestion: 2025, meses: 3 },
    });

    expect(status).toBe(201);
    expect(data.count).toBe(12);
    expect(data.items).toHaveLength(12);
    const meses = data.items.map((i: any) => i.mes).sort((a: number, b: number) => a - b);
    expect(meses).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const item of data.items) {
      expect(item).toMatchObject({ socioId: s1, tipo: 'anual', montoBase: 50 });
    }
  });

  it('single unico acepta override de monto', async () => {
    const s1 = (await crearSocio()).data.id;
    const { status, data } = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, tipo: 'unico', monto: 100, gestion: 2025, mes: 1 },
    });
    expect(status).toBe(201);
    expect(data.montoBase).toBe(100);
  });

  it('single mensual ignora el override y usa el monto del tipo', async () => {
    const s1 = (await crearSocio()).data.id;
    const { status, data } = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, tipo: 'mensual', monto: 999, gestion: 2025, mes: 1 },
    });
    expect(status).toBe(201);
    expect(data.montoBase).toBe(50); // NO 999
  });

  it('bulk extraordinario acepta override de monto', async () => {
    const s1 = (await crearSocio({ tipoAporteId: IDS.taFamiliar })).data.id;
    const { status, data } = await requestJson('/api/aportes/bulk', {
      method: 'POST',
      body: { socioIds: [s1], tipo: 'extraordinario', monto: 80, gestion: 2025, mes: 1 },
    });
    expect(status).toBe(201);
    expect(data.count).toBe(1);
    expect(data.items[0].montoBase).toBe(80);
  });
});
