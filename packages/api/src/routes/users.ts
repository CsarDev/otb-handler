import { Hono } from 'hono';
import { z } from 'zod';
import { db, schema } from '@otb/db';
import { eq } from 'drizzle-orm';
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
          .where(eq(schema.roles.id, roleIds[0])) // TODO: use inArray
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

// Get all roles
users.get('/roles', requirePermission('roles', 'read'), async (c) => {
  try {
    const roles = await db
      .select()
      .from(schema.roles)
      .all();

    return c.json({ roles });
  } catch (error) {
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

export default users;
