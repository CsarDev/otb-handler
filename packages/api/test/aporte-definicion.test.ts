// Phase 6 / Capability aporte-definitions: CRUD de definiciones de aporte en
// `/api/aportes-definicion` + guard 409 de DELETE (D10). Modelo corregido: el
// aporte ES la definición (`aportes_definicion`); el id es un slug estable e
// inmutable (D7); `aplicaGrupoId` debe referenciar un grupo existente.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrarDb, limpiarDatos, requestJson, crearSocio, crearDefinicion, crearGrupo, fila, IDS } from './helpers';

beforeAll(() => migrarDb());
beforeEach(() => limpiarDatos());

const EN_USO_MSG = 'No se puede eliminar: hay socios o registros usando este aporte';

describe('Aportes Definición — GET /api/aportes-definicion', () => {
  it('lista el catálogo completo con las 4 definiciones sembradas', async () => {
    const { status, data } = await requestJson('/api/aportes-definicion');

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(4);

    const mensual = data.find((d: any) => d.id === IDS.apMensual);
    expect(mensual).toMatchObject({
      id: IDS.apMensual,
      nombre: 'Cuota Social Mensual',
      monto: 50,
      recurrencia: 'mensual',
      inicio: null,
      fin: null,
      modalidadPago: 'cuotas',
      aplicaGrupoId: null,
      activo: 1,
    });

    const porId = Object.fromEntries(data.map((d: any) => [d.id, d]));
    expect(porId[IDS.apFamiliar].monto).toBe(30);
    expect(porId[IDS.apJubilado].monto).toBe(25);
    expect(porId[IDS.apHonorario].monto).toBe(0);
  });
});

describe('Aportes Definición — POST (creación y validación)', () => {
  it('crea una definición completa y la devuelve en el catálogo (201)', async () => {
    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: {
        id: 'ap-nueva',
        nombre: 'Cuota Nueva',
        monto: 75,
        recurrencia: 'mensual',
        inicio: '2025-01-01',
        fin: '2025-12-31',
        modalidadPago: 'cuotas',
        activo: 1,
      },
    });

    expect(status).toBe(201);
    expect(data).toHaveLength(5);
    expect(data.find((d: any) => d.id === 'ap-nueva')).toMatchObject({
      monto: 75,
      recurrencia: 'mensual',
      modalidadPago: 'cuotas',
      activo: 1,
      aplicaGrupoId: null, // sin aplicaGrupoId = global
    });
  });

  it('crea una definición group-scoped con aplicaGrupoId (201)', async () => {
    const g1 = await crearGrupo('Grupo A');

    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: { id: 'ap-grupo-a', nombre: 'Fondo Grupo A', monto: 10, recurrencia: 'mensual', aplicaGrupoId: g1, activo: 1 },
    });

    expect(status).toBe(201);
    expect(data.find((d: any) => d.id === 'ap-grupo-a')).toMatchObject({ aplicaGrupoId: g1 });
  });

  it('rechaza POST sin nombre con 400', async () => {
    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: { monto: 50 },
    });
    expect(status).toBe(400);
    expect(data).toEqual({ error: 'nombre is required' });
  });

  it('rechaza POST sin monto con 400', async () => {
    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: { nombre: 'X' },
    });
    expect(status).toBe(400);
    expect(data.error).toMatch(/monto is required/);
  });

  it('rechaza POST con monto negativo con 400', async () => {
    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: { nombre: 'X', monto: -1 },
    });
    expect(status).toBe(400);
    expect(data.error).toMatch(/non-negative/);
  });

  it('rechaza POST con recurrencia inválida con 400', async () => {
    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: { nombre: 'X', monto: 50, recurrencia: 'semanal' },
    });
    expect(status).toBe(400);
    expect(data).toEqual({ error: 'recurrencia is invalid' });
  });

  it('rechaza POST con modalidadPago inválida con 400', async () => {
    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: { nombre: 'X', monto: 50, modalidadPago: 'efectivo' },
    });
    expect(status).toBe(400);
    expect(data).toEqual({ error: 'modalidadPago is invalid' });
  });

  it('rechaza POST con ventana invertida (fin < inicio) con 400', async () => {
    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: { nombre: 'X', monto: 50, inicio: '2025-12-31', fin: '2025-01-01' },
    });
    expect(status).toBe(400);
    expect(data.error).toMatch(/fin debe ser >= inicio/);
  });

  it('rechaza POST con aplicaGrupoId desconocido con 400', async () => {
    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: { nombre: 'X', monto: 50, aplicaGrupoId: 'fake-group' },
    });
    expect(status).toBe(400);
    expect(data).toEqual({ error: 'aplicaGrupoId is invalid' });
  });

  it('rechaza POST con id duplicado con 400', async () => {
    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: { id: IDS.apMensual, nombre: 'Duplicada', monto: 10 },
    });
    expect(status).toBe(400);
    expect(data.error).toMatch(/Ya existe un aporte con ese id/);
  });
});

