// Phase 6 / Capability aporte-definitions: CRUD de definiciones de aporte en
// `/api/aportes-definicion` + guard 409 de DELETE (D10). Modelo corregido: el
// aporte ES la definición (`aportes_definicion`); el id es generado por el
// SERVER (UUID, D14 — un `id` del body se ignora); POST acepta `socioIds`
// (D18) y genera cobros en la misma transacción (D15): target set =
// socioIds ∪ miembros actuales del grupo, respuesta `{ definiciones, generados }`.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrarDb, limpiarDatos, requestJson, crearSocio, crearDefinicion, crearGrupo, fila, filas, IDS } from './helpers';

beforeAll(() => migrarDb());
beforeEach(() => limpiarDatos());

const EN_USO_MSG = 'No se puede eliminar: hay socios o registros usando este aporte';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

describe('Aportes Definición — POST (creación, asignación y generación)', () => {
  it('crea una definición "a nadie" y responde { definiciones, generados } con count 0', async () => {
    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: {
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
    expect(data.definiciones).toHaveLength(5);
    const nueva = data.definiciones.find((d: any) => d.nombre === 'Cuota Nueva');
    expect(nueva).toMatchObject({
      monto: 75,
      recurrencia: 'mensual',
      modalidadPago: 'cuotas',
      activo: 1,
      aplicaGrupoId: null, // sin aplicaGrupoId = global
    });
    // D14: el id lo genera el server (UUID), no el cliente.
    expect(nueva.id).toMatch(UUID_RE);
    // "a nadie": sin socioIds ni aplicaGrupoId → 0 registros.
    expect(data.generados).toEqual({ count: 0, items: [] });
  });

  it('un id del body se IGNORA y el server genera un UUID (D14)', async () => {
    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: { id: 'ap-custom-slug', nombre: 'X', monto: 50, recurrencia: 'mensual' },
    });

    expect(status).toBe(201);
    // No existe ninguna definición con el slug del cliente.
    expect(data.definiciones.some((d: any) => d.id === 'ap-custom-slug')).toBe(false);
    const nueva = data.definiciones.find((d: any) => d.nombre === 'X');
    expect(nueva.id).toMatch(UUID_RE);
  });

  it('socioIds asigna directo y genera los cobros por mes de la ventana (count 4)', async () => {
    const gestion = new Date().getFullYear(); // D12: la auto-generación usa la gestión actual
    const s1 = (await crearSocio({ aporteIds: [] })).data.id;
    const s2 = (await crearSocio({ aporteIds: [] })).data.id;

    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: {
        nombre: 'Fondo Deportes',
        monto: 20,
        recurrencia: 'mensual',
        inicio: `${gestion}-03-01`,
        fin: `${gestion}-04-30`,
        modalidadPago: 'cuotas',
        socioIds: [s1, s2],
      },
    });

    expect(status).toBe(201);
    const def = data.definiciones.find((d: any) => d.nombre === 'Fondo Deportes');

    // Asignación directa persistida en socio_aportes.
    const joins = filas('SELECT socio_id FROM socio_aportes WHERE aporte_id = ?', [def.id]);
    expect(joins.map((r) => r.socio_id).sort()).toEqual([s1, s2].sort());

    // 2 socios × (mes 3 y mes 4 de la gestión actual) = 4 registros.
    expect(data.generados.count).toBe(4);
    const registros = filas('SELECT socio_id, mes, gestion, monto_base FROM aportes WHERE aporte_id = ?', [def.id]);
    expect(registros).toHaveLength(4);
    expect(registros.map((r) => r.mes).sort()).toEqual([3, 3, 4, 4]);
    expect(registros.every((r) => r.monto_base === 20 && r.gestion === gestion)).toBe(true);
  });

  it('socioIds ∪ miembros actuales del grupo se deduplican (count 3)', async () => {
    const g1 = await crearGrupo('Grupo A');
    const s1 = (await crearSocio({ grupoPrimarioId: g1, aporteIds: [] })).data.id; // miembro primario
    const s3 = (await crearSocio({ grupoAdicionalIds: [g1], aporteIds: [] })).data.id; // miembro adicional
    const s2 = (await crearSocio({ aporteIds: [] })).data.id; // asignación directa

    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: { nombre: 'Fondo Mixto', monto: 10, recurrencia: 'unico', aplicaGrupoId: g1, socioIds: [s2] },
    });

    expect(status).toBe(201);
    expect(data.generados.count).toBe(3);
    const def = data.definiciones.find((d: any) => d.nombre === 'Fondo Mixto');
    const conRegistros = filas('SELECT DISTINCT socio_id FROM aportes WHERE aporte_id = ?', [def.id]).map((r) => r.socio_id);
    expect([...conRegistros].sort()).toEqual([s1, s2, s3].sort());
  });

  it('un socio cuyo estado no permite aportes conserva la asignación y genera 0 (201, sin 409)', async () => {
    const s2 = (await crearSocio({ estadoId: IDS.estSuspendido, aporteIds: [] })).data.id;

    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: { nombre: 'Fondo', monto: 10, recurrencia: 'unico', socioIds: [s2] },
    });

    expect(status).toBe(201); // NO 409 (bulk-exclusion D9/D15)
    const def = data.definiciones.find((d: any) => d.nombre === 'Fondo');
    // La asignación se conserva…
    expect(filas('SELECT * FROM socio_aportes WHERE socio_id = ? AND aporte_id = ?', [s2, def.id])).toHaveLength(1);
    // …pero no genera registros.
    expect(data.generados.count).toBe(0);
  });

  it('rechaza un socioId desconocido con 400 y NO crea nada', async () => {
    const antes = (await requestJson('/api/aportes-definicion')).data as any[];

    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: { nombre: 'X', monto: 50, recurrencia: 'mensual', socioIds: ['fake-socio'] },
    });

    expect(status).toBe(400);
    expect(data).toEqual({ error: 'socioIds contains an invalid socio' });
    // Sin definición, sin asignación, sin registros (D18: validación antes de insertar).
    const despues = (await requestJson('/api/aportes-definicion')).data as any[];
    expect(despues).toHaveLength(antes.length);
    expect(filas('SELECT * FROM socio_aportes')).toHaveLength(0);
    expect(filas('SELECT * FROM aportes')).toHaveLength(0);
  });

  it('rechaza socioIds no-array con 400', async () => {
    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: { nombre: 'X', monto: 50, recurrencia: 'mensual', socioIds: 's1' },
    });
    expect(status).toBe(400);
    expect(data).toEqual({ error: 'socioIds must be an array' });
  });

  it('group-scoped genera para los miembros ACTUALES al asignar y NO materializa socio_aportes', async () => {
    const g1 = await crearGrupo('Grupo A');
    const s1 = (await crearSocio({ grupoPrimarioId: g1, aporteIds: [] })).data.id;
    const s2 = (await crearSocio({ grupoAdicionalIds: [g1], aporteIds: [] })).data.id;

    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: { nombre: 'Fondo Grupo A', monto: 10, recurrencia: 'unico', aplicaGrupoId: g1, activo: 1 },
    });

    expect(status).toBe(201);
    const def = data.definiciones.find((d: any) => d.nombre === 'Fondo Grupo A');
    expect(def.aplicaGrupoId).toBe(g1);
    expect(data.generados.count).toBe(2);

    // La join sigue dinámica: NO hay filas socio_aportes para los miembros.
    expect(filas('SELECT * FROM socio_aportes WHERE aporte_id = ?', [def.id])).toHaveLength(0);
    // Pero los miembros actuales SÍ recibieron sus cobros al asignar.
    const conRegistros = filas('SELECT DISTINCT socio_id FROM aportes WHERE aporte_id = ?', [def.id]).map((r) => r.socio_id);
    expect([...conRegistros].sort()).toEqual([s1, s2].sort());
  });

  it('crea una definición group-scoped con aplicaGrupoId (201)', async () => {
    const g1 = await crearGrupo('Grupo A');

    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: { nombre: 'Fondo Grupo B', monto: 10, recurrencia: 'mensual', aplicaGrupoId: g1, activo: 1 },
    });

    expect(status).toBe(201);
    expect(data.definiciones.find((d: any) => d.nombre === 'Fondo Grupo B')).toMatchObject({ aplicaGrupoId: g1 });
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
    const def = await crearDefinicion({ nombre: 'Obsoleta', monto: 12 });

    const { status, data } = await requestJson(`/api/aportes-definicion/${def.id}`, {
      method: 'DELETE',
    });
    expect(status).toBe(200);
    expect(data.some((d: any) => d.id === def.id)).toBe(false);
  });

  it('elimina una definición inactiva sin uso (200)', async () => {
    const def = await crearDefinicion({ nombre: 'Inactiva Libre', monto: 5, activo: 0 });

    const { status, data } = await requestJson(`/api/aportes-definicion/${def.id}`, {
      method: 'DELETE',
    });
    expect(status).toBe(200);
    expect(data.some((d: any) => d.id === def.id)).toBe(false);
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
    const def = await crearDefinicion({ nombre: 'Extraordinario', monto: 80, recurrencia: 'unico' });
    const socio = await crearSocio({ aporteIds: [def.id] });
    await requestJson('/api/aportes', {
      method: 'POST',
      body: { socioId: socio.data.id, aporteId: def.id, gestion: 2025 },
    });

    const { status, data } = await requestJson(`/api/aportes-definicion/${def.id}`, {
      method: 'DELETE',
    });
    expect(status).toBe(409);
    expect(data).toEqual({ error: EN_USO_MSG });

    // El registro generado sigue referenciando la definición (aporte_id intacto).
    // crearSocio ya auto-generó el de la gestión actual (D16); el manual agrega el
    // de 2025 → la definición tiene 2 registros referenciándola.
    const registros = fila('SELECT COUNT(*) AS n FROM aportes WHERE aporte_id = ?', [def.id]);
    expect(registros).toMatchObject({ n: 2 });
  });

  it('devuelve 404 al eliminar una definición inexistente', async () => {
    const { status, data } = await requestJson('/api/aportes-definicion/fake-id', {
      method: 'DELETE',
    });
    expect(status).toBe(404);
    expect(data).toEqual({ error: 'Aporte definition not found' });
  });
});
