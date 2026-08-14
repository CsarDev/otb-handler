// Suite RBAC — protecciones del rol superadmin (D65).
//
// Garantiza la jerarquía solicitada:
// 1) El rol superadmin es inmutable: no se puede crear, renombrar, borrar ni
//    editar sus permisos (ni otorgarlo a otro usuario).
// 2) El usuario superadmin (único, el sembrado) no se puede borrar ni cambiarle
//    el rol; su contraseña SÍ se puede cambiar.
// 3) `POST /permissions/sync` otorga los permisos del catálogo al rol superadmin.
//
// Estrategia: sembrado directo vía `ejecutar()` (igual que limpiarDatos) + token
// firmado con `createToken` para el superadmin. `requirePermission` lee
// `auth.permissions` del payload, así que basta con sembrar roles/permisos.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrarDb, limpiarDatos, ejecutar, filas, api } from './helpers';
import { createToken, hashPassword } from '@otb/auth';

const SUPERADMIN_ROLE = 'superadmin';
const now = new Date().toISOString();

/** POST/PUT/DELETE autenticado con body JSON, parseando la respuesta. */
async function requestJsonAuth(
  path: string,
  token: string,
  options: { method?: string; body?: unknown } = {},
): Promise<{ status: number; data: any }> {
  const method = options.method ?? 'GET';
  const init: RequestInit = { method, headers: { Authorization: `Bearer ${token}` } };
  if (method !== 'GET' && options.body !== undefined) {
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  const res = await api.request(path, init);
  return { status: res.status, data: await res.json() };
}

async function insertSuperadmin() {
  const superRoleId = 'role-super';
  const permId = 'perm-a';
  const userId = 'user-super';

  ejecutar(
    `INSERT INTO roles (id, name, description) VALUES (?, ?, ?)`,
    [superRoleId, SUPERADMIN_ROLE, 'Super administrador del sistema'],
  );
  ejecutar(
    `INSERT INTO permissions (id, resource, action, description) VALUES (?, ?, ?, ?)`,
    [permId, 'usuarios', 'update', 'Ver usuarios'],
  );
  ejecutar(
    `INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
    [superRoleId, permId],
  );
  const passwordHash = await hashPassword('secret123');
  ejecutar(
    `INSERT INTO users (id, email, name, password_hash, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`,
    [userId, 'super@otb.com', 'Super Admin', passwordHash, now, now],
  );
  ejecutar(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`, [userId, superRoleId]);

  const token = await createToken({
    sub: userId,
    email: 'super@otb.com',
    roleId: superRoleId,
    permissions: [
      'usuarios:update',
      'usuarios:create',
      'usuarios:delete',
      'roles:manage',
      'permisos:manage',
      'permisos:read',
    ],
  });
  return { superRoleId, userId, token };
}

beforeAll(() => migrarDb());
beforeEach(() => {
  limpiarDatos();
  ejecutar(`DELETE FROM role_permissions`);
  ejecutar(`DELETE FROM user_roles`);
  ejecutar(`DELETE FROM roles`);
  ejecutar(`DELETE FROM permissions`);
  ejecutar(`DELETE FROM users`);
  ejecutar(`DELETE FROM refresh_tokens`);
  ejecutar(`DELETE FROM password_reset_tokens`);
});

describe('rol superadmin inmutable', () => {
  it('no se puede crear el rol superadmin por API', async () => {
    const { token } = await insertSuperadmin();

    const res = await requestJsonAuth('/api/users/roles', token, {
      method: 'POST',
      body: { name: SUPERADMIN_ROLE },
    });
    // 409: el rol ya existe (check previo); 400: nombre reservado. Ambos bloquean la creación.
    expect([400, 409]).toContain(res.status);
  });

  it('no se puede borrar el rol superadmin', async () => {
    const { superRoleId, token } = await insertSuperadmin();
    const res = await requestJsonAuth(`/api/users/roles/${superRoleId}`, token, {
      method: 'DELETE',
    });
    expect(res.status).toBe(400);
    expect(res.data.error).toContain('superadmin');
  });

  it('no se puede renombrar el rol superadmin', async () => {
    const { superRoleId, token } = await insertSuperadmin();
    const res = await requestJsonAuth(`/api/users/roles/${superRoleId}`, token, {
      method: 'PUT',
      body: { name: 'otro' },
    });
    expect(res.status).toBe(400);
  });

  it('no se pueden editar los permisos del rol superadmin', async () => {
    const { superRoleId, token } = await insertSuperadmin();
    const res = await requestJsonAuth(`/api/users/roles/${superRoleId}/permissions`, token, {
      method: 'PUT',
      body: { permissionIds: [] },
    });
    expect(res.status).toBe(400);
    // Los permisos siguen intactos
    const rows = filas('SELECT * FROM role_permissions WHERE role_id = ?', [superRoleId]);
    expect(rows).toHaveLength(1);
  });

  it('no se puede otorgar el rol superadmin a otro usuario', async () => {
    const { superRoleId, token } = await insertSuperadmin();

    // Segundo usuario con rol "tesorero"
    const tesoreroRoleId = 'role-tes';
    const otherUserId = 'user-other';
    const pwd = await hashPassword('secret123');
    ejecutar(`INSERT INTO roles (id, name) VALUES (?, ?)`, [tesoreroRoleId, 'tesorero']);
    ejecutar(
      `INSERT INTO users (id, email, name, password_hash, email_verified, created_at, updated_at) VALUES (?, 'other@otb.com', 'Other', ?, 1, ?, ?)`,
      [otherUserId, pwd, now, now],
    );
    ejecutar(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`, [otherUserId, tesoreroRoleId]);

    // Al asignar el rol superadmin vía POST /api/users (crear usuario)
    const resCreate = await requestJsonAuth('/api/users', token, {
      method: 'POST',
      body: {
        email: 'nuevo@otb.com',
        password: 'password123',
        name: 'Nuevo',
        roleId: superRoleId,
      },
    });
    expect(resCreate.status).toBe(400);
    expect(resCreate.data.error).toContain('superadmin');

    // Al asignar vía PUT /api/users/:id/role
    const resPut = await requestJsonAuth(`/api/users/${otherUserId}/role`, token, {
      method: 'PUT',
      body: { roleId: superRoleId },
    });
    expect(resPut.status).toBe(400);
  });
});

describe('usuario superadmin protegido', () => {
  it('no se puede cambiar el rol del usuario superadmin', async () => {
    const { userId, token } = await insertSuperadmin();
    const tesoreroRoleId = 'role-tes2';
    ejecutar(`INSERT INTO roles (id, name) VALUES (?, ?)`, [tesoreroRoleId, 'tesorero']);

    const res = await requestJsonAuth(`/api/users/${userId}/role`, token, {
      method: 'PUT',
      body: { roleId: tesoreroRoleId },
    });
    expect(res.status).toBe(400);
    expect(res.data.error).toContain('superadmin');
  });

  it('no se puede borrar el usuario superadmin (incluso por otro admin)', async () => {
    const { userId } = await insertSuperadmin();

    // Un admin regular con permiso usuarios:delete intenta borrarlo
    const adminRoleId = 'role-admin';
    const adminUserId = 'user-admin';
    const pwd = await hashPassword('secret123');
    ejecutar(`INSERT INTO roles (id, name) VALUES (?, ?)`, [adminRoleId, 'admin']);
    ejecutar(
      `INSERT INTO users (id, email, name, password_hash, email_verified, created_at, updated_at) VALUES (?, 'admin@otb.com', 'Admin', ?, 1, ?, ?)`,
      [adminUserId, pwd, now, now],
    );
    ejecutar(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`, [adminUserId, adminRoleId]);

    const adminToken = await createToken({
      sub: adminUserId,
      email: 'admin@otb.com',
      roleId: adminRoleId,
      permissions: ['usuarios:delete'],
    });

    const res = await requestJsonAuth(`/api/users/${userId}`, adminToken, {
      method: 'DELETE',
    });
    expect(res.status).toBe(400);
    expect(res.data.error).toContain('superadmin');
  });

  it('la contraseña del superadmin SÍ se puede cambiar', async () => {
    const { userId, token } = await insertSuperadmin();
    const res = await requestJsonAuth(`/api/users/${userId}/password`, token, {
      method: 'PUT',
      body: { newPassword: 'nuevapass123' },
    });
    expect(res.status).toBe(200);
  });
});

describe('sync otorga al rol superadmin', () => {
  it('grantedToSuperadmin refleja los permisos nuevos del catálogo', async () => {
    const { superRoleId, token } = await insertSuperadmin();
    // Eliminamos el vínculo permiso<->rol para que el sync lo re-grantee
    ejecutar(`DELETE FROM role_permissions WHERE role_id = ?`, [superRoleId]);

    const res = await requestJsonAuth('/api/users/permissions/sync', token, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    expect(res.data.grantedToSuperadmin).toBeGreaterThan(0);
    const rows = filas('SELECT * FROM role_permissions WHERE role_id = ?', [superRoleId]);
    expect(rows.length).toBeGreaterThan(0);
  });
});