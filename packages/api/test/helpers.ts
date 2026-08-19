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
import { createToken, hashPassword } from '@otb/auth';
import { FEATURES, SUPERADMIN_ROLE_NAME, featureActions, permissionKey } from '@otb/core';

// HARD GUARD: la suite NUNCA puede correr contra la BD de archivo. Si el
// singleton de @otb/db no es :memory: (p.ej. porque algún import eager evaluó
// @otb/db antes de setear DB_URL), fallamos en seco en vez de corromper la BD
// real (regresión real: packages/db/otb.db quedó con datos de tests).
const sqliteClient = (db as { $client: { memory?: boolean } }).$client;
if (!sqliteClient.memory) {
  throw new Error(
    'Refusing to run tests against a file DB — @otb/db must be opened with DB_URL=:memory: (check test/setup-env.ts runs before any import of @otb/db)',
  );
}

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

/** Token JWT del superadmin para tests autenticados (se inicializa en initAuth). */
let superadminToken: string | null = null;

/** Rastrea si las migraciones ya se aplicaron en este proceso. */
let migrationsApplied = false;

/** Lock para evitar inicialización concurrente del superadmin. */
let initAuthLock: Promise<string> | null = null;

/** Inicializa el superadmin y su token (llamar una vez en beforeAll tras migrarDb). */
export async function initAuth(): Promise<string> {
  if (superadminToken) return superadminToken;
  if (initAuthLock) return initAuthLock;
  
  initAuthLock = (async () => {
    // Reset RBAC tables to ensure clean state with current FEATURES
    await resetRbacTables();
    
    superadminToken = await crearSuperadminToken();
    return superadminToken;
  })();
  
  return initAuthLock;
}

/** Resetea tablas RBAC y recrea superadmin con permisos actuales del catálogo (idempotent). */
async function resetRbacTables(): Promise<void> {
  // Check if superadmin already exists with current permissions
  const existingRole = sqlite.prepare(`SELECT id FROM roles WHERE name = ?`).get(SUPERADMIN_ROLE_NAME) as { id: string } | undefined;
  if (existingRole) {
    // Verify permissions are up to date
    const allPermKeys = FEATURES.flatMap((f) =>
      featureActions(f).map((a) => permissionKey(f, a)),
    );
    const currentPerms = sqlite.prepare(`
      SELECT p.resource || ':' || p.action as perm
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ?
    `).all(existingRole.id) as { perm: string }[];
    const currentPermSet = new Set(currentPerms.map(p => p.perm));
    const missingPerms = allPermKeys.filter(k => !currentPermSet.has(k));
    
    if (missingPerms.length === 0) {
      return;
    }
    // Add missing permissions
    for (const key of missingPerms) {
      const [resource, action] = key.split(':');
      const permId = `perm-${key.replace(':', '-')}`;
      ejecutar(
        `INSERT OR IGNORE INTO permissions (id, resource, action, description) VALUES (?, ?, ?, ?)`,
        [permId, resource, action, `${resource}:${action}`],
      );
      ejecutar(
        `INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
        [existingRole.id, permId],
      );
    }
    return;
  }

  // Clear RBAC tables (only if no superadmin exists)
  ejecutar(`DELETE FROM role_permissions`);
  ejecutar(`DELETE FROM user_roles`);
  ejecutar(`DELETE FROM users`);
  ejecutar(`DELETE FROM permissions`);
  ejecutar(`DELETE FROM roles`);
  
  // Recreate superadmin with current FEATURES permissions
  const now = new Date().toISOString();
  const superRoleId = 'role-super';
  const userId = 'user-super';

  // Insert superadmin role
  ejecutar(
    `INSERT INTO roles (id, name, description) VALUES (?, ?, ?)`,
    [superRoleId, SUPERADMIN_ROLE_NAME, 'Super administrador del sistema'],
  );

  // Insert all permissions from FEATURES catalog
  const allPermKeys = FEATURES.flatMap((f) =>
    featureActions(f).map((a) => permissionKey(f, a)),
  );
  const permIdByKey = new Map<string, string>();
  for (const key of allPermKeys) {
    const [resource, action] = key.split(':');
    const permId = `perm-${key.replace(':', '-')}`;
    permIdByKey.set(key, permId);
    ejecutar(
      `INSERT OR IGNORE INTO permissions (id, resource, action, description) VALUES (?, ?, ?, ?)`,
      [permId, resource, action, `${resource}:${action}`],
    );
  }

  // Assign all permissions to superadmin role
  for (const [key, permId] of permIdByKey) {
    ejecutar(
      `INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
      [superRoleId, permId],
    );
  }

  // Insert superadmin user
  const passwordHash = await hashPassword('superadmin123');
  ejecutar(
    `INSERT OR IGNORE INTO users (id, email, name, password_hash, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`,
    [userId, 'super@otb.com', 'Super Admin', passwordHash, now, now],
  );
  ejecutar(`INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)`, [userId, superRoleId]);
  console.log('[DEBUG] resetRbacTables: superadmin created');
}

/** Obtiene el token del superadmin (requiere initAuth llamado antes). */
export function getSuperadminToken(): string {
  if (!superadminToken) {
    throw new Error('initAuth() must be called before getSuperadminToken()');
  }
  return superadminToken;
}

export const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../db/drizzle',
);

