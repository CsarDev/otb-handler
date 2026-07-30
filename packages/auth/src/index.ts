import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { logger } from '@otb/logger';

export type Role = 'admin' | 'tesorero' | 'secretario' | 'vocal' | 'socio';

export type AuthPayload = JWTPayload & {
  sub: string;
  tenantId: number;
  role: Role;
};

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'otb-dev-secret-change-in-production',
);

export async function createToken(payload: AuthPayload): Promise<string> {
  return new SignJWT(payload as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<AuthPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  logger.debug({ sub: payload.sub }, 'Token verified');
  return payload as unknown as AuthPayload;
}
