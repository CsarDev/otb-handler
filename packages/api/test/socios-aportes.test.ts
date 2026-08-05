// Phase 6 / Capability socios-estados: multiselect `aporteIds` (M:N en
// `socio_aportes`, patrón `socio_grupos`) + herencia dinámica por grupo
// (`aportesInherited`, D5 — read-only, sin materialización). El shape NO
// expone tipoAporteId/tipoAporteNombre/aporteBase (modelo corregido).
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrarDb, limpiarDatos, requestJson, crearSocio, crearGrupo, crearDefinicion, filas, IDS } from './helpers';

beforeAll(() => migrarDb());
beforeEach(() => limpiarDatos());

describe('Socios — POST multiselect aporteIds', () => {
  it('POST con múltiples aporteIds persiste ambas asignaciones respetando el orden', async () => {
    const { status, data } = await crearSocio({ aporteIds: [IDS.apMensual, IDS.apFamiliar] });

    expect(status).toBe(201);
    expect(data.aporteIds).toEqual([IDS.apMensual, IDS.apFamiliar]);

    const rows = filas('SELECT socio_id, aporte_id FROM socio_aportes ORDER BY rowid');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.aporte_id)).toEqual([IDS.apMensual, IDS.apFamiliar]);
  });

  it('POST sin aporteIds no crea asignaciones directas (aporteIds: [])', async () => {
    const { status, data } = await crearSocio({ aporteIds: [] });

    expect(status).toBe(201);
    expect(data.aporteIds).toEqual([]);
    expect(filas('SELECT * FROM socio_aportes')).toHaveLength(0);
  });

  it('POST con un id de aporte desconocido se rechaza con 400 y no crea el socio', async () => {
    const { status, data } = await crearSocio({ aporteIds: ['fake-aporte'] });

    expect(status).toBe(400);
    expect(data).toEqual({ error: 'aporteIds contains an invalid aporte' });
    expect(filas('SELECT * FROM socios')).toHaveLength(0);
  });

  it('POST con un aporte inactivo se rechaza con 400', async () => {
    await crearDefinicion({ id: 'ap-inactivo', nombre: 'Inactivo', monto: 10, activo: 0 });

    const { status, data } = await crearSocio({ aporteIds: ['ap-inactivo'] });
    expect(status).toBe(400);
    expect(data.error).toBe('aporteIds contains an inactive aporte');
  });

  it('POST con aporteIds no-array se rechaza con 400', async () => {
    const { status, data } = await crearSocio({ aporteIds: 'ap-mensual' });

    expect(status).toBe(400);
    expect(data).toEqual({ error: 'aporteIds must be an array' });
  });

  it('la respuesta NO expone tipoAporteId/tipoAporteNombre/aporteBase', async () => {
    const { data } = await crearSocio({ aporteIds: [IDS.apMensual, IDS.apFamiliar] });

    expect(data.tipoAporteId).toBeUndefined();
    expect(data.tipoAporteNombre).toBeUndefined();
    expect(data.aporteBase).toBeUndefined();
    expect(Array.isArray(data.aporteIds)).toBe(true);
    expect(Array.isArray(data.aportesInherited)).toBe(true);
  });
});

describe('Socios — PUT reemplazo atómico / preservación', () => {
  it('PUT con aporteIds reemplaza el set atómicamente en la misma transacción', async () => {
    const creado = await crearSocio({ aporteIds: [IDS.apMensual, IDS.apFamiliar] });
    const id = creado.data.id;

    const { status, data } = await requestJson(`/api/socios/${id}`, {
      method: 'PUT',
      body: { aporteIds: [IDS.apMensual] },
    });

    expect(status).toBe(200);
    expect(data.aporteIds).toEqual([IDS.apMensual]);

    const rows = filas('SELECT aporte_id FROM socio_aportes WHERE socio_id = ?', [id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].aporte_id).toBe(IDS.apMensual);
  });

  it('PUT sin aporteIds preserva las asignaciones existentes', async () => {
    const creado = await crearSocio({ aporteIds: [IDS.apMensual] });
    const id = creado.data.id;

    const { status, data } = await requestJson(`/api/socios/${id}`, {
      method: 'PUT',
      body: { telefono: '123456' },
    });

    expect(status).toBe(200);
    expect(data.aporteIds).toEqual([IDS.apMensual]);
    expect(filas('SELECT * FROM socio_aportes WHERE socio_id = ?', [id])).toHaveLength(1);
  });

  it('PUT full reemplazo mantiene el multiselect intacto', async () => {
    const creado = await crearSocio({ aporteIds: [IDS.apMensual, IDS.apFamiliar] });
    const id = creado.data.id;

    const { status, data } = await requestJson(`/api/socios/${id}`, {
      method: 'PUT',
      body: { nombre: 'Juan', apellidoPaterno: 'Perez', aporteIds: [IDS.apMensual, IDS.apFamiliar] },
    });

    expect(status).toBe(200);
    expect(data.aporteIds).toEqual([IDS.apMensual, IDS.apFamiliar]);
    expect(filas('SELECT * FROM socio_aportes WHERE socio_id = ?', [id])).toHaveLength(2);
  });

  it('PUT con un aporteBase legacy no tiene efecto', async () => {
    const creado = await crearSocio({ aporteIds: [IDS.apMensual] });
    const id = creado.data.id;

    const { status, data } = await requestJson(`/api/socios/${id}`, {
      method: 'PUT',
      body: { aporteBase: 999 },
    });

    expect(status).toBe(200);
    expect(data.aporteBase).toBeUndefined();
    expect(data.aporteIds).toEqual([IDS.apMensual]);
  });
});

