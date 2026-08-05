// T4.2 — Matriz cross-path del invariante de dedup (D13).
//
// La misma clave (socio, aporte, mes, gestion) NUNCA puede existir dos veces,
// sin importar qué combinación de paths la genere:
//   (1) creación de definición con `socioIds` (asignación → registros),
//   (2) re-save del socio (POST/PUT idempotente — mismas asignaciones → 0 nuevos),
//   (3) re-afirmación de membresía (PUT con los mismos grupos → 0 adicionales),
//   (4) re-run de los endpoints manuales (single / bulk / bulk/all → { count: 0 }).
//
// Cada combinación se valida con conteos de filas Y con la query cruda de
// grupos duplicados (debe quedar vacía), más el backstop del índice parcial
// `aporte_dedup_unico` (0006). Los paths de auto-generación (D15/D16) usan la
// gestión ACTUAL; los endpoints manuales apuntan a gestions pasadas explícitas
// (2025) para tener filas que crear (D17).
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  migrarDb,
  limpiarDatos,
  requestJson,
  crearSocio,
  crearDefinicion,
  crearGrupo,
  fila,
  filas,
  ejecutar,
  IDS,
} from './helpers';

beforeAll(() => migrarDb());
beforeEach(() => limpiarDatos());

function bulk(body: Record<string, unknown>) {
  return requestJson('/api/aportes/bulk', { method: 'POST', body });
}

function bulkAll(body: Record<string, unknown>) {
  return requestJson('/api/aportes/bulk/all', { method: 'POST', body });
}

function single(body: Record<string, unknown>) {
  return requestJson('/api/aportes', { method: 'POST', body });
}

/** Grupos duplicados (socio, aporte, mes, gestion) con linaje (aporte_id NOT NULL). */
function gruposDuplicados(): Record<string, unknown>[] {
  return filas(
    `SELECT socio_id, aporte_id, mes, gestion, COUNT(*) AS n
     FROM aportes
     WHERE aporte_id IS NOT NULL
     GROUP BY socio_id, aporte_id, mes, gestion
     HAVING COUNT(*) > 1`,
  );
}

function expectSinDuplicados(): void {
  expect(gruposDuplicados()).toEqual([]);
}

describe('Aportes — backstop del índice parcial (D13, migración 0006)', () => {
  it('el índice parcial `aporte_dedup_unico` existe en el esquema migrado', async () => {
    const row = fila(`SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'aporte_dedup_unico'`);
    expect(row).toBeDefined();
    expect(String(row!.sql)).toMatch(/aporte_dedup_unico/);
    expect(String(row!.sql)).toMatch(/aporte_id/);
  });

  it('un INSERT directo con la misma clave (socio, aporte, mes, gestion) viola el índice', async () => {
    const def = await crearDefinicion({ nombre: 'Backstop', monto: 70, recurrencia: 'unico' });
    const s1 = (await crearSocio({ aporteIds: [def.id] })).data.id;
    // La auto-generación del socio-save (D16) ya materializó (s1, def, mes=1, gestión actual).
    const existente = fila(
      'SELECT socio_id, aporte_id, mes, gestion FROM aportes WHERE aporte_id = ?',
      [def.id],
    )! as { socio_id: string; aporte_id: string; mes: number; gestion: number };

    const insertar = (mes: number) =>
      ejecutar(
        `INSERT INTO aportes (id, socio_id, aporte_id, mes, gestion, tipo, monto_base, monto_pagado, saldo_pendiente, estado)
         VALUES (?, ?, ?, ?, ?, 'unico', 70, 0, 70, 'pendiente')`,
        [crypto.randomUUID(), existente.socio_id, existente.aporte_id, mes, existente.gestion],
      );

    // Clave duplicada → el índice lo rechaza aunque el INSERT no pase por el generador.
    expect(() => insertar(existente.mes)).toThrow(/UNIQUE constraint failed/);
    // Clave nueva (mes distinto) → OK.
    expect(() => insertar(existente.mes + 1)).not.toThrow();
    expectSinDuplicados();
  });

  it('registros legacy (aporte_id NULL) pueden repetir (socio, mes, gestion) — alcance del índice parcial', async () => {
    const s1 = (await crearSocio({ aporteIds: [] })).data.id;

    const insertarLegacy = () =>
      ejecutar(
        `INSERT INTO aportes (id, socio_id, aporte_id, mes, gestion, tipo, monto_base, monto_pagado, saldo_pendiente, estado)
         VALUES (?, ?, NULL, 3, 2025, 'mensual', 50, 0, 50, 'pendiente')`,
        [crypto.randomUUID(), s1],
      );

    // Sin linaje el índice no aplica: dos filas con la misma (socio, mes, gestion) son válidas.
    expect(() => insertarLegacy()).not.toThrow();
    expect(() => insertarLegacy()).not.toThrow();
    expect(
      filas('SELECT * FROM aportes WHERE socio_id = ? AND aporte_id IS NULL AND mes = 3 AND gestion = 2025', [s1]),
    ).toHaveLength(2);
  });
});

