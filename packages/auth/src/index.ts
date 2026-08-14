import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { randomUUID } from 'crypto';
import { logger } from '@otb/logger';
import { db, schema } from '@otb/db';
import { eq, and, lt, inArray } from 'drizzle-orm';
import { hashPassword, verifyPassword } from './password';

export { hashPassword } from './password';
export { sendPasswordResetEmail } from './email';
import {
  createRefreshToken,
  verifyRefreshToken,
  rotateRefreshToken,
  invalidateRefreshToken,
  invalidateAllUserTokens,
} from './refresh';
import { sendVerificationEmail, sendPasswordResetEmail } from './email';

export type Role = 'admin' | 'tesorero' | 'secretario' | 'vocal' | 'socio';

export type AuthPayload = JWTPayload & {
  sub: string;
  email: string;
  roleId: string;
  permissions: string[];
};

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'otb-dev-secret-change-in-production',
);

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days
const PASSWORD_RESET_EXPIRY = 60 * 60 * 1000; // 1 hour

export async function createToken(payload: AuthPayload): Promise<string> {
  return new SignJWT(payload as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<AuthPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  logger.debug({ sub: payload.sub }, 'Token verified');
  return payload as unknown as AuthPayload;
}

export async function getUserPermissions(userId: string): Promise<string[]> {
  const userRoles = await db
    .select({ roleId: schema.userRoles.roleId })
    .from(schema.userRoles)
    .where(eq(schema.userRoles.userId, userId))
    .all();

  if (userRoles.length === 0) return [];

  const roleIds = userRoles.map((r) => r.roleId);
  const rolePermissions = await db
    .select({ permissionId: schema.rolePermissions.permissionId })
    .from(schema.rolePermissions)
    .where(inArray(schema.rolePermissions.roleId, roleIds))
    .all();

  const permissionIds = rolePermissions.map((rp) => rp.permissionId);
  if (permissionIds.length === 0) return [];

  const perms = await db
    .select()
    .from(schema.permissions)
    .where(inArray(schema.permissions.id, permissionIds))
    .all();

  return perms.map((p) => `${p.resource}:${p.action}`);
}

export async function register(
  email: string,
  password: string,
  name: string,
): Promise<{
  user: { id: string; email: string; name: string; roleId: string; permissions: string[] };
  accessToken: string;
}> {
  // Check if email already exists
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase()))
    .get();

  if (existing) {
    throw new Error('Email already registered');
  }

  // Validate password strength
  if (password.length < 8) {
    throw new Error('Password too short');
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user
  const userId = randomUUID();
  const now = new Date().toISOString();

  // Get default role (socio)
  const defaultRole = await db
    .select()
    .from(schema.roles)
    .where(eq(schema.roles.name, 'socio'))
    .get();

  if (!defaultRole) {
    throw new Error('Default role not found');
  }

  await db.insert(schema.users).values({
    id: userId,
    email: email.toLowerCase(),
    name,
    passwordHash,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });

  // Assign default role
  await db.insert(schema.userRoles).values({
    userId,
    roleId: defaultRole.id,
  });

  // Get user permissions
  const permissions = await getUserPermissions(userId);

  // Create access token
  const accessToken = await createToken({
    sub: userId,
    email: email.toLowerCase(),
    roleId: defaultRole.id,
    permissions,
  });

  // Send verification email (non-blocking)
  const verificationToken = randomUUID();
  const verificationTokenHash = await hashPassword(verificationToken);
  const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await db.insert(schema.emailVerificationTokens).values({
    id: randomUUID(),
    userId,
    tokenHash: verificationTokenHash,
    expiresAt: verificationExpiresAt,
    createdAt: now,
  });

  sendVerificationEmail(email.toLowerCase(), verificationToken).catch((err) => {
    logger.error({ err }, 'Failed to send verification email');
  });

  logger.info({ userId, email }, 'User registered');

  return {
    user: {
      id: userId,
      email: email.toLowerCase(),
      name,
      roleId: defaultRole.id,
      permissions,
    },
    accessToken,
  };
}

async function findUserByIdentifier(identifier: string) {
  const trimmed = identifier.trim();

  if (trimmed.includes('@')) {
    return db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, trimmed.toLowerCase()))
      .get();
  }

  // Lookup by socio CI: users.socioId -> socios.ci
  const socio = await db
    .select()
    .from(schema.socios)
    .where(eq(schema.socios.ci, trimmed))
    .get();

  if (!socio) {
    return null;
  }

  return db
    .select()
    .from(schema.users)
    .where(eq(schema.users.socioId, socio.id))
    .get();
}

export async function login(
  identifier: string,
  password: string,
): Promise<{
  user: { id: string; email: string; name: string; roleId: string; permissions: string[] };
  accessToken: string;
  refreshToken: string;
}> {
  // Find user by email or socio CI
  const user = await findUserByIdentifier(identifier);

  if (!user) {
    throw new Error('Invalid credentials');
  }

  // Verify password
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new Error('Invalid credentials');
  }

  // Get user role
  const userRole = await db
    .select({ roleId: schema.userRoles.roleId })
    .from(schema.userRoles)
    .where(eq(schema.userRoles.userId, user.id))
    .get();

  if (!userRole) {
    throw new Error('User has no role assigned');
  }

  // Get user permissions
  const permissions = await getUserPermissions(user.id);

  // Create access token
  const accessToken = await createToken({
    sub: user.id,
    email: user.email,
    roleId: userRole.roleId,
    permissions,
  });

  // Create refresh token
  const refreshTokenResult = await createRefreshToken(user.id);

  logger.info({ userId: user.id, identifier }, 'User logged in');

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      roleId: userRole.roleId,
      permissions,
    },
    accessToken,
    refreshToken: refreshTokenResult.token, // This is the actual token to store in the cookie
  };
}

