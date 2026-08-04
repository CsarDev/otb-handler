// Task-10 / Capability socios-estados + aporte-types: tipoAporteId en socio.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrarDb, limpiarDatos, requestJson, crearSocio, ejecutar, IDS } from './helpers';

beforeAll(() => migrarDb());
beforeEach(() => limpiarDatos());

describe('Socios — asignación de tipo de aporte', () => {
  it('POST sin tipoAporteId asigna el primer tipo activo como default y deriva aporteBase', async () => {
    const { status, data } = await crearSocio();
    expect(status).toBe(201);
    expect(data.tipoAporteId).toBe(IDS.taPleno);
    expect(data.tipoAporteNombre).toBe('Socio Pleno');
    expect(data.aporteBase).toBe(50); // derivado del montoBase del tipo
  });

  it('POST con un tipo inactivo se rechaza con 400', async () => {
    await requestJson('/api/tipos-aporte', {
      method: 'POST',
      body: { nombre: 'Legacy', montoBase: 99, activo: 0 },
    });
    // id del tipo inactivo recién creado
    const lista = await requestJson('/api/tipos-aporte');
    const inactivo = lista.data.find((t: any) => t.nombre === 'Legacy').id;

    const { status, data } = await crearSocio({ tipoAporteId: inactivo });
    expect(status).toBe(400);
    expect(data.error).toBe('tipoAporteId is invalid or inactive');
  });

  it('PUT con aporteBase crudo no cambia el monto (queda el del tipo)', async () => {
    const creado = await crearSocio();
    const id = creado.data.id;

    const { status, data } = await requestJson(`/api/socios/${id}`, {
      method: 'PUT',
      body: { aporteBase: 999 },
    });
    expect(status).toBe(200);
    expect(data.aporteBase).toBe(50); // NO 999
  });

  it('PUT actualizando tipoAporteId deriva el nuevo aporteBase del tipo', async () => {
    const creado = await crearSocio();
    const id = creado.data.id;

    const { status, data } = await requestJson(`/api/socios/${id}`, {
      method: 'PUT',
      body: { tipoAporteId: IDS.taFamiliar },
    });
    expect(status).toBe(200);
    expect(data.tipoAporteId).toBe(IDS.taFamiliar);
    expect(data.aporteBase).toBe(30);
  });

  it('socio legacy sin tipo (NULL) se presenta con el default activo', async () => {
    const creado = await crearSocio();
    const id = creado.data.id;
    // Simula la transición legada: socio con tipo_aporte_id NULL.
    ejecutar('UPDATE socios SET tipo_aporte_id = NULL WHERE id = ?', [id]);

    const { status, data } = await requestJson(`/api/socios/${id}`);
    expect(status).toBe(200);
    expect(data.tipoAporteId).toBe(IDS.taPleno);
    expect(data.tipoAporteNombre).toBe('Socio Pleno');
    expect(data.aporteBase).toBe(50);
  });

  it('editar el montoBase de un tipo propaga el monto derivado a socios asignados', async () => {
    const creado = await crearSocio({ tipoAporteId: IDS.taJubilado });
    const socioId = creado.data.id;

    await requestJson(`/api/tipos-aporte/${IDS.taJubilado}`, {
      method: 'PUT',
      body: { montoBase: 60 },
    });

    const { data } = await requestJson(`/api/socios/${socioId}`);
    expect(data.aporteBase).toBe(60);

    // Restaura el catálogo para no contaminar otros tests del archivo.
    await requestJson(`/api/tipos-aporte/${IDS.taJubilado}`, {
      method: 'PUT',
      body: { montoBase: 25 },
    });
  });
});