describe('Aportes — matriz cross-path del invariante de dedup (T4.2)', () => {
  it('matriz completa: definición con socioIds → re-save socio → membresía → bulk/bulk-all re-run', async () => {
    const gestion = new Date().getFullYear();
    const g1 = await crearGrupo('Grupo Matriz');
    const s1 = (await crearSocio({ grupoPrimarioId: g1, aporteIds: [] })).data.id;
    const s2 = (await crearSocio({ aporteIds: [] })).data.id;

    // (1) Definición con socioIds [s2] ∪ miembros actuales de g1 {s1} → 2 socios × 12 meses = 24.
    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: {
        nombre: 'Matriz Dedup',
        monto: 60,
        recurrencia: 'mensual',
        inicio: `${gestion}-01-01`,
        fin: `${gestion}-12-31`,
        socioIds: [s2],
        aplicaGrupoId: g1,
      },
    });
    expect(status).toBe(201);
    const def = data.definiciones.find((d: any) => d.nombre === 'Matriz Dedup');
    expect(data.generados.count).toBe(24);
    expect(filas('SELECT * FROM aportes WHERE aporte_id = ?', [def.id])).toHaveLength(24);
    expectSinDuplicados();

    // (2) Re-save idempotente del socio (misma asignación directa) → 0 nuevos, sin duplicados.
    const reSave = await requestJson(`/api/socios/${s2}`, {
      method: 'PUT',
      body: { aporteIds: [def.id] },
    });
    expect(reSave.status).toBe(200);
    expect(reSave.data.generados).toEqual({ count: 0 });
    expect(filas('SELECT * FROM aportes WHERE socio_id = ? AND aporte_id = ?', [s2, def.id])).toHaveLength(12);
    expectSinDuplicados();

    // (3) Re-afirmación de membresía (PUT con los mismos grupos) → 0 nuevos, sin duplicados.
    const reAfirmar = await requestJson(`/api/socios/${s1}`, {
      method: 'PUT',
      body: { grupoPrimarioId: g1 },
    });
    expect(reAfirmar.status).toBe(200);
    expect(reAfirmar.data.generados).toEqual({ count: 0 });
    expect(filas('SELECT * FROM aportes WHERE socio_id = ? AND aporte_id = ?', [s1, def.id])).toHaveLength(12);
    expectSinDuplicados();

    // (4a) Bulk re-run de la misma clave ya materializada → { count: 0, items: [] }.
    const bulkRerun = await bulk({ socioIds: [s1, s2], aporteIds: [def.id], gestion });
    expect(bulkRerun.status).toBe(201);
    expect(bulkRerun.data).toEqual({ count: 0, items: [] });
    expectSinDuplicados();

    // (4b) Bulk/all re-run → { count: 0, items: [] }.
    const bulkAllRerun = await bulkAll({ aporteIds: [def.id], gestion });
    expect(bulkAllRerun.status).toBe(201);
    expect(bulkAllRerun.data).toEqual({ count: 0, items: [] });
    expectSinDuplicados();

    // Invariante final: cada clave (socio, def, mes, gestión) existe exactamente una vez.
    const claves = filas(
      'SELECT socio_id, mes, COUNT(*) AS n FROM aportes WHERE aporte_id = ? GROUP BY socio_id, mes',
      [def.id],
    );
    expect(claves).toHaveLength(24);
    expect(claves.every((r) => r.n === 1)).toBe(true);
  });

  it('"a nadie" crea 0 registros; asignado luego por el form de socio aparece exactamente una vez', async () => {
    const gestion = new Date().getFullYear();

    // (1) Creación "a nadie" (sin socioIds ni aplicaGrupoId) → 0 registros.
    const { status, data } = await requestJson('/api/aportes-definicion', {
      method: 'POST',
      body: {
        nombre: 'A Nadie Luego',
        monto: 40,
        recurrencia: 'mensual',
        inicio: `${gestion}-03-01`,
        fin: `${gestion}-04-30`,
      },
    });
    expect(status).toBe(201);
    expect(data.generados).toEqual({ count: 0, items: [] });
    const def = data.definiciones.find((d: any) => d.nombre === 'A Nadie Luego');
    expect(filas('SELECT * FROM aportes WHERE aporte_id = ?', [def.id])).toHaveLength(0);
    expectSinDuplicados();

    // (2) Socio nuevo sin asignaciones → tampoco genera registros.
    const s1 = (await crearSocio({ aporteIds: [] })).data.id;
    expect(filas('SELECT * FROM aportes WHERE socio_id = ?', [s1])).toHaveLength(0);

    // (3) Asignado DESPUÉS vía el form de socio (PUT con aporteIds) → 2 meses exactos.
    const asignar = await requestJson(`/api/socios/${s1}`, {
      method: 'PUT',
      body: { aporteIds: [def.id] },
    });
    expect(asignar.status).toBe(200);
    expect(asignar.data.generados).toEqual({ count: 2 });
    const registros = filas('SELECT mes FROM aportes WHERE socio_id = ? AND aporte_id = ?', [s1, def.id]);
    expect(registros.map((r) => r.mes).sort()).toEqual([3, 4]);
    expectSinDuplicados();

    // (4) La combinación no duplica: re-save idempotente → 0 nuevos, filas intactas.
    const reSave = await requestJson(`/api/socios/${s1}`, {
      method: 'PUT',
      body: { aporteIds: [def.id] },
    });
    expect(reSave.data.generados).toEqual({ count: 0 });
    expect(filas('SELECT * FROM aportes WHERE socio_id = ? AND aporte_id = ?', [s1, def.id])).toHaveLength(2);
    expectSinDuplicados();
  });

  it('membresía adicional: ingresar genera una vez; re-afirmar no duplica; salir no borra; re-ingresar no duplica', async () => {
    const gestion = new Date().getFullYear();
    const g1 = await crearGrupo('Grupo Adicional');
    const def = await crearDefinicion({
      nombre: 'Fondo Adicional',
      monto: 25,
      recurrencia: 'mensual',
      inicio: `${gestion}-05-01`,
      fin: `${gestion}-06-30`,
      aplicaGrupoId: g1,
    });

    // (1) Ingreso al grupo (membresía adicional) → registros generados una vez (2 meses).
    const s1 = (await crearSocio({ grupoAdicionalIds: [g1], aporteIds: [] })).data.id;
    expect(filas('SELECT * FROM aportes WHERE socio_id = ? AND aporte_id = ?', [s1, def.id])).toHaveLength(2);
    expectSinDuplicados();

    // (2) Re-afirmar la membresía (PUT con los mismos grupos) → 0 nuevos.
    const reAfirmar = await requestJson(`/api/socios/${s1}`, {
      method: 'PUT',
      body: { grupoAdicionalIds: [g1] },
    });
    expect(reAfirmar.status).toBe(200);
    expect(reAfirmar.data.generados).toEqual({ count: 0 });
    expect(filas('SELECT * FROM aportes WHERE socio_id = ? AND aporte_id = ?', [s1, def.id])).toHaveLength(2);
    expectSinDuplicados();

    // (3) Salir del grupo (membresía vacía) → la herencia se va pero los registros NUNCA se borran.
    const salir = await requestJson(`/api/socios/${s1}`, {
      method: 'PUT',
      body: { grupoAdicionalIds: [] },
    });
    expect(salir.status).toBe(200);
    expect(salir.data.aportesInherited).toEqual([]);
    expect(filas('SELECT * FROM aportes WHERE socio_id = ? AND aporte_id = ?', [s1, def.id])).toHaveLength(2);
    expectSinDuplicados();

    // (4) Re-ingreso (misma membresía) → dedup: 0 nuevos (las 2 claves ya existen).
    const reIngreso = await requestJson(`/api/socios/${s1}`, {
      method: 'PUT',
      body: { grupoAdicionalIds: [g1] },
    });
    expect(reIngreso.status).toBe(200);
    expect(reIngreso.data.generados).toEqual({ count: 0 });
    expect(filas('SELECT * FROM aportes WHERE socio_id = ? AND aporte_id = ?', [s1, def.id])).toHaveLength(2);
    expectSinDuplicados();
  });

  it('gestión pasada (2025): single + bulk + bulk/all re-run cross-path → { count: 0, items: [] }', async () => {
    const def = await crearDefinicion({
      nombre: 'ReRun 2025',
      monto: 45,
      recurrencia: 'mensual',
      inicio: '2025-01-01',
      fin: '2025-12-31',
    });
    // La ventana no cubre la gestión actual → el socio-save no auto-genera (0 registros).
    const s1 = (await crearSocio({ aporteIds: [def.id] })).data.id;
    const s2 = (await crearSocio({ aporteIds: [def.id] })).data.id;
    expect(filas('SELECT * FROM aportes WHERE aporte_id = ?', [def.id])).toHaveLength(0);

    // Primer run manual (single) para 2025 → 12 registros de s1.
    const primero = await single({ socioId: s1, aporteId: def.id, gestion: 2025 });
    expect(primero.status).toBe(201);
    expect(primero.data.count).toBe(12);

    // bulk para 2025 → s1 ya materializado (0) + s2 pendiente (12).
    const bulk1 = await bulk({ socioIds: [s1, s2], aporteIds: [def.id], gestion: 2025 });
    expect(bulk1.status).toBe(201);
    expect(bulk1.data.count).toBe(12);

    // Re-run cross-path: single re-run → 0 (s1 ya está).
    const singleRerun = await single({ socioId: s1, aporteId: def.id, gestion: 2025 });
    expect(singleRerun.status).toBe(201);
    expect(singleRerun.data).toEqual({ count: 0, items: [] });
    expectSinDuplicados();

    // bulk re-run completo → 0.
    const bulkRerun = await bulk({ socioIds: [s1, s2], aporteIds: [def.id], gestion: 2025 });
    expect(bulkRerun.status).toBe(201);
    expect(bulkRerun.data).toEqual({ count: 0, items: [] });
    expectSinDuplicados();

    // bulk/all re-run → 0.
    const bulkAllRerun = await bulkAll({ aporteIds: [def.id], gestion: 2025 });
    expect(bulkAllRerun.status).toBe(201);
    expect(bulkAllRerun.data).toEqual({ count: 0, items: [] });
    expectSinDuplicados();

    // Total estable: 2 socios × 12 = 24, sin duplicados.
    expect(filas('SELECT * FROM aportes WHERE aporte_id = ?', [def.id])).toHaveLength(24);
    expectSinDuplicados();
  });

  it('socio-save POST (D16) + re-save PUT idempotente sobre una definición activa', async () => {
    const gestion = new Date().getFullYear();

    // POST con asignaciones → genera la gestión actual (12 meses de ap-mensual).
    const creado = await crearSocio({ aporteIds: [IDS.apMensual] });
    expect(creado.status).toBe(201);
    expect(creado.data.generados).toEqual({ count: 12 });
    expectSinDuplicados();

    // PUT con la MISMA asignación → idempotente (count 0), sin duplicados.
    const reSave = await requestJson(`/api/socios/${creado.data.id}`, {
      method: 'PUT',
      body: { aporteIds: [IDS.apMensual] },
    });
    expect(reSave.status).toBe(200);
    expect(reSave.data.generados).toEqual({ count: 0 });
    expect(filas('SELECT * FROM aportes WHERE socio_id = ? AND aporte_id = ?', [creado.data.id, IDS.apMensual])).toHaveLength(12);
    expectSinDuplicados();

    // Re-run manual single para la misma gestión → { count: 0 }.
    const rerun = await single({ socioId: creado.data.id, aporteId: IDS.apMensual, gestion });
    expect(rerun.status).toBe(201);
    expect(rerun.data).toEqual({ count: 0, items: [] });
    expectSinDuplicados();
  });
});
