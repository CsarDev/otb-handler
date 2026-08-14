import { Hono } from 'hono';
import { z } from 'zod';
import { db, schema } from '@otb/db';
import { eq, inArray } from 'drizzle-orm';
import { hashPassword, requestPasswordResetByUserId, setUserPassword } from '@otb/auth';
import { FEATURES, SUPERADMIN_ROLE_NAME, featureActions, permissionKey, permissionDescription } from '@otb/core';
import { authMiddleware, requirePermission } from '../middleware/auth';

const users = new Hono();

// Apply auth middleware to all routes
users.use('*', authMiddleware);

// Get all users (admin only)
users.get('/', requirePermission('usuarios', 'read'), async (c) => {
  try {
    const allUsers = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        emailVerified: schema.users.emailVerified,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .all();

    return c.json({ users: allUsers });
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Create user (admin only)
users.post('/', requirePermission('usuarios', 'create'), async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, name, roleId, socioId } = z
      .object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().min(1),
        roleId: z.string().min(1),
        socioId: z.string().nullable().optional(),
      })
      .parse(body);

    const existing = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .get();

    if (existing) {
      return c.json({ error: 'Email already registered' }, 409);
    }

    const role = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.id, roleId))
      .get();

    if (!role) {
      return c.json({ error: 'Role not found' }, 404);
    }

    if (role.name === SUPERADMIN_ROLE_NAME) {
      return c.json({ error: 'Cannot assign the superadmin role' }, 400);
    }

    if (socioId) {
      const socio = await db
        .select()
        .from(schema.socios)
        .where(eq(schema.socios.id, socioId))
        .get();

      if (!socio) {
        return c.json({ error: 'Socio not found' }, 404);
      }
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const passwordHash = await hashPassword(password);

    await db.insert(schema.users).values({
      id,
      email: email.toLowerCase(),
      name,
      passwordHash,
      emailVerified: false,
      socioId: socioId ?? null,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.userRoles).values({ userId: id, roleId });

    return c.json({ message: 'User created successfully', id }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get all roles (with their permissions)
users.get('/roles', requirePermission('roles', 'read'), async (c) => {
  try {
    const roles = await db
      .select()
      .from(schema.roles)
      .all();

    const roleIds = roles.map((r) => r.id);
    const rolePermissions = roleIds.length
      ? await db
          .select()
          .from(schema.rolePermissions)
          .where(inArray(schema.rolePermissions.roleId, roleIds))
          .all()
      : [];

    const byRole: Record<string, string[]> = {};
    for (const rp of rolePermissions) {
      (byRole[rp.roleId] ??= []).push(rp.permissionId);
    }

    return c.json({
      roles: roles.map((r) => ({ ...r, permissionIds: byRole[r.id] ?? [] })),
    });
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Create role (admin only)
users.post('/roles', requirePermission('roles', 'manage'), async (c) => {
  try {
    const body = await c.req.json();
    const { name, description, permissionIds } = z
      .object({
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        permissionIds: z.array(z.string()).optional(),
      })
      .parse(body);

    const existing = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, name))
      .get();

    if (existing) {
      return c.json({ error: 'Role already exists' }, 409);
    }

    // The superadmin role cannot be created at runtime (seeded, immutable)
    if (name === SUPERADMIN_ROLE_NAME) {
      return c.json({ error: 'Cannot create the superadmin role' }, 400);
    }

    const id = crypto.randomUUID();
    await db.insert(schema.roles).values({ id, name, description: description ?? null });

    if (permissionIds?.length) {
      await db.insert(schema.rolePermissions).values(
        permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
      );
    }

    return c.json({ message: 'Role created successfully', id }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update role (admin only)
users.put('/roles/:id', requirePermission('roles', 'manage'), async (c) => {
  try {
    const { id } = c.req.param();
    const body = await c.req.json();
    const { name, description } = z
      .object({
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
      })
      .parse(body);

    const role = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.id, id))
      .get();

    if (!role) {
      return c.json({ error: 'Role not found' }, 404);
    }

    if (role.name === SUPERADMIN_ROLE_NAME) {
      return c.json({ error: 'Cannot modify the superadmin role' }, 400);
    }

    if (name) {
      const existing = await db
        .select()
        .from(schema.roles)
        .where(eq(schema.roles.name, name))
        .get();
      if (existing && existing.id !== id) {
        return c.json({ error: 'Role already exists' }, 409);
      }
    }

    await db
      .update(schema.roles)
      .set({ name: name ?? role.name, description: description === undefined ? role.description : description })
      .where(eq(schema.roles.id, id));

    return c.json({ message: 'Role updated successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Delete role (admin only)
users.delete('/roles/:id', requirePermission('roles', 'manage'), async (c) => {
  try {
    const { id } = c.req.param();

    const role = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.id, id))
      .get();

    if (!role) {
      return c.json({ error: 'Role not found' }, 404);
    }

    if (role.name === SUPERADMIN_ROLE_NAME) {
      return c.json({ error: 'Cannot delete the superadmin role' }, 400);
    }

    const usersWithRole = await db
      .select()
      .from(schema.userRoles)
      .where(eq(schema.userRoles.roleId, id))
      .all();

    if (usersWithRole.length > 0) {
      return c.json({ error: 'Cannot delete role: it has assigned users' }, 409);
    }

    await db.delete(schema.roles).where(eq(schema.roles.id, id));

    return c.json({ message: 'Role deleted successfully' });
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Set role permissions (admin only)
users.put('/roles/:id/permissions', requirePermission('roles', 'manage'), async (c) => {
  try {
    const { id } = c.req.param();
    const body = await c.req.json();
    const { permissionIds } = z.object({ permissionIds: z.array(z.string()) }).parse(body);

    const role = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.id, id))
      .get();

    if (!role) {
      return c.json({ error: 'Role not found' }, 404);
    }

    if (role.name === SUPERADMIN_ROLE_NAME) {
      return c.json({ error: 'Cannot modify the superadmin role permissions' }, 400);
    }

    await db.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, id));

    if (permissionIds.length) {
      await db.insert(schema.rolePermissions).values(
        permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
      );
    }

    return c.json({ message: 'Role permissions updated successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get all permissions
users.get('/permissions', requirePermission('permisos', 'read'), async (c) => {
  try {
    const permissions = await db
      .select()
      .from(schema.permissions)
      .all();

    return c.json({ permissions });
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Sync permissions from the feature catalog (admin only)
// Creates missing permissions declared in @otb/core FEATURES and grants them
// to the admin role automatically.
users.post('/permissions/sync', requirePermission('permisos', 'manage'), async (c) => {
  try {
    const existing = await db.select().from(schema.permissions).all();
    const existingKeys = new Set(existing.map((p) => `${p.resource}:${p.action}`));

    const missing = FEATURES.flatMap((f) =>
      featureActions(f)
        .map((a) => ({ key: permissionKey(f, a), feature: f, action: a }))
        .filter(({ key }) => !existingKeys.has(key)),
    );

    if (missing.length > 0) {
      const rows = missing.map(({ feature, action }) => ({
        id: crypto.randomUUID(),
        resource: feature.resource,
        action,
        description: permissionDescription(feature, action),
      }));
      await db.insert(schema.permissions).values(rows);
    }

    // Assign all catalog permissions to the superadmin role (inmutable: catálogo le da todo)
    const superAdminRole = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, SUPERADMIN_ROLE_NAME))
      .get();

    let grantedToSuperadmin = 0;
    if (superAdminRole) {
      const current = await db
        .select({ permissionId: schema.rolePermissions.permissionId })
        .from(schema.rolePermissions)
        .where(eq(schema.rolePermissions.roleId, superAdminRole.id))
        .all();
      const currentIds = new Set(current.map((r) => r.permissionId));

      const allPermissions = await db.select().from(schema.permissions).all();
      const catalogKeys = new Set(
        FEATURES.flatMap((f) => featureActions(f).map((a) => permissionKey(f, a))),
      );
      const toGrant = allPermissions
        .filter((p) => catalogKeys.has(`${p.resource}:${p.action}`))
        .filter((p) => !currentIds.has(p.id));

      if (toGrant.length > 0) {
        await db.insert(schema.rolePermissions).values(
          toGrant.map((p) => ({ roleId: superAdminRole.id, permissionId: p.id })),
        );
        grantedToSuperadmin = toGrant.length;
      }
    }

    return c.json({
      message: 'Permissions synchronized',
      created: missing.length,
      grantedToSuperadmin,
    });
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Send password reset link to a user (admin only)
users.post('/:id/reset-password', requirePermission('usuarios', 'update'), async (c) => {
  try {
    const { id } = c.req.param();

    const sent = await requestPasswordResetByUserId(id);

    if (!sent) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ message: 'Password reset link sent' });
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Set a user's password directly (admin only)
users.put('/:id/password', requirePermission('usuarios', 'update'), async (c) => {
  try {
    const { id } = c.req.param();
    const body = await c.req.json();
    const { newPassword } = z
      .object({ newPassword: z.string().min(8) })
      .parse(body);

    const ok = await setUserPassword(id, newPassword);

    if (!ok) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ message: 'Password updated successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get user by ID (admin only)
users.get('/:id', requirePermission('usuarios', 'read'), async (c) => {
  try {
    const { id } = c.req.param();
    const user = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        emailVerified: schema.users.emailVerified,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .get();

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Get user roles
    const userRoles = await db
      .select({ roleId: schema.userRoles.roleId })
      .from(schema.userRoles)
      .where(eq(schema.userRoles.userId, id))
      .all();

    // Get role names
    const roleIds = userRoles.map((r) => r.roleId);
    const roles = roleIds.length
      ? await db
          .select()
          .from(schema.roles)
          .where(inArray(schema.roles.id, roleIds))
          .all()
      : [];

    return c.json({ user: { ...user, roles } });
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update user role (admin only)
users.put('/:id/role', requirePermission('usuarios', 'update'), async (c) => {
  try {
    const { id } = c.req.param();
    const body = await c.req.json();
    const { roleId } = z.object({ roleId: z.string() }).parse(body);

    // Check if user exists
    const user = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .get();

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Check if role exists
    const role = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.id, roleId))
      .get();

    if (!role) {
      return c.json({ error: 'Role not found' }, 404);
    }

    // Nobody can be assigned the superadmin role (unique, seeded user only)
    if (role.name === SUPERADMIN_ROLE_NAME) {
      return c.json({ error: 'Cannot assign the superadmin role' }, 400);
    }

    // The superadmin user's role cannot be changed
    const currentRoles = await db
      .select({ roleId: schema.userRoles.roleId })
      .from(schema.userRoles)
      .where(eq(schema.userRoles.userId, id))
      .all();

    const currentRoleIds = currentRoles.map((r) => r.roleId);
    if (currentRoleIds.length) {
      const currentRolesData = await db
        .select()
        .from(schema.roles)
        .where(inArray(schema.roles.id, currentRoleIds))
        .all();
      if (currentRolesData.some((r) => r.name === SUPERADMIN_ROLE_NAME)) {
        return c.json({ error: 'Cannot change the superadmin user role' }, 400);
      }
    }

    // Delete existing roles
    await db
      .delete(schema.userRoles)
      .where(eq(schema.userRoles.userId, id));

    // Assign new role
    await db.insert(schema.userRoles).values({ userId: id, roleId });

    return c.json({ message: 'Role updated successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Delete user (admin only)
users.delete('/:id', requirePermission('usuarios', 'delete'), async (c) => {
  try {
    const { id } = c.req.param();

    // Don't allow deleting yourself
    const auth = c.get('auth');
    if (auth.sub === id) {
      return c.json({ error: 'Cannot delete yourself' }, 400);
    }

    // Check if user exists
    const user = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .get();

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // The superadmin user cannot be deleted
    const currentRoles = await db
      .select({ roleId: schema.userRoles.roleId })
      .from(schema.userRoles)
      .where(eq(schema.userRoles.userId, id))
      .all();

    const currentRoleIds = currentRoles.map((r) => r.roleId);
    if (currentRoleIds.length) {
      const currentRolesData = await db
        .select()
        .from(schema.roles)
        .where(inArray(schema.roles.id, currentRoleIds))
        .all();
      if (currentRolesData.some((r) => r.name === SUPERADMIN_ROLE_NAME)) {
        return c.json({ error: 'Cannot delete the superadmin user' }, 400);
      }
    }

    // Delete user (cascades to user_roles, refresh_tokens, etc.)
    await db
      .delete(schema.users)
      .where(eq(schema.users.id, id));

    return c.json({ message: 'User deleted successfully' });
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default users;