describe('Aportes Definición — PUT (actualización)', () => {
  it('actualiza campos editables y lo refleja en el catálogo (200)', async () => {
    const { status, data } = await requestJson(`/api/aportes-definicion/${IDS.apMensual}`, {
      method: 'PUT',
      body: { nombre: 'Cuota Social Mensual', monto: 60, fin: '2026-12-31' },
    });

    expect(status).toBe(200);
    expect(data.find((d: any) => d.id === IDS.apMensual)).toMatchObject({ monto: 60, fin: '2026-12-31' });
  });

  it('PUT con un id en el body NO renombra la definición (D7)', async () => {
    const { status, data } = await requestJson(`/api/aportes-definicion/${IDS.apMensual}`, {
      method: 'PUT',
      body: { id: 'ap-otro', nombre: 'Cuota Social Mensual', monto: 70 },
    });

    expect(status).toBe(200);
    expect(data.find((d: any) => d.id === IDS.apMensual)).toMatchObject({ id: IDS.apMensual, monto: 70 });
    expect(data.some((d: any) => d.id === 'ap-otro')).toBe(false);
    expect(fila('SELECT COUNT(*) AS n FROM aportes_definicion WHERE id = ?', ['ap-otro'])).toMatchObject({ n: 0 });
  });

  it('devuelve 404 al actualizar una definición inexistente', async () => {
    const { status, data } = await requestJson('/api/aportes-definicion/fake-id', {
      method: 'PUT',
      body: { nombre: 'X', monto: 10 },
    });
    expect(status).toBe(404);
    expect(data).toEqual({ error: 'Aporte definition not found' });
  });
});

describe('Aportes Definición — DELETE (guard 409)', () => {
  it('elimina una definición sin uso y la quita del catálogo (200)', async () => {
    await crearDefinicion({ id: 'ap-obsoleta', nombre: 'Obsoleta', monto: 12 });

    const { status, data } = await requestJson('/api/aportes-definicion/ap-obsoleta', {
      method: 'DELETE',
    });
    expect(status).toBe(200);
    expect(data.some((d: any) => d.id === 'ap-obsoleta')).toBe(false);
  });

  it('elimina una definición inactiva sin uso (200)', async () => {
    await crearDefinicion({ id: 'ap-inactiva-libre', nombre: 'Inactiva Libre', monto: 5, activo: 0 });

    const { status, data } = await requestJson('/api/aportes-definicion/ap-inactiva-libre', {
      method: 'DELETE',
    });
    expect(status).toBe(200);
    expect(data.some((d: any) => d.id === 'ap-inactiva-libre')).toBe(false);
  });

  it('rechaza DELETE de una definición con asignaciones socio_aportes (409) y la conserva', async () => {
    await crearSocio(); // default ap-mensual → fila en socio_aportes

    const { status, data } = await requestJson(`/api/aportes-definicion/${IDS.apMensual}`, {
      method: 'DELETE',
    });
    expect(status).toBe(409);
    expect(data).toEqual({ error: EN_USO_MSG });

    const lista = await requestJson('/api/aportes-definicion');
    expect(lista.data.some((d: any) => d.id === IDS.apMensual)).toBe(true);
  });

  it('rechaza DELETE de una definición con registros generados (409) y la conserva', async () => {
    await crearDefinicion({ id: 'ap-extra', nombre: 'Extraordinario', monto: 80, recurrencia: 'unico' });
    const socio = await crearSocio({ aporteIds: ['ap-extra'] });
    await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: socio.data.id, aporteId: 'ap-extra', gestion: 2025 },
    });

    const { status, data } = await requestJson('/api/aportes-definicion/ap-extra', {
      method: 'DELETE',
    });
    expect(status).toBe(409);
    expect(data).toEqual({ error: EN_USO_MSG });

    // El registro generado sigue referenciando la definición (aporte_id intacto)
    const registros = fila('SELECT COUNT(*) AS n FROM aportes WHERE aporte_id = ?', ['ap-extra']);
    expect(registros).toMatchObject({ n: 1 });
  });

  it('devuelve 404 al eliminar una definición inexistente', async () => {
    const { status, data } = await requestJson('/api/aportes-definicion/fake-id', {
      method: 'DELETE',
    });
    expect(status).toBe(404);
    expect(data).toEqual({ error: 'Aporte definition not found' });
  });
});
