import { randomUUID } from 'crypto';
import { db, schema } from '@otb/db';
import { eq, and, lt } from 'drizzle-orm';

export type RefreshTokenResult = {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
};

export function generateRefreshToken(): string {
  return randomUUID();
}

export function hashRefreshToken(token: string): string {
  // Simple SHA-256 hash for refresh tokens
  const { createHash } = require('crypto');
  return createHash('sha256').update(token).digest('hex');
}

export async function createRefreshToken(
  userId: string,
  familyId?: string,
): Promise<RefreshTokenResult> {
  const token = generateRefreshToken();
  const tokenHash = hashRefreshToken(token);
  const id = randomUUID();
  const family = familyId || randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.insert(schema.refreshTokens).values({
    id,
    userId,
    tokenHash,
    familyId: family,
    expiresAt: expiresAt.toISOString(),
    createdAt: new Date().toISOString(),
  });

  return { id, userId, tokenHash, familyId: family, expiresAt };
}

export async function verifyRefreshToken(
  token: string,
): Promise<{ userId: string; familyId: string } | null> {
  const tokenHash = hashRefreshToken(token);

  const record = await db
    .select()
    .from(schema.refreshTokens)
    .where(
      and(
        eq(schema.refreshTokens.tokenHash, tokenHash),
        lt(schema.refreshTokens.expiresAt, new Date().toISOString()),
      ),
    )
    .get();

  if (!record) {
    return null;
  }

  // Check if token is expired
  if (new Date(record.expiresAt) < new Date()) {
    await db
      .delete(schema.refreshTokens)
      .where(eq(schema.refreshTokens.id, record.id));
    return null;
  }

  return { userId: record.userId, familyId: record.familyId };
}

export async function rotateRefreshToken(
  oldToken: string,
): Promise<RefreshTokenResult | null> {
  const tokenHash = hashRefreshToken(oldToken);

  const record = await db
    .select()
    .from(schema.refreshTokens)
    .where(eq(schema.refreshTokens.tokenHash, tokenHash))
    .get();

  if (!record) {
    return null;
  }

  // Check if token is expired
  if (new Date(record.expiresAt) < new Date()) {
    await db
      .delete(schema.refreshTokens)
      .where(eq(schema.refreshTokens.id, record.id));
    return null;
  }

  // Delete the old token
  await db
    .delete(schema.refreshTokens)
    .where(eq(schema.refreshTokens.id, record.id));

  // Check for reuse detection: if another token in the same family exists,
  // someone is using a stolen token
  const familyTokens = await db
    .select()
    .from(schema.refreshTokens)
    .where(eq(schema.refreshTokens.familyId, record.familyId))
    .all();

  if (familyTokens.length > 0) {
    // Reuse detected! Invalidate ALL tokens in this family
    await db
      .delete(schema.refreshTokens)
      .where(eq(schema.refreshTokens.familyId, record.familyId));
    return null;
  }

  // Create new token in the same family
  return createRefreshToken(record.userId, record.familyId);
}

export async function invalidateRefreshToken(token: string): Promise<void> {
  const tokenHash = hashRefreshToken(token);
  await db
    .delete(schema.refreshTokens)
    .where(eq(schema.refreshTokens.tokenHash, tokenHash));
}

export async function invalidateAllUserTokens(userId: string): Promise<void> {
  await db
    .delete(schema.refreshTokens)
    .where(eq(schema.refreshTokens.userId, userId));
}
