import { Hono } from 'hono';
import { z } from 'zod';
import { db, schema } from '@otb/db';
import { eq, inArray } from 'drizzle-orm';
import { hashPassword, requestPasswordResetByUserId } from '@otb/auth';
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

    if (role.name === 'admin' && name && name !== 'admin') {
      return c.json({ error: 'Cannot rename the admin role' }, 400);
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

    if (role.name === 'admin') {
      return c.json({ error: 'Cannot delete the admin role' }, 400);
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
