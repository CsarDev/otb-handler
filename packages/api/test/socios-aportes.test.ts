// Phase 6 / Capability socios-estados: multiselect `aporteIds` (M:N en
// `socio_aportes`, patrón `socio_grupos`) + herencia dinámica por grupo
// (`aportesInherited`, D5 — read-only, sin materialización). El guardado de
// socio GENERA los cobros en la misma transacción (D16): la respuesta incluye
// `generados.count` y la membresía genera registros (INVERTIDO vs. el archivo).
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

  it('POST sin aporteIds no crea asignaciones directas (aporteIds: []) ni registros', async () => {
    const { status, data } = await crearSocio({ aporteIds: [] });

    expect(status).toBe(201);
    expect(data.aporteIds).toEqual([]);
    expect(data.generados).toEqual({ count: 0 }); // D16: sin asignaciones → 0 cobros
    expect(filas('SELECT * FROM socio_aportes')).toHaveLength(0);
    expect(filas('SELECT * FROM aportes')).toHaveLength(0);
  });

  it('POST con aporteIds genera los cobros del socio en la misma transacción (D16)', async () => {
    const { status, data } = await crearSocio({ aporteIds: [IDS.apMensual] });

    expect(status).toBe(201);
    // ap-mensual sin ventana → 12 meses de la gestión actual.
    expect(data.generados.count).toBe(12);
    const registros = filas('SELECT aporte_id, mes, gestion, monto_base FROM aportes WHERE socio_id = ?', [data.id]);
    expect(registros).toHaveLength(12);
    expect(registros.every((r) => r.aporte_id === IDS.apMensual && r.monto_base === 50)).toBe(true);
    expect([...new Set(registros.map((r) => r.gestion))]).toEqual([new Date().getFullYear()]);
  });

  it('POST con un id de aporte desconocido se rechaza con 400 y no crea el socio', async () => {
    const { status, data } = await crearSocio({ aporteIds: ['fake-aporte'] });

    expect(status).toBe(400);
    expect(data).toEqual({ error: 'aporteIds contains an invalid aporte' });
    expect(filas('SELECT * FROM socios')).toHaveLength(0);
  });

  it('POST con un aporte inactivo se rechaza con 400', async () => {
    const def = await crearDefinicion({ nombre: 'Inactivo', monto: 10, activo: 0 });

    const { status, data } = await crearSocio({ aporteIds: [def.id] });
    expect(status).toBe(400);
    expect(data.error).toBe('aporteIds contains an inactive aporte');
  });

  it('POST con aporteIds no-array se rechaza con 400', async () => {
    const { status, data } = await crearSocio({ aporteIds: 'ap-mensual' });

    expect(status).toBe(400);
    expect(data).toEqual({ error: 'aporteIds must be an array' });
  });

  it('POST de un socio cuyo estado no permite aportes conserva la asignación y genera 0 (201, sin 409)', async () => {
    const { status, data } = await crearSocio({ estadoId: IDS.estSuspendido, aporteIds: [IDS.apMensual] });

    expect(status).toBe(201); // NO 409 (bulk-exclusion D9/D16)
    expect(data.aporteIds).toEqual([IDS.apMensual]);
    expect(data.generados.count).toBe(0);
    expect(filas('SELECT * FROM socio_aportes WHERE socio_id = ?', [data.id])).toHaveLength(1);
    expect(filas('SELECT * FROM aportes WHERE socio_id = ?', [data.id])).toHaveLength(0);
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

describe('Socios — PUT reemplazo atómico / preservación / generación (D16)', () => {
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

  it('PUT sin aporteIds preserva las asignaciones existentes (re-save idempotente, count 0)', async () => {
    const creado = await crearSocio({ aporteIds: [IDS.apMensual] });
    const id = creado.data.id;
    const filasIniciales = filas('SELECT * FROM aportes WHERE socio_id = ?', [id]).length;

    const { status, data } = await requestJson(`/api/socios/${id}`, {
      method: 'PUT',
      body: { telefono: '123456' },
    });

    expect(status).toBe(200);
    expect(data.aporteIds).toEqual([IDS.apMensual]);
    // D16: re-save sin cambios → no genera nada nuevo (dedup).
    expect(data.generados.count).toBe(0);
    expect(filas('SELECT * FROM socio_aportes WHERE socio_id = ?', [id])).toHaveLength(1);
    expect(filas('SELECT * FROM aportes WHERE socio_id = ?', [id])).toHaveLength(filasIniciales);
  });

  it('PUT reemplazo atómico NUNCA borra registros ya generados', async () => {
    const creado = await crearSocio({ aporteIds: [IDS.apMensual, IDS.apFamiliar] });
    const id = creado.data.id;
    // 12 (ap-mensual) + 12 (ap-familiar) = 24 cobros de la gestión actual.
    expect(filas('SELECT * FROM aportes WHERE socio_id = ?', [id])).toHaveLength(24);

    const { status, data } = await requestJson(`/api/socios/${id}`, {
      method: 'PUT',
      body: { aporteIds: [IDS.apMensual] },
    });

    expect(status).toBe(200);
    expect(data.aporteIds).toEqual([IDS.apMensual]);
    // La fila de ap-familiar se quita de socio_aportes… pero los cobros quedan.
    expect(filas('SELECT * FROM socio_aportes WHERE socio_id = ?', [id])).toHaveLength(1);
    expect(filas('SELECT * FROM aportes WHERE socio_id = ?', [id])).toHaveLength(24);
    expect(data.generados.count).toBe(0); // ap-mensual ya estaba materializado
  });

  it('PUT agregando un aporte genera SOLO los cobros faltantes', async () => {
    const def = await crearDefinicion({ nombre: 'Anual', monto: 500, recurrencia: 'unico' });
    const creado = await crearSocio({ aporteIds: [IDS.apMensual] });
    const id = creado.data.id;
    expect(filas('SELECT * FROM aportes WHERE socio_id = ?', [id])).toHaveLength(12);

    const { status, data } = await requestJson(`/api/socios/${id}`, {
      method: 'PUT',
      body: { aporteIds: [IDS.apMensual, def.id] },
    });

    expect(status).toBe(200);
    expect(data.aporteIds).toEqual([IDS.apMensual, def.id]);
    // Solo el cobro unico de la definición nueva (ap-mensual ya estaba).
    expect(data.generados.count).toBe(1);
    const registros = filas('SELECT * FROM aportes WHERE socio_id = ?', [id]);
    expect(registros).toHaveLength(13);
    expect(registros.filter((r) => r.aporte_id === IDS.apMensual)).toHaveLength(12);
    expect(registros.filter((r) => r.aporte_id === def.id)).toHaveLength(1);
  });

  it('PUT full reemplazo mantiene el multiselect intacto sin duplicar cobros', async () => {
    const creado = await crearSocio({ aporteIds: [IDS.apMensual, IDS.apFamiliar] });
    const id = creado.data.id;

    const { status, data } = await requestJson(`/api/socios/${id}`, {
      method: 'PUT',
      body: { nombre: 'Juan', apellidoPaterno: 'Perez', aporteIds: [IDS.apMensual, IDS.apFamiliar] },
    });

    expect(status).toBe(200);
    expect(data.aporteIds).toEqual([IDS.apMensual, IDS.apFamiliar]);
    expect(filas('SELECT * FROM socio_aportes WHERE socio_id = ?', [id])).toHaveLength(2);
    // Ya materializados → nada nuevo.
    expect(data.generados.count).toBe(0);
    expect(filas('SELECT * FROM aportes WHERE socio_id = ?', [id])).toHaveLength(24);
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

describe('Socios — herencia dinámica por grupo (aportesInherited, D5) + generación por membresía (D16)', () => {
  it('hereda del grupo primario', async () => {
    const g1 = await crearGrupo('Grupo A');
    const def = await crearDefinicion({ nombre: 'Fondo Grupo A', monto: 10, aplicaGrupoId: g1 });

    const creado = await crearSocio({ grupoPrimarioId: g1, aporteIds: [] });
    const { data } = await requestJson(`/api/socios/${creado.data.id}`);

    expect(data.aporteIds).toEqual([]);
    expect(data.aportesInherited).toEqual([
      { id: def.id, nombre: 'Fondo Grupo A', grupoId: g1, grupoNombre: 'Grupo A' },
    ]);
  });

  it('hereda de un grupo adicional (secundario)', async () => {
    const g2 = await crearGrupo('Grupo B');
    const def = await crearDefinicion({ nombre: 'Fondo Grupo B', monto: 10, aplicaGrupoId: g2 });

    const creado = await crearSocio({ grupoAdicionalIds: [g2], aporteIds: [] });
    const { data } = await requestJson(`/api/socios/${creado.data.id}`);

    expect(data.aportesInherited).toEqual([
      { id: def.id, nombre: 'Fondo Grupo B', grupoId: g2, grupoNombre: 'Grupo B' },
    ]);
  });

  it('hereda de primario y secundario a la vez, cada uno con su grupo fuente', async () => {
    const g1 = await crearGrupo('Grupo A');
    const g2 = await crearGrupo('Grupo B');
    const d1 = await crearDefinicion({ nombre: 'Fondo A', monto: 10, aplicaGrupoId: g1 });
    const d2 = await crearDefinicion({ nombre: 'Fondo B', monto: 20, aplicaGrupoId: g2 });

    const creado = await crearSocio({ grupoPrimarioId: g1, grupoAdicionalIds: [g2], aporteIds: [] });
    const { data } = await requestJson(`/api/socios/${creado.data.id}`);

    const heredados = data.aportesInherited as { id: string; grupoId: string }[];
    expect(heredados).toHaveLength(2);
    expect(heredados.map((i) => i.id).sort()).toEqual([d1.id, d2.id].sort());
    expect(heredados.find((i) => i.id === d1.id)?.grupoId).toBe(g1);
    expect(heredados.find((i) => i.id === d2.id)?.grupoId).toBe(g2);
  });

  it('INVERTIDO: un miembro FUTURO hereda Y recibe registros al momento de la membresía', async () => {
    const g1 = await crearGrupo('Grupo A');
    const def = await crearDefinicion({ nombre: 'Fondo A', monto: 10, recurrencia: 'unico', aplicaGrupoId: g1 });

    const creado = await crearSocio({ grupoPrimarioId: g1, aporteIds: [] });
    const id = creado.data.id;
    const { data } = await requestJson(`/api/socios/${id}`);

    expect(data.aportesInherited.map((i: any) => i.id)).toContain(def.id);
    // La join dinámica NO se materializa (D5)…
    expect(filas('SELECT * FROM socio_aportes WHERE socio_id = ?', [id])).toHaveLength(0);
    // …pero la membresía SÍ genera cobros (D16, INVERTIDO vs. archivo).
    const registros = filas('SELECT * FROM aportes WHERE socio_id = ? AND aporte_id = ?', [id, def.id]);
    expect(registros.length).toBeGreaterThan(0);
    expect(registros[0].monto_base).toBe(10);
  });

  it('re-afirmar la membresía (PUT con los mismos grupos) no duplica registros', async () => {
    const g1 = await crearGrupo('Grupo A');
    const def = await crearDefinicion({ nombre: 'Fondo A', monto: 10, recurrencia: 'unico', aplicaGrupoId: g1 });
    const creado = await crearSocio({ grupoPrimarioId: g1, aporteIds: [] });
    const id = creado.data.id;
    expect(filas('SELECT * FROM aportes WHERE socio_id = ?', [id])).toHaveLength(1);

    const { status, data } = await requestJson(`/api/socios/${id}`, {
      method: 'PUT',
      body: { grupoPrimarioId: g1 },
    });

    expect(status).toBe(200);
    expect(data.generados.count).toBe(0); // dedup: la membresía ya generó
    expect(filas('SELECT * FROM aportes WHERE socio_id = ?', [id])).toHaveLength(1);
    expect(filas('SELECT * FROM aportes WHERE socio_id = ? AND aporte_id = ?', [id, def.id])).toHaveLength(1);
  });

  it('quitar al socio del grupo deja de heredar y NO borra los registros generados', async () => {
    const g2 = await crearGrupo('Grupo B');
    const def = await crearDefinicion({ nombre: 'Fondo B', monto: 20, recurrencia: 'unico', aplicaGrupoId: g2 });

    // s1: solo herencia (sin directa) → al salir del grupo pierde ap-g2 pero
    // los cobros generados al entrar quedan (removal nunca borra registros).
    const s1 = await crearSocio({ grupoAdicionalIds: [g2], aporteIds: [] });
    const registrosS1 = filas('SELECT * FROM aportes WHERE socio_id = ? AND aporte_id = ?', [s1.data.id, def.id]);
    expect(registrosS1).toHaveLength(1);

    const { data: sinDirecta } = await requestJson(`/api/socios/${s1.data.id}`, {
      method: 'PUT',
      body: { grupoAdicionalIds: [] },
    });
    expect(sinDirecta.aportesInherited).toEqual([]);
    expect(filas('SELECT * FROM aportes WHERE socio_id = ? AND aporte_id = ?', [s1.data.id, def.id])).toHaveLength(1);

    // s2: herencia + asignación directa → al salir del grupo conserva ap-g2
    const s2 = await crearSocio({ grupoAdicionalIds: [g2], aporteIds: [def.id] });
    const { data: conDirecta } = await requestJson(`/api/socios/${s2.data.id}`, {
      method: 'PUT',
      body: { grupoAdicionalIds: [] },
    });
    expect(conDirecta.aporteIds).toContain(def.id);
  });

  it('una asignación directa deduplica el chip heredado', async () => {
    const g1 = await crearGrupo('Grupo A');
    const def = await crearDefinicion({ nombre: 'Fondo A', monto: 10, aplicaGrupoId: g1 });

    const creado = await crearSocio({ grupoPrimarioId: g1, aporteIds: [def.id] });
    const { data } = await requestJson(`/api/socios/${creado.data.id}`);

    expect(data.aporteIds).toEqual([def.id]);
    expect(data.aportesInherited).toEqual([]);
  });

  it('los chips heredados son read-only: PUT sin aporteIds no los altera ni los remueve', async () => {
    const g1 = await crearGrupo('Grupo A');
    const def = await crearDefinicion({ nombre: 'Fondo A', monto: 10, aplicaGrupoId: g1 });

    const creado = await crearSocio({ grupoPrimarioId: g1, aporteIds: [] });
    const id = creado.data.id;

    const { status, data } = await requestJson(`/api/socios/${id}`, {
      method: 'PUT',
      body: { telefono: '999' },
    });

    expect(status).toBe(200);
    expect(data.aporteIds).toEqual([]);
    expect(data.aportesInherited.map((i: any) => i.id)).toContain(def.id);
    expect(filas('SELECT * FROM socio_aportes WHERE socio_id = ?', [id])).toHaveLength(0);
  });
});
