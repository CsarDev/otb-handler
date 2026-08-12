# Design: RBAC Authentication & Authorization System

## Technical Approach

Extend the existing `@otb/auth` package with complete auth flows, add Drizzle schema for users/roles/permissions in `@otb/db`, build Hono middleware for auth and permission guards, create Zustand auth store in frontend, and implement login page with protected routes.

## Architecture Decisions

### Decision: Password Hashing with Argon2id

**Choice**: `@node-rs/argon2` (Rust-backed, zero dependencies)
**Alternatives considered**: bcrypt (slower, older), scrypt (complex config), PBKDF2 (weaker against GPU attacks)
**Rationale**: Argon2id is the OWASP recommended choice for password hashing, combining resistance to GPU and side-channel attacks. `@node-rs/argon2` is the fastest Node.js implementation with native Rust bindings.

### Decision: JWT with Short-Lived Access Tokens + Refresh Token Rotation

**Choice**: 15-minute access tokens, 7-day refresh tokens with httpOnly cookie and rotation with reuse detection
**Alternatives considered**: Session-based (Redis), long-lived JWTs, cookie-only sessions
**Rationale**: JWT is already in `@otb/auth` (jose library), stateless verification scales well. Refresh token rotation with reuse detection prevents token theft. Short-lived access tokens limit exposure window.

### Decision: Permission Model as resource:action Pairs

**Choice**: Permissions defined as "resource:action" (e.g., "socios:create", "multas:read")
**Alternatives considered**: Simple boolean flags, scope-based (OAuth), policy-based (CASL)
**Rationale**: Resource:action pairs are explicit, auditable, and map directly to API routes. Simpler than policy-based while more flexible than boolean flags. Easy to extend with new resources.

### Decision: Rate Limiting with In-Memory Fallback

**Choice**: `@hono-rate-limiter` with in-memory store for dev, Upstash Redis for production
**Alternatives considered**: Express rate-limit (Hono incompatible), custom implementation, no rate limiting
**Rationale**: Hono-native, supports Redis for distributed rate limiting, simple in-memory fallback for development.

### Decision: Zustand Auth Store with Persist Middleware

**Choice**: Zustand 5 with persist middleware for token storage, auto-refresh on expiry
**Alternatives considered**: React Context, Redux Toolkit, local component state
**Rationale**: Already using Zustand for app state, persist middleware handles token storage seamlessly, integrates with TanStack Router.

## Data Flow

```
User ──→ Login Form ──→ POST /api/auth/login ──→ API Server
  │                         │
  │                         ├──→ Verify credentials
  │                         ├──→ Create JWT access token
  │                         ├──→ Create refresh token (httpOnly cookie)
  │                         └──→ Log audit event
  │
  ├──→ Store in Zustand auth store
  ├──→ Auto-refresh on token expiry
  └──→ Route guards check permissions
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/auth/src/index.ts` | Modify | Add complete auth flows (register, login, refresh, logout, reset) |
| `packages/auth/src/password.ts` | Create | Argon2id password hashing utilities |
| `packages/auth/src/refresh.ts` | Create | Refresh token management with rotation and reuse detection |
| `packages/auth/src/email.ts` | Create | Email service for verification and password reset |
| `packages/db/src/schema/users.ts` | Create | users, roles, permissions, user_roles, role_permissions, sessions tables |
| `packages/db/src/migrations/` | Create | Drizzle migration for new tables |
| `packages/db/src/seed.ts` | Modify | Add default roles and permissions |
| `packages/core/src/index.ts` | Modify | Add User, Role, Permission, Session types |
| `packages/api/src/middleware/auth.ts` | Create | JWT verification middleware |
| `packages/api/src/middleware/permission.ts` | Create | Permission guard middleware |
| `packages/api/src/routes/auth.ts` | Create | Auth routes (register, login, refresh, logout, me, reset-password) |
| `packages/api/src/routes/users.ts` | Create | User management routes (admin only) |
| `apps/web/src/routes/login.tsx` | Create | Login page |
| `apps/web/src/routes/register.tsx` | Create | Registration page |
| `apps/web/src/routes/forgot-password.tsx` | Create | Password reset request page |
| `apps/web/src/routes/reset-password.tsx` | Create | Password reset form page |
| `apps/web/src/stores/auth.store.ts` | Create | Zustand auth store with token management |
| `apps/web/src/components/ProtectedRoute.tsx` | Create | Route guard component |
| `apps/web/src/hooks/usePermission.ts` | Create | Permission checking hook |
| `packages/ui/src/components/auth/LoginForm.tsx` | Create | Login form component |
| `packages/ui/src/components/auth/RegisterForm.tsx` | Create | Registration form component |
| `packages/ui/src/components/auth/PasswordResetForm.tsx` | Create | Password reset form component |

## Interfaces / Contracts

```typescript
// packages/core/src/index.ts (types)
export type User = {
  id: string;
  email: string;
  name: string;
  roleId: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Role = {
  id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
};

export type Permission = {
  id: string;
  resource: string;
  action: string;
  description: string | null;
};

export type AuthPayload = {
  sub: string;
  email: string;
  roleId: string;
  permissions: string[];
  iat: number;
  exp: number;
};

// API Contract
POST /api/auth/register
  Body: { email: string; password: string; name: string }
  Response: 201 { user: User } | 409 | 400

POST /api/auth/login
  Body: { email: string; password: string }
  Response: 200 { accessToken: string; user: User } | 401 | 429

POST /api/auth/refresh
  Cookie: refreshToken
  Response: 200 { accessToken: string } | 401

POST /api/auth/logout
  Response: 204

GET /api/auth/me
  Header: Authorization: Bearer <accessToken>
  Response: 200 { user: User & { permissions: string[] } } | 401

POST /api/auth/forgot-password
  Body: { email: string }
  Response: 200 | 400

POST /api/auth/reset-password
  Body: { token: string; newPassword: string }
  Response: 200 | 400

POST /api/auth/change-password
  Body: { currentPassword: string; newPassword: string }
  Response: 200 | 400
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Password hashing, token creation/verification, permission checking | Vitest with mocks |
| Integration | Auth flows (register, login, refresh, logout, reset) | Supertest with test database |
| API | Permission guards on routes | Vitest with mocked auth middleware |
| Frontend | Auth store, protected routes, permission hooks | React Testing Library |

## Migration / Rollout

1. Create Drizzle migration for new tables (users, roles, permissions, user_roles, role_permissions, sessions)
2. Seed default roles and permissions
3. No existing user data to migrate (fresh system)
4. Deploy with feature flag: `AUTH_ENABLED=true`
5. Gradually enable auth on routes (start with admin, then tesorero, etc.)

## Open Questions

- [ ] Should we support email verification (confirm email before login)?
- [ ] Should we implement account lockout after N failed attempts (vs. just rate limiting)?
- [ ] Should we add login history/device tracking from day one?