describe('Socios — herencia dinámica por grupo (aportesInherited, D5)', () => {
  it('hereda del grupo primario', async () => {
    const g1 = await crearGrupo('Grupo A');
    await crearDefinicion({ id: 'ap-g1', nombre: 'Fondo Grupo A', monto: 10, aplicaGrupoId: g1 });

    const creado = await crearSocio({ grupoPrimarioId: g1, aporteIds: [] });
    const { data } = await requestJson(`/api/socios/${creado.data.id}`);

    expect(data.aporteIds).toEqual([]);
    expect(data.aportesInherited).toEqual([
      { id: 'ap-g1', nombre: 'Fondo Grupo A', grupoId: g1, grupoNombre: 'Grupo A' },
    ]);
  });

  it('hereda de un grupo adicional (secundario)', async () => {
    const g2 = await crearGrupo('Grupo B');
    await crearDefinicion({ id: 'ap-g2', nombre: 'Fondo Grupo B', monto: 10, aplicaGrupoId: g2 });

    const creado = await crearSocio({ grupoAdicionalIds: [g2], aporteIds: [] });
    const { data } = await requestJson(`/api/socios/${creado.data.id}`);

    expect(data.aportesInherited).toEqual([
      { id: 'ap-g2', nombre: 'Fondo Grupo B', grupoId: g2, grupoNombre: 'Grupo B' },
    ]);
  });

  it('hereda de primario y secundario a la vez, cada uno con su grupo fuente', async () => {
    const g1 = await crearGrupo('Grupo A');
    const g2 = await crearGrupo('Grupo B');
    await crearDefinicion({ id: 'ap-g1', nombre: 'Fondo A', monto: 10, aplicaGrupoId: g1 });
    await crearDefinicion({ id: 'ap-g2', nombre: 'Fondo B', monto: 20, aplicaGrupoId: g2 });

    const creado = await crearSocio({ grupoPrimarioId: g1, grupoAdicionalIds: [g2], aporteIds: [] });
    const { data } = await requestJson(`/api/socios/${creado.data.id}`);

    const heredados = data.aportesInherited as { id: string; grupoId: string }[];
    expect(heredados).toHaveLength(2);
    expect(heredados.map((i) => i.id).sort()).toEqual(['ap-g1', 'ap-g2']);
    expect(heredados.find((i) => i.id === 'ap-g1')?.grupoId).toBe(g1);
    expect(heredados.find((i) => i.id === 'ap-g2')?.grupoId).toBe(g2);
  });

  it('un miembro FUTURO hereda automáticamente sin materializar socio_aportes ni registros', async () => {
    const g1 = await crearGrupo('Grupo A');
    await crearDefinicion({ id: 'ap-g1', nombre: 'Fondo A', monto: 10, aplicaGrupoId: g1 });

    const creado = await crearSocio({ grupoPrimarioId: g1, aporteIds: [] });
    const id = creado.data.id;
    const { data } = await requestJson(`/api/socios/${id}`);

    expect(data.aportesInherited.map((i: any) => i.id)).toContain('ap-g1');
    expect(filas('SELECT * FROM socio_aportes WHERE socio_id = ?', [id])).toHaveLength(0);
    expect(filas('SELECT * FROM aportes')).toHaveLength(0);
  });

  it('quitar al socio del grupo deja de heredar salvo que tenga asignación directa', async () => {
    const g2 = await crearGrupo('Grupo B');
    await crearDefinicion({ id: 'ap-g2', nombre: 'Fondo B', monto: 20, aplicaGrupoId: g2 });

    // s1: solo herencia (sin directa) → al salir del grupo pierde ap-g2
    const s1 = await crearSocio({ grupoAdicionalIds: [g2], aporteIds: [] });
    const { data: sinDirecta } = await requestJson(`/api/socios/${s1.data.id}`, {
      method: 'PUT',
      body: { grupoAdicionalIds: [] },
    });
    expect(sinDirecta.aportesInherited).toEqual([]);

    // s2: herencia + asignación directa → al salir del grupo conserva ap-g2
    const s2 = await crearSocio({ grupoAdicionalIds: [g2], aporteIds: ['ap-g2'] });
    const { data: conDirecta } = await requestJson(`/api/socios/${s2.data.id}`, {
      method: 'PUT',
      body: { grupoAdicionalIds: [] },
    });
    expect(conDirecta.aporteIds).toContain('ap-g2');
  });

  it('una asignación directa deduplica el chip heredado', async () => {
    const g1 = await crearGrupo('Grupo A');
    await crearDefinicion({ id: 'ap-g1', nombre: 'Fondo A', monto: 10, aplicaGrupoId: g1 });

    const creado = await crearSocio({ grupoPrimarioId: g1, aporteIds: ['ap-g1'] });
    const { data } = await requestJson(`/api/socios/${creado.data.id}`);

    expect(data.aporteIds).toEqual(['ap-g1']);
    expect(data.aportesInherited).toEqual([]);
  });

  it('los chips heredados son read-only: PUT sin aporteIds no los altera ni los remueve', async () => {
    const g1 = await crearGrupo('Grupo A');
    await crearDefinicion({ id: 'ap-g1', nombre: 'Fondo A', monto: 10, aplicaGrupoId: g1 });

    const creado = await crearSocio({ grupoPrimarioId: g1, aporteIds: [] });
    const id = creado.data.id;

    const { status, data } = await requestJson(`/api/socios/${id}`, {
      method: 'PUT',
      body: { telefono: '999' },
    });

    expect(status).toBe(200);
    expect(data.aporteIds).toEqual([]);
    expect(data.aportesInherited.map((i: any) => i.id)).toContain('ap-g1');
    expect(filas('SELECT * FROM socio_aportes WHERE socio_id = ?', [id])).toHaveLength(0);
  });
});
