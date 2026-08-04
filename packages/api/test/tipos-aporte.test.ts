// Task-10 / Capability aporte-types: CRUD de tipos-aporte (spec aporte-types).
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrarDb, limpiarDatos, requestJson, crearSocio, IDS } from './helpers';

beforeAll(() => migrarDb());
beforeEach(() => limpiarDatos());

describe('Tipos de Aporte — CRUD', () => {
  it('lista el catálogo completo con los 4 tipos sembrados', async () => {
    const { status, data } = await requestJson('/api/tipos-aporte');

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(4);

    const pleno = data.find((t: any) => t.id === IDS.taPleno);
    expect(pleno).toMatchObject({
      id: IDS.taPleno,
      nombre: 'Socio Pleno',
      montoBase: 50,
      descripcion: 'Cuota plena mensual',
      activo: 1,
    });

    const porId = Object.fromEntries(data.map((t: any) => [t.id, t]));
    expect(porId[IDS.taFamiliar].montoBase).toBe(30);
    expect(porId[IDS.taJubilado].montoBase).toBe(25);
    expect(porId[IDS.taHonorario].montoBase).toBe(0);
  });

  it('rechaza POST sin nombre con 400', async () => {
    const { status, data } = await requestJson('/api/tipos-aporte', {
      method: 'POST',
      body: { montoBase: 50 },
    });
    expect(status).toBe(400);
    expect(data).toEqual({ error: 'nombre is required' });
  });

  it('rechaza POST sin montoBase con 400', async () => {
    const { status, data } = await requestJson('/api/tipos-aporte', {
      method: 'POST',
      body: { nombre: 'X' },
    });
    expect(status).toBe(400);
    expect(data.error).toMatch(/montoBase is required/);
  });

  it('crea un tipo y devuelve el catálogo con el nuevo tipo (201)', async () => {
    const { status, data } = await requestJson('/api/tipos-aporte', {
      method: 'POST',
      body: { nombre: 'Socio Joven', montoBase: 40, descripcion: 'Cuota joven', activo: 1 },
    });

    expect(status).toBe(201);
    expect(data).toHaveLength(5);
    const creado = data.find((t: any) => t.nombre === 'Socio Joven');
    expect(creado).toMatchObject({ montoBase: 40, activo: 1, descripcion: 'Cuota joven' });
    expect(creado.id).toBeTruthy();
  });

  it('actualiza nombre/montoBase de un tipo y lo refleja en el catálogo (200)', async () => {
    const creado = await requestJson('/api/tipos-aporte', {
      method: 'POST',
      body: { nombre: 'Temporal', montoBase: 40 },
    });
    const id = creado.data.find((t: any) => t.nombre === 'Temporal').id;

    const { status, data } = await requestJson(`/api/tipos-aporte/${id}`, {
      method: 'PUT',
      body: { nombre: 'Temporal', montoBase: 60 },
    });

    expect(status).toBe(200);
    expect(data.find((t: any) => t.id === id)).toMatchObject({
      nombre: 'Temporal',
      montoBase: 60,
    });
  });

  it('devuelve 404 al actualizar un tipo inexistente', async () => {
    const { status, data } = await requestJson('/api/tipos-aporte/fake-id', {
      method: 'PUT',
      body: { nombre: 'X' },
    });
    expect(status).toBe(404);
    expect(data).toEqual({ error: 'Tipo de aporte not found' });
  });

  it('rechaza DELETE de un tipo en uso por socios con 409 y lo conserva', async () => {
    await crearSocio({ tipoAporteId: IDS.taPleno });

    const { status, data } = await requestJson(`/api/tipos-aporte/${IDS.taPleno}`, {
      method: 'DELETE',
    });
    expect(status).toBe(409);
    expect(data.error).toMatch(/hay socios usando este tipo/);

    const lista = await requestJson('/api/tipos-aporte');
    expect(lista.data.some((t: any) => t.id === IDS.taPleno)).toBe(true);
  });

  it('elimina un tipo sin uso y lo quita del catálogo (200)', async () => {
    const creado = await requestJson('/api/tipos-aporte', {
      method: 'POST',
      body: { nombre: 'Obsoleto', montoBase: 12 },
    });
    const id = creado.data.find((t: any) => t.nombre === 'Obsoleto').id;

    const { status, data } = await requestJson(`/api/tipos-aporte/${id}`, {
      method: 'DELETE',
    });
    expect(status).toBe(200);
    expect(data.some((t: any) => t.id === id)).toBe(false);
  });
});
