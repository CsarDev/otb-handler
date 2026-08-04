// Task-10 / Capability payments: /bulk/all filtra por estado y GET /:id/pagos.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrarDb, limpiarDatos, requestJson, crearSocio, filas, ejecutar, IDS } from './helpers';

beforeAll(() => migrarDb());
beforeEach(() => limpiarDatos());

async function bulkAll(body: Record<string, unknown>) {
  return requestJson('/api/aportes/bulk/all', { method: 'POST', body });
}

describe('Aportes — /bulk/all (todos los permitidos por estado)', () => {
  it('crea aportes solo para socios cuyo estado permite "aportes"', async () => {
    const s1 = (await crearSocio()).data.id; // est-activo → permite
    await crearSocio({ estadoId: IDS.estSuspendido }); // suspendido → NO
    await crearSocio({ estadoId: IDS.estBaja }); // de baja → NO

    const { status, data } = await bulkAll({ tipo: 'mensual', gestion: 2025, mes: 1, meses: 1 });

    expect(status).toBe(201);
    expect(data.count).toBe(1);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].socioId).toBe(s1);

    const rows = filas('SELECT socio_id FROM aportes');
    expect(rows).toHaveLength(1);
    expect(rows[0].socio_id).toBe(s1);
  });

  it('deriva per-socio el monto de cada tipo', async () => {
    const s1 = (await crearSocio()).data.id; // ta-pleno → 50
    const s2 = (await crearSocio({ tipoAporteId: IDS.taJubilado })).data.id; // → 25

    const { status, data } = await bulkAll({ tipo: 'mensual', gestion: 2025, mes: 1, meses: 1 });

    expect(status).toBe(201);
    expect(data.count).toBe(2);
    const monto = Object.fromEntries(data.items.map((i: any) => [i.socioId, i.montoBase]));
    expect(monto[s1]).toBe(50);
    expect(monto[s2]).toBe(25);
  });

  it('bulk/all con nada de socios elegibles devuelve 400', async () => {
    await crearSocio({ estadoId: IDS.estSuspendido });
    await crearSocio({ estadoId: IDS.estInactivo });

    const { status, data } = await bulkAll({ tipo: 'mensual', gestion: 2025 });
    expect(status).toBe(400);
    expect(data.error).toBe('Ningún socio puede participar en esta acción en su estado actual');
  });

  it('bulk/all anual crea 12 registros mes 1..12 por socio permitido', async () => {
    const s1 = (await crearSocio()).data.id;

    const { status, data } = await bulkAll({ tipo: 'anual', gestion: 2025, meses: 3 });

    expect(status).toBe(201);
    expect(data.count).toBe(12);
    const meses = data.items.map((i: any) => i.mes).sort((a: number, b: number) => a - b);
    expect(meses).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('Aportes — GET /:id/pagos (historial de movimientos)', () => {
  async function crearAporteConPagos(): Promise<{ aporteId: string }> {
    const s1 = (await crearSocio()).data.id;
    const aporte = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, tipo: 'mensual', gestion: 2025, mes: 1 },
    });
    const aporteId = aporte.data.id;

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

  it('devuelve los movimientos ingreso del aporte ordenados por fecha', async () => {
    const { aporteId } = await crearAporteConPagos();

    const { status, data } = await requestJson(`/api/aportes/${aporteId}/pagos`);
    expect(status).toBe(200);
    expect(data).toHaveLength(2);
    const fechas = data.map((m: any) => m.fecha);
    expect(fechas).toEqual(['2025-01-05', '2025-01-10']);
    expect(data.every((m: any) => m.tipo === 'ingreso')).toBe(true);
  });

  it('excluye movimientos anulados del historial (spec payments)', async () => {
    const { aporteId } = await crearAporteConPagos();

    // Marca un movimiento como anulado (soft-delete) directamente en la DB.
    const movs = filas('SELECT id FROM movimientos WHERE referencia_id = ?', [aporteId]);
    expect(movs.length).toBe(2);
    ejecutar('UPDATE movimientos SET anulado = 1 WHERE id = ?', [movs[0].id]);

    const { status, data } = await requestJson(`/api/aportes/${aporteId}/pagos`);
    expect(status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].anulado).toBe(0);
  });

  it('aporte sin pagos devuelve []', async () => {
    const s1 = (await crearSocio()).data.id;
    const aporte = await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: s1, tipo: 'mensual', gestion: 2025, mes: 1 },
    });

    const { status, data } = await requestJson(`/api/aportes/${aporte.data.id}/pagos`);
    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  it('aporte inexistente devuelve 404', async () => {
    const { status, data } = await requestJson('/api/aportes/fake-id/pagos');
    expect(status).toBe(404);
    expect(data).toEqual({ error: 'Aporte not found' });
  });
});
