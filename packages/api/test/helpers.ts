// Helper de integración para los tests de @otb/api.
//
// Estrategia (design.md, Testing Strategy): better-sqlite3 in-memory vía @otb/db
// + Hono `app.request()` contra `ApiApp`. El singleton `db` de @otb/db se abre
// con `DB_URL=':memory:'`; el import dinámico de abajo garantiza que el env var
// ya esté seteado cuando el módulo se evalúa (los imports estáticos se hoistean).
process.env.DB_URL = ':memory:';

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';

// Import dinámico DESPUÉS de setear DB_URL: el singleton abre ':memory:'.
export const { db, schema } = await import('@otb/db');
export const { default: api } = await import('../src/index');

type SqliteClient = {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => {
    run: (...params: unknown[]) => unknown;
    get: (...params: unknown[]) => Record<string, unknown> | undefined;
    all: (...params: unknown[]) => Record<string, unknown>[];
  };
};

/** Conexión better-sqlite3 subyacente (evita importar better-sqlite3/drizzle-orm en @otb/api). */
const sqlite = (db as { $client: unknown }).$client as SqliteClient;

export const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../db/drizzle',
);

/** Aplica las migraciones SQL (0000..n) sobre el esquema en memoria. */
export function migrarDb(): void {
  const files = readdirSync(migrationsFolder)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) {
    const sql = readFileSync(resolve(migrationsFolder, f), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const limpio = stmt.replace(/--.*$/gm, '').trim();
      if (limpio) sqlite.exec(limpio);
    }
  }
}

/**
 * Deja la DB en el estado "catálogos sembrados, sin datos": borra las tablas de
 * datos y restaura las 4 definiciones de aporte del seed (mismos ids estables de
 * packages/db/src/catalogo.ts, modelo corregido D1: `aportes_definicion`).
 * También limpia `grupos` para que los tests de herencia sean independientes.
 * Se ejecuta antes de CADA test para que los tests de un archivo sean
 * independientes entre sí.
 */
export function limpiarDatos(): void {
  sqlite.exec(`
    DELETE FROM movimientos;
    DELETE FROM socio_aportes;
    DELETE FROM aportes;
    DELETE FROM multas;
    DELETE FROM asistencia;
    DELETE FROM socio_grupos;
    DELETE FROM actividades;
    DELETE FROM egresos;
    DELETE FROM socios;
    DELETE FROM aportes_definicion;
    DELETE FROM grupos;
    INSERT INTO aportes_definicion (id, nombre, monto, recurrencia, inicio, fin, modalidad_pago, aplica_grupo_id, activo) VALUES
      ('ap-mensual',  'Cuota Social Mensual', 50, 'mensual', NULL, NULL, 'cuotas', NULL, 1),
      ('ap-familiar', 'Aporte Familiar',      30, 'mensual', NULL, NULL, 'cuotas', NULL, 1),
      ('ap-jubilado', 'Aporte Jubilado',      25, 'mensual', NULL, NULL, 'cuotas', NULL, 1),
      ('ap-honorario','Aporte Honorario',      0, 'mensual', NULL, NULL, 'cuotas', NULL, 1);
  `);
}

/** Query cruda de varias filas (asserts directos sobre la DB real). */
export function filas(sql: string, params: unknown[] = []): Record<string, unknown>[] {
  return sqlite.prepare(sql).all(...params) as Record<string, unknown>[];
}

/** Query cruda de una fila. */
export function fila(sql: string, params: unknown[] = []): Record<string, unknown> | undefined {
  return sqlite.prepare(sql).get(...params) as Record<string, unknown> | undefined;
}

/** Sentencia sin retorno (INSERT/UPDATE/DELETE). */
export function ejecutar(sql: string, params: unknown[] = []): void {
  sqlite.prepare(sql).run(...params);
}

/** POST/PUT/DELETE con body JSON y respuesta parseada. */
export async function requestJson(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<{ status: number; data: any }> {
  const method = options.method ?? 'GET';
  const init: RequestInit = { method };
  if (method !== 'GET' && options.body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }
  const res = await api.request(path, init);
  return { status: res.status, data: await res.json() };
}

/**
 * Crea un socio por API y devuelve la respuesta 201. Asigna por defecto la
 * definición `ap-mensual` (modelo corregido: multiselect `aporteIds`); pasar
 * `aporteIds: []` crea un socio sin asignaciones directas.
 */
export function crearSocio(overrides: Record<string, unknown> = {}) {
  const { aporteIds = [IDS.apMensual], ...rest } = overrides;
  return requestJson('/api/socios', {
    method: 'POST',
    body: { nombre: 'Juan', apellidoPaterno: 'Perez', aporteIds, ...rest },
  });
}

/** Crea un grupo por API y devuelve su id (UUID generado por el server). */
export async function crearGrupo(nombre = 'Grupo A'): Promise<string> {
  const { status, data } = await requestJson('/api/grupos', {
    method: 'POST',
    body: { nombre },
  });
  if (status !== 201) {
    throw new Error(`No se pudo crear el grupo "${nombre}": ${JSON.stringify(data)}`);
  }
  const grupo = (data as { id: string; nombre: string }[]).find((g) => g.nombre === nombre);
  if (!grupo) throw new Error(`El grupo "${nombre}" no aparece en la respuesta`);
  return grupo.id;
}

/**
 * Crea una definición de aporte por API y devuelve el catálogo completo (201).
 * Body por defecto válido; los tests pasan overrides (`id`, `monto`, ...).
 */
export async function crearDefinicion(overrides: Record<string, unknown> = {}): Promise<any[]> {
  const { status, data } = await requestJson('/api/aportes-definicion', {
    method: 'POST',
    body: { nombre: 'Definición Test', monto: 100, ...overrides },
  });
  if (status !== 201) {
    throw new Error(`crearDefinicion falló (${status}): ${JSON.stringify(data)}`);
  }
  return data as any[];
}

// Ids estables del catálogo corregido (fuente: packages/db/src/catalogo.ts).
// `ap*` son slugs de definición en `aportes_definicion`; `est*` son estados.
export const IDS = {
  apMensual: 'ap-mensual',
  apFamiliar: 'ap-familiar',
  apJubilado: 'ap-jubilado',
  apHonorario: 'ap-honorario',
  estActivo: 'est-activo',
  estSuspendido: 'est-suspendido',
  estInactivo: 'est-inactivo',
  estBaja: 'est-baja',
};
