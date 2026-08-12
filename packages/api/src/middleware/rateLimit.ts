import { Context, Next } from 'hono';

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(options: { windowMs: number; max: number; keyGenerator?: (c: Context) => string }) {
  const { windowMs, max, keyGenerator } = options;

  return async (c: Context, next: Next) => {
    const key = keyGenerator ? keyGenerator(c) : c.req.header('X-Forwarded-For') ?? 'global';
    const now = Date.now();
    const record = rateLimitStore.get(key);

    if (record && record.resetAt > now) {
      if (record.count >= max) {
        return c.json({ error: 'Too many requests' }, 429);
      }
      record.count++;
    } else {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    }

    await next();
  };
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (record.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Cleanup every minute
