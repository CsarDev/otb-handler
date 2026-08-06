// Phase 6 / Capability aporte-definitions: CRUD de definiciones de aporte en
// `/api/aportes-definicion` + guard 409 de DELETE (D10). Modelo corregido: el
// aporte ES la definición (`aportes_definicion`); el id es generado por el
// SERVER (UUID, D14 — un `id` del body se ignora); la aplicación a grupos es
// M:N (`aportes_definicion_grupos`, D1/D25 — POST acepta `grupoIds`, D18
// acepta `socioIds`) y genera cobros en la misma transacción (D15): target
// set = socioIds ∪ miembros actuales de TODOS los grupos, respuesta
// `{ definiciones, generados }`.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrarDb, limpiarDatos, requestJson, crearSocio, crearDefinicion, crearGrupo, fila, filas, ejecutar, IDS } from './helpers';

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
      grupoIds: [], // catálogo hidratado D25: sin grupos = global
      socioIds: [],
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
      grupoIds: [], // sin grupoIds = global
    });
    // D14: el id lo genera el server (UUID), no el cliente.
    expect(nueva.id).toMatch(UUID_RE);
    // "a nadie": sin socioIds ni grupoIds → 0 registros.
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

  it('socioIds ∪ miembros actuales de los grupos se deduplican (count 3)', async () => {
    const g1 = await crearGrupo('Grupo A');
    const s1 = (await crearSocio({ grupoPrimarioId: g1, aporteIds: [] })).data.id; // miembro primario
    const s3 = (await crearSocio({ grupoAdicionalIds: [g1], aporteIds: [] })).data.id; // miembro adicional
    const s2 = (await crearSocio({ aporteIds: [] })).data.id; // asignación directa

    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: { nombre: 'Fondo Mixto', monto: 10, recurrencia: 'unico', grupoIds: [g1], socioIds: [s2] },
    });

    expect(status).toBe(201);
    expect(data.generados.count).toBe(3);
    const def = data.definiciones.find((d: any) => d.nombre === 'Fondo Mixto');
    const conRegistros = filas('SELECT DISTINCT socio_id FROM aportes WHERE aporte_id = ?', [def.id]).map((r) => r.socio_id);
    expect([...conRegistros].sort()).toEqual([s1, s2, s3].sort());
  });

  it('T4.2 multi-grupo: un socio en 2 grupos recibe UNA sola fila (unión dedup, D15)', async () => {
    const g1 = await crearGrupo('Grupo A');
    const g2 = await crearGrupo('Grupo B');
    // s1 pertenece a g1 (primario) Y a g2 (adicional): en la unión aparece una vez.
    const s1 = (await crearSocio({ grupoPrimarioId: g1, grupoAdicionalIds: [g2], aporteIds: [] })).data.id;

    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: { nombre: 'Fondo MultiGrupo', monto: 10, recurrencia: 'unico', grupoIds: [g1, g2] },
    });

    expect(status).toBe(201);
    expect(data.generados.count).toBe(1); // s1, no 2
    const def = data.definiciones.find((d: any) => d.nombre === 'Fondo MultiGrupo');
    expect(filas('SELECT * FROM aportes WHERE aporte_id = ?', [def.id])).toHaveLength(1);
    expect(filas('SELECT socio_id FROM aportes WHERE aporte_id = ?', [def.id])[0].socio_id).toBe(s1);
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
      body: { nombre: 'Fondo Grupo A', monto: 10, recurrencia: 'unico', grupoIds: [g1], activo: 1 },
    });

    expect(status).toBe(201);
    const def = data.definiciones.find((d: any) => d.nombre === 'Fondo Grupo A');
    expect(def.grupoIds).toEqual([g1]);
    expect(data.generados.count).toBe(2);

    // La join sigue dinámica: NO hay filas socio_aportes para los miembros.
    expect(filas('SELECT * FROM socio_aportes WHERE aporte_id = ?', [def.id])).toHaveLength(0);
    // Pero los miembros actuales SÍ recibieron sus cobros al asignar.
    const conRegistros = filas('SELECT DISTINCT socio_id FROM aportes WHERE aporte_id = ?', [def.id]).map((r) => r.socio_id);
    expect([...conRegistros].sort()).toEqual([s1, s2].sort());
  });

  it('crea una definición group-scoped con grupoIds (201)', async () => {
    const g1 = await crearGrupo('Grupo A');
    const g2 = await crearGrupo('Grupo B');

    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: { nombre: 'Fondo Grupos', monto: 10, recurrencia: 'mensual', grupoIds: [g1, g2], activo: 1 },
    });

    expect(status).toBe(201);
    expect(data.definiciones.find((d: any) => d.nombre === 'Fondo Grupos')).toMatchObject({ grupoIds: [g1, g2] });
    // La join M:N materializa UNA fila por grupo.
    const def = data.definiciones.find((d: any) => d.nombre === 'Fondo Grupos');
    const joins = filas('SELECT grupo_id FROM aportes_definicion_grupos WHERE definition_id = ? ORDER BY grupo_id', [def.id]);
    expect(joins.map((r) => r.grupo_id)).toEqual([g1, g2].sort());
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

  it('rechaza POST con grupoIds desconocido con 400', async () => {
    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: { nombre: 'X', monto: 50, grupoIds: ['fake-group'] },
    });
    expect(status).toBe(400);
    expect(data).toEqual({ error: 'grupoIds contains an invalid group' });
  });

  it('rechaza POST con grupoIds no-array con 400', async () => {
    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: { nombre: 'X', monto: 50, grupoIds: 'g1' },
    });
    expect(status).toBe(400);
    expect(data).toEqual({ error: 'grupoIds must be an array' });
  });
});

