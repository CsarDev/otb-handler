import { Hono } from 'hono';
import { z } from 'zod';
import {
  register,
  login,
  logout,
  refresh,
  requestPasswordReset,
  resetPassword,
  changePassword,
  getCurrentUser,
} from '@otb/auth';
import { authMiddleware } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';

const auth = new Hono();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const resetPasswordSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8),
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
});

// Rate limiters
const registerLimiter = rateLimit({ windowMs: 60000, max: 5 });
const loginLimiter = rateLimit({ windowMs: 60000, max: 5 });
const resetLimiter = rateLimit({ windowMs: 60000, max: 3 });

// Register
auth.post('/register', registerLimiter, async (c) => {
  try {
    const body = await c.req.json();
    const data = registerSchema.parse(body);
    const result = await register(data.email, data.password, data.name);
    return c.json(result, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400);
    }
    if (error instanceof Error && error.message === 'Email already registered') {
      return c.json({ error: 'Email already registered' }, 409);
    }
    if (error instanceof Error && error.message === 'Password too short') {
      return c.json({ error: 'Password too short' }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Login
auth.post('/login', loginLimiter, async (c) => {
  try {
    const body = await c.req.json();
    const data = loginSchema.parse(body);
    const result = await login(data.email, data.password);

    // Set refresh token as httpOnly cookie
    c.header('Set-Cookie', `refreshToken=${result.refreshToken}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/refresh; Max-Age=${7 * 24 * 60 * 60}`);

    return c.json({ accessToken: result.accessToken, user: result.user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400);
    }
    if (error instanceof Error && error.message === 'Invalid credentials') {
      return c.json({ error: 'Invalid credentials' }, 401);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Refresh token
auth.post('/refresh', async (c) => {
  try {
    const refreshToken = c.req.header('Cookie')?.match(/refreshToken=([^;]+)/)?.[1];

    if (!refreshToken) {
      return c.json({ error: 'Refresh token required' }, 401);
    }

    const result = await refresh(refreshToken);

    if (!result) {
      return c.json({ error: 'Invalid refresh token' }, 401);
    }

    // Set new refresh token as httpOnly cookie
    c.header('Set-Cookie', `refreshToken=${result.refreshToken}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/refresh; Max-Age=${7 * 24 * 60 * 60}`);

    return c.json({ accessToken: result.accessToken });
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Logout
auth.post('/logout', async (c) => {
  try {
    const refreshToken = c.req.header('Cookie')?.match(/refreshToken=([^;]+)/)?.[1];

    if (refreshToken) {
      await logout(refreshToken);
    }

    // Clear refresh token cookie
    c.header('Set-Cookie', 'refreshToken=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/refresh; Max-Age=0');

    return c.json({ message: 'Logged out' });
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get current user
auth.get('/me', authMiddleware, async (c) => {
  try {
    const auth = c.get('auth');
    const user = await getCurrentUser(auth.sub);

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ user });
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Request password reset
auth.post('/forgot-password', resetLimiter, async (c) => {
  try {
    const body = await c.req.json();
    const { email } = z.object({ email: z.string().email() }).parse(body);
    await requestPasswordReset(email);
    // Always return 200 to prevent user enumeration
    return c.json({ message: 'If the email exists, a reset link has been sent' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Reset password
auth.post('/reset-password', async (c) => {
  try {
    const body = await c.req.json();
    const data = resetPasswordSchema.parse(body);
    const success = await resetPassword(data.token, data.newPassword);

    if (!success) {
      return c.json({ error: 'Invalid or expired token' }, 400);
    }

    return c.json({ message: 'Password reset successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Change password (authenticated)
auth.post('/change-password', authMiddleware, async (c) => {
  try {
    const auth = c.get('auth');
    const body = await c.req.json();
    const data = changePasswordSchema.parse(body);
    const success = await changePassword(auth.sub, data.currentPassword, data.newPassword);

    if (!success) {
      return c.json({ error: 'Current password is incorrect' }, 400);
    }

    return c.json({ message: 'Password changed successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default auth;