export async function refresh(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  // Verify and rotate refresh token
  const result = await rotateRefreshToken(refreshToken);

  if (!result) {
    return null;
  }

  // Get user
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, result.userId))
    .get();

  if (!user) {
    return null;
  }

  // Get user role
  const userRole = await db
    .select({ roleId: schema.userRoles.roleId })
    .from(schema.userRoles)
    .where(eq(schema.userRoles.userId, user.id))
    .get();

  if (!userRole) {
    return null;
  }

  // Get user permissions
  const permissions = await getUserPermissions(user.id);

  // Create new access token
  const accessToken = await createToken({
    sub: user.id,
    email: user.email,
    roleId: userRole.roleId,
    permissions,
  });

  logger.debug({ userId: user.id }, 'Token refreshed');

  return {
    accessToken,
    refreshToken: result.token,
  };
}

export async function logout(refreshToken: string): Promise<void> {
  await invalidateRefreshToken(refreshToken);
  logger.info('User logged out');
}

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase()))
    .get();

  if (!user) {
    // Don't reveal if user exists
    return;
  }

  // Invalidate any existing reset tokens
  await db
    .delete(schema.passwordResetTokens)
    .where(eq(schema.passwordResetTokens.userId, user.id));

  // Create new reset token
  const resetToken = randomUUID();
  const resetTokenHash = await hashPassword(resetToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY).toISOString();

  await db.insert(schema.passwordResetTokens).values({
    id: randomUUID(),
    userId: user.id,
    tokenHash: resetTokenHash,
    expiresAt,
    createdAt: new Date().toISOString(),
  });

  // Send reset email (non-blocking)
  sendPasswordResetEmail(user.email, resetToken).catch((err) => {
    logger.error({ err }, 'Failed to send password reset email');
  });

  logger.info({ userId: user.id }, 'Password reset requested');
}

export async function requestPasswordResetByUserId(userId: string): Promise<boolean> {
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();

  if (!user) {
    return false;
  }

  // Invalidate any existing reset tokens
  await db
    .delete(schema.passwordResetTokens)
    .where(eq(schema.passwordResetTokens.userId, user.id));

  // Create new reset token
  const resetToken = randomUUID();
  const resetTokenHash = await hashPassword(resetToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY).toISOString();

  await db.insert(schema.passwordResetTokens).values({
    id: randomUUID(),
    userId: user.id,
    tokenHash: resetTokenHash,
    expiresAt,
    createdAt: new Date().toISOString(),
  });

  // Send reset email (non-blocking)
  sendPasswordResetEmail(user.email, resetToken).catch((err) => {
    logger.error({ err }, 'Failed to send password reset email');
  });

  logger.info({ userId: user.id }, 'Password reset requested by admin');

  return true;
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<boolean> {
  // Find the reset token
  const resetToken = await db
    .select()
    .from(schema.passwordResetTokens)
    .where(
      and(
        eq(schema.passwordResetTokens.used, false),
        lt(schema.passwordResetTokens.expiresAt, new Date().toISOString()),
      ),
    )
    .get();

  if (!resetToken) {
    return false;
  }

  // Verify token
  const valid = await verifyPassword(token, resetToken.tokenHash);
  if (!valid) {
    return false;
  }

  // Mark token as used
  await db
    .update(schema.passwordResetTokens)
    .set({ used: true })
    .where(eq(schema.passwordResetTokens.id, resetToken.id));

  // Update password
  const passwordHash = await hashPassword(newPassword);
  await db
    .update(schema.users)
    .set({ passwordHash, updatedAt: new Date().toISOString() })
    .where(eq(schema.users.id, resetToken.userId));

  // Invalidate all refresh tokens for this user
  await invalidateAllUserTokens(resetToken.userId);

  logger.info({ userId: resetToken.userId }, 'Password reset completed');

  return true;
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<boolean> {
  // Get user
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();

  if (!user) {
    return false;
  }

  // Verify current password
  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    return false;
  }

  // Update password
  const passwordHash = await hashPassword(newPassword);
  await db
    .update(schema.users)
    .set({ passwordHash, updatedAt: new Date().toISOString() })
    .where(eq(schema.users.id, userId));

  // Invalidate all refresh tokens for this user
  await invalidateAllUserTokens(userId);

  logger.info({ userId }, 'Password changed');

  return true;
}

/** Fuerza un nuevo password (admin) sin verificar el actual. Invalida sesiones. */
export async function setUserPassword(userId: string, newPassword: string): Promise<boolean> {
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();

  if (!user) {
    return false;
  }

  const passwordHash = await hashPassword(newPassword);
  await db
    .update(schema.users)
    .set({ passwordHash, updatedAt: new Date().toISOString() })
    .where(eq(schema.users.id, userId));

  await invalidateAllUserTokens(userId);

  logger.info({ userId }, 'Password set by admin');

  return true;
}

export async function getCurrentUser(userId: string) {
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();

  if (!user) {
    return null;
  }

  const userRole = await db
    .select({ roleId: schema.userRoles.roleId })
    .from(schema.userRoles)
    .where(eq(schema.userRoles.userId, userId))
    .get();

  const permissions = await getUserPermissions(userId);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roleId: userRole?.roleId,
    permissions,
  };
}