describe('Aportes Definición — PUT (actualización)', () => {
  it('actualiza campos editables y lo refleja en el catálogo (200)', async () => {
    const { status, data } = await requestJson(`/api/aportes-definicion/${IDS.apMensual}`, {
      method: 'PUT',
      body: { nombre: 'Cuota Social Mensual', monto: 60, fin: '2026-12-31' },
    });

    expect(status).toBe(200);
    expect(data.definiciones.find((d: any) => d.id === IDS.apMensual)).toMatchObject({ monto: 60, fin: '2026-12-31' });
  });

  it('PUT con un id en el body NO renombra la definición (D7)', async () => {
    const { status, data } = await requestJson(`/api/aportes-definicion/${IDS.apMensual}`, {
      method: 'PUT',
      body: { id: 'ap-otro', nombre: 'Cuota Social Mensual', monto: 70 },
    });

    expect(status).toBe(200);
    expect(data.definiciones.find((d: any) => d.id === IDS.apMensual)).toMatchObject({ id: IDS.apMensual, monto: 70 });
    expect(data.definiciones.some((d: any) => d.id === 'ap-otro')).toBe(false);
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

  it('PUT con grupoIds DECLARADOS reemplaza la aplicación M:N (D27)', async () => {
    const g1 = await crearGrupo('Grupo A');
    const g2 = await crearGrupo('Grupo B');
    const def = await crearDefinicion({ nombre: 'Reemplazo', monto: 10, grupoIds: [g1] });

    const { status, data } = await requestJson(`/api/aportes-definicion/${def.id}`, {
      method: 'PUT',
      body: { nombre: 'Reemplazo', monto: 10, grupoIds: [g2] },
    });

    expect(status).toBe(200);
    const actualizada = data.definiciones.find((d: any) => d.id === def.id);
    expect(actualizada.grupoIds).toEqual([g2]);
    const joins = filas('SELECT grupo_id FROM aportes_definicion_grupos WHERE definition_id = ?', [def.id]);
    expect(joins.map((r) => r.grupo_id)).toEqual([g2]);
  });

  it('PUT sin grupoIds declarados PRESERVA la aplicación M:N actual (D27)', async () => {
    const g1 = await crearGrupo('Grupo A');
    const def = await crearDefinicion({ nombre: 'Preserva', monto: 10, grupoIds: [g1] });

    const { status, data } = await requestJson(`/api/aportes-definicion/${def.id}`, {
      method: 'PUT',
      body: { nombre: 'Preserva', monto: 15 },
    });

    expect(status).toBe(200);
    expect(data.definiciones.find((d: any) => d.id === def.id)).toMatchObject({ monto: 15, grupoIds: [g1] });
  });

  it('T4.2 PUT que AGREGA un grupo genera SOLO para los miembros faltantes (D15/D27)', async () => {
    const gestion = new Date().getFullYear();
    const g1 = await crearGrupo('Grupo A');
    const g2 = await crearGrupo('Grupo B');
    const def = await crearDefinicion({
      nombre: 'Crecimiento',
      monto: 10,
      recurrencia: 'mensual',
      inicio: `${gestion}-01-01`,
      fin: `${gestion}-12-31`,
      grupoIds: [g1],
    });
    const s1 = (await crearSocio({ grupoPrimarioId: g1, aporteIds: [] })).data.id; // ya generó con g1
    const s2 = (await crearSocio({ grupoPrimarioId: g2, aporteIds: [] })).data.id; // se suma con g2

    const { status, data } = await requestJson(`/api/aportes-definicion/${def.id}`, {
      method: 'PUT',
      body: { nombre: 'Crecimiento', monto: 10, grupoIds: [g1, g2] },
    });

    expect(status).toBe(200);
    expect(data.generados.count).toBe(12); // solo los 12 meses de s2 (missing-only)
    expect(filas('SELECT * FROM aportes WHERE socio_id = ? AND aporte_id = ?', [s1, def.id])).toHaveLength(12);
    expect(filas('SELECT * FROM aportes WHERE socio_id = ? AND aporte_id = ?', [s2, def.id])).toHaveLength(12);
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

  it('elimina una definición group-scoped y limpia la join M:N (200, sin 409)', async () => {
    const g1 = await crearGrupo('Grupo A');
    const def = await crearDefinicion({ nombre: 'De Grupo', monto: 12, grupoIds: [g1] });

    // La join existe antes del delete…
    expect(filas('SELECT * FROM aportes_definicion_grupos WHERE definition_id = ?', [def.id])).toHaveLength(1);

    const { status, data } = await requestJson(`/api/aportes-definicion/${def.id}`, {
      method: 'DELETE',
    });
    expect(status).toBe(200);
    expect(data.some((d: any) => d.id === def.id)).toBe(false);
    // …y se limpia en la misma transacción (D1: sin orphans en la M:N).
    expect(filas('SELECT * FROM aportes_definicion_grupos WHERE definition_id = ?', [def.id])).toHaveLength(0);
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

describe('Migración 0007 — join M:N aportes_definicion_grupos (D1/D25)', () => {
  it('crea la tabla de join con la PK compuesta (definition_id, grupo_id)', () => {
    const tabla = fila(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'aportes_definicion_grupos'",
    );
    expect(tabla).toBeDefined();

    // La PK compuesta se respeta: dos filas con el mismo par NO pueden convivir.
    const g1 = crearGrupoRaw();
    const defId = 'def-pk-test';
    ejecutar(
      "INSERT INTO aportes_definicion (id, nombre, monto, recurrencia, modalidad_pago, activo) VALUES (?, 'PK', 1, 'mensual', 'cuotas', 1)",
      [defId],
    );
    ejecutar('INSERT INTO aportes_definicion_grupos (definition_id, grupo_id) VALUES (?, ?)', [defId, g1]);
    expect(() =>
      ejecutar('INSERT INTO aportes_definicion_grupos (definition_id, grupo_id) VALUES (?, ?)', [defId, g1]),
    ).toThrow(); // UNIQUE constraint
  });

  it('dropea la columna legacy aplica_grupo_id de aportes_definicion', () => {
    const cols = filas('PRAGMA table_info(aportes_definicion)');
    expect(cols.some((c) => c.name === 'aplica_grupo_id')).toBe(false);
  });

  it('las definiciones del seed quedan GLOBALES: sin filas en la join', () => {
    expect(filas('SELECT * FROM aportes_definicion_grupos')).toHaveLength(0);
  });

  it('el backfill es idempotente: re-ejecutar el INSERT OR IGNORE no duplica filas', () => {
    const g1 = crearGrupoRaw();
    const defId = 'def-backfill-test';
    ejecutar(
      "INSERT INTO aportes_definicion (id, nombre, monto, recurrencia, modalidad_pago, activo) VALUES (?, 'Backfill', 1, 'mensual', 'cuotas', 1)",
      [defId],
    );

    // Simula la fila migrada por el backfill (una definición → un grupo)…
    ejecutar('INSERT INTO aportes_definicion_grupos (definition_id, grupo_id) VALUES (?, ?)', [defId, g1]);
    // …y re-ejecuta la forma del backfill (INSERT OR IGNORE SELECT): 0 filas nuevas.
    ejecutar(
      'INSERT OR IGNORE INTO aportes_definicion_grupos (definition_id, grupo_id) SELECT id, ? FROM aportes_definicion WHERE id = ?',
      [g1, defId],
    );
    expect(filas('SELECT * FROM aportes_definicion_grupos WHERE definition_id = ?', [defId])).toHaveLength(1);
  });
});

/** Crea un grupo vía SQL crudo para los asserts de migración (sin pasar por la API). */
function crearGrupoRaw(): string {
  const id = `g-${Math.random().toString(36).slice(2, 10)}`;
  ejecutar("INSERT INTO grupos (id, nombre) VALUES (?, ?)", [id, 'Grupo Raw']);
  return id;
}

describe('Grupos — guard 409 DELETE por join M:N (D30, fix del orphan-FK)', () => {
  it('un grupo referenciado por una definición de aporte NO se puede eliminar (409)', async () => {
    const g1 = await crearGrupo('Grupo A');
    await crearDefinicion({ nombre: 'Fondo Guard', monto: 10, grupoIds: [g1] });

    const { status, data } = await requestJson(`/api/grupos/${g1}`, {
      method: 'DELETE',
    });

    expect(status).toBe(409);
    expect(data).toEqual({ error: 'Cannot delete: group is referenced by an aporte definition' });
    // El grupo sigue existiendo.
    const grupos = (await requestJson('/api/grupos')).data as { id: string }[];
    expect(grupos.some((g) => g.id === g1)).toBe(true);
  });

  it('un grupo sin referencias SÍ se elimina (200)', async () => {
    const g1 = await crearGrupo('Grupo Libre');

    const { status, data } = await requestJson(`/api/grupos/${g1}`, {
      method: 'DELETE',
    });
    expect(status).toBe(200);
    expect(data.some((g: any) => g.id === g1)).toBe(false);
  });
});
