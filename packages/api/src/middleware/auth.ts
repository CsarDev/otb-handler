import { Context, Next } from 'hono';
import { verifyToken, type AuthPayload } from '@otb/auth';

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthPayload;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyToken(token);
    c.set('auth', payload);
    await next();
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401);
  }
}

export function requirePermission(resource: string, action: string) {
  return async (c: Context, next: Next) => {
    const auth = c.get('auth');

    if (!auth) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const permission = `${resource}:${action}`;
    const hasPermission = auth.permissions.includes(permission) || auth.permissions.includes(`${resource}:manage`);

    if (!hasPermission) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    await next();
  };
}