/** Aplica las migraciones SQL (0000..n) sobre el esquema en memoria. */
export function migrarDb(): void {
  // Check if migrations already applied by checking for a key table
  const tableExists = sqlite.prepare(`
    SELECT 1 FROM sqlite_master WHERE type='table' AND name='actividades'
  `).get();
  if (tableExists) return;

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
  migrationsApplied = true;
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
    DELETE FROM aportes_definicion_grupos;
    DELETE FROM aportes;
    DELETE FROM multas;
    DELETE FROM asistencia;
    DELETE FROM socio_grupos;
    DELETE FROM actividades;
    DELETE FROM egresos;
    DELETE FROM socios;
    DELETE FROM aportes_definicion;
    DELETE FROM grupos;
    INSERT INTO aportes_definicion (id, nombre, monto, recurrencia, inicio, fin, modalidad_pago, activo) VALUES
      ('ap-mensual',  'Cuota Social Mensual', 50, 'mensual', NULL, NULL, 'cuotas', 1),
      ('ap-familiar', 'Aporte Familiar',      30, 'mensual', NULL, NULL, 'cuotas', 1),
      ('ap-jubilado', 'Aporte Jubilado',      25, 'mensual', NULL, NULL, 'cuotas', 1),
      ('ap-honorario','Aporte Honorario',      0, 'mensual', NULL, NULL, 'cuotas', 1);
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

/** Crea el token JWT del superadmin (asume que resetRbacTables ya creó el usuario y permisos). */
export async function crearSuperadminToken(): Promise<string> {
  const superRoleId = 'role-super';
  const userId = 'user-super';

  // Create JWT token with all permissions from FEATURES
  const allPermKeys = FEATURES.flatMap((f) =>
    featureActions(f).map((a) => permissionKey(f, a)),
  );
  const token = await createToken({
    sub: userId,
    email: 'super@otb.com',
    roleId: superRoleId,
    permissions: allPermKeys,
  });

  return token;
}

/** POST/PUT/DELETE con body JSON y respuesta parseada (usa superadmin token automáticamente). */
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
  // Auto-include superadmin token if available
  if (superadminToken) {
    init.headers = { ...init.headers, Authorization: `Bearer ${superadminToken}` };
  }
  const res = await api.request(path, init);
  return { status: res.status, data: await res.json() };
}

/** POST/PUT/DELETE autenticado con body JSON y respuesta parseada. */
export async function requestJsonAuth(
  path: string,
  token: string,
  options: { method?: string; body?: unknown } = {},
): Promise<{ status: number; data: any }> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (method !== 'GET' && options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  const init: RequestInit = { method, headers };
  if (method !== 'GET' && options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }
  const res = await api.request(path, init);
  return { status: res.status, data: await res.json() };
}

/**
 * Crea un socio por API y devuelve la respuesta 201. Asigna por defecto la
 * definición `ap-mensual` (modelo corregido: multiselect `aporteIds`); pasar
 * `aporteIds: []` crea un socio sin asignaciones directas.
 *
 * NOTA (D16): el guardado de socio ahora genera los cobros de la gestión actual
 * en la misma transacción. Los tests de generación manual deben apuntar a
 * gestions pasadas explícitas (p.ej. 2025) o a definiciones cuya ventana no
 * cubre el año actual, para que los endpoints manuales tengan filas que crear.
 */
export async function crearSocio(overrides: Record<string, unknown> = {}) {
  const token = getSuperadminToken();
  const { aporteIds = [IDS.apMensual], ...rest } = overrides;
  return requestJsonAuth('/api/socios', token, {
    method: 'POST',
    body: { nombre: 'Juan', apellidoPaterno: 'Perez', aporteIds, ...rest },
  });
}

/** Crea un grupo por API y devuelve su id (UUID generado por el server). */
export async function crearGrupo(nombre = 'Grupo A'): Promise<string> {
  const token = getSuperadminToken();
  const { status, data } = await requestJsonAuth('/api/grupos', token, {
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
 * Crea una definición de aporte por API y devuelve la DEFINICIÓN creada (201).
 * La respuesta de POST es `{ definiciones, generados }` (D15): la definición
 * nueva se localiza en `definiciones` por su nombre. Los ids ahora los genera
 * el server (UUID, D14) — los overrides con `id` se IGNORAN y las suites NO
 * deben hardcodear ids.
 */
export async function crearDefinicion(overrides: Record<string, unknown> = {}): Promise<any> {
  const token = getSuperadminToken();
  const nombre = (overrides.nombre ?? 'Definición Test') as string;
  const { status, data } = await requestJsonAuth('/api/aportes-definicion', token, {
    method: 'POST',
    body: { nombre, monto: 100, ...overrides },
  });
  if (status !== 201) {
    throw new Error(`crearDefinicion falló (${status}): ${JSON.stringify(data)}`);
  }
  const def = (data.definiciones as any[]).find((d: any) => d.nombre === nombre);
  if (!def) throw new Error(`La definición "${nombre}" no aparece en la respuesta`);
  return def;
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
