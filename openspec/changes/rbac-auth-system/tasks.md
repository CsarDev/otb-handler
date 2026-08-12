# Tasks: RBAC Authentication & Authorization System

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1500-2000 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: DB + Types → PR 2: Auth Flows → PR 3: API Middleware → PR 4: Frontend Auth |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | DB schema + types + migrations | PR 1 | `pnpm --filter @otb/db typecheck` | Manual: verify migration runs | packages/db/src/schema/users.ts |
| 2 | Auth flows (register, login, refresh, logout, reset) | PR 2 | `pnpm --filter @otb/auth test` | curl: POST /api/auth/* endpoints | packages/auth/src/*.ts |
| 3 | API middleware + permission guards + routes | PR 3 | `pnpm --filter @otb/api test` | curl: test all protected routes | packages/api/src/middleware/*.ts |
| 4 | Frontend auth (store, login page, protected routes) | PR 4 | `pnpm --filter @otb/web typecheck` | Browser: login flow, route guards | apps/web/src/stores/auth.store.ts |

## Phase 1: Infrastructure (DB + Types)

- [ ] 1.1 Create `packages/db/src/schema/users.ts` with users, roles, permissions, user_roles, role_permissions, sessions tables (Drizzle)
- [ ] 1.2 Create `packages/db/src/schema/index.ts` export barrel for new tables
- [ ] 1.3 Create `packages/db/src/migrations/` with Drizzle migration for new tables
- [ ] 1.4 Update `packages/db/src/seed.ts` with default roles (admin, tesorero, secretario, vocal, socio) and permissions (socios:read, socios:create, etc.)
- [ ] 1.5 Add User, Role, Permission, Session types to `packages/core/src/index.ts`
- [ ] 1.6 Verify: `pnpm --filter @otb/db typecheck` and `pnpm --filter @otb/core typecheck`

## Phase 2: Auth Flows (Core Package)

- [ ] 2.1 Create `packages/auth/src/password.ts` with Argon2id hash and verify functions
- [ ] 2.2 Create `packages/auth/src/refresh.ts` with refresh token creation, verification, rotation, and reuse detection
- [ ] 2.3 Create `packages/auth/src/email.ts` with email service for verification and password reset
- [ ] 2.4 Extend `packages/auth/src/index.ts` with register, login, logout, resetPassword, changePassword functions
- [ ] 2.5 Add unit tests for password hashing, token creation/verification, and refresh token rotation
- [ ] 2.6 Verify: `pnpm --filter @otb/auth test`

## Phase 3: API Layer (Middleware + Routes)

- [ ] 3.1 Create `packages/api/src/middleware/auth.ts` with JWT verification middleware
- [ ] 3.2 Create `packages/api/src/middleware/permission.ts` with requirePermission(resource, action) guard
- [ ] 3.3 Create `packages/api/src/middleware/rateLimit.ts` with rate limiting for auth endpoints
- [ ] 3.4 Create `packages/api/src/routes/auth.ts` with all auth endpoints (register, login, refresh, logout, me, forgot-password, reset-password, change-password)
- [ ] 3.5 Create `packages/api/src/routes/users.ts` with user management endpoints (admin only)
- [ ] 3.6 Add integration tests for all auth flows
- [ ] 3.7 Verify: `pnpm --filter @otb/api test`

## Phase 4: Frontend Integration

- [ ] 4.1 Create `apps/web/src/stores/auth.store.ts` with Zustand auth store (token management, auto-refresh)
- [ ] 4.2 Create `apps/web/src/components/ProtectedRoute.tsx` with route guard component
- [ ] 4.3 Create `apps/web/src/hooks/usePermission.ts` with permission checking hook
- [ ] 4.4 Create `apps/web/src/routes/login.tsx` with login page
- [ ] 4.5 Create `apps/web/src/routes/register.tsx` with registration page
- [ ] 4.6 Create `apps/web/src/routes/forgot-password.tsx` with password reset request page
- [ ] 4.7 Create `apps/web/src/routes/reset-password.tsx` with password reset form page
- [ ] 4.8 Create `packages/ui/src/components/auth/LoginForm.tsx` with login form component
- [ ] 4.9 Create `packages/ui/src/components/auth/RegisterForm.tsx` with registration form component
- [ ] 4.10 Create `packages/ui/src/components/auth/PasswordResetForm.tsx` with password reset form component
- [ ] 4.11 Add TanStack Router route guards for protected routes
- [ ] 4.12 Verify: `pnpm --filter @otb/web typecheck` and `pnpm --filter @otb/ui typecheck`

## Phase 5: Testing & Verification

- [ ] 5.1 Write unit tests for auth store (token management, auto-refresh)
- [ ] 5.2 Write unit tests for permission hooks (usePermission, ProtectedRoute)
- [ ] 5.3 Write integration tests for login flow (form → API → store → redirect)
- [ ] 5.4 Write integration tests for protected routes (unauthorized → redirect, authorized → render)
- [ ] 5.5 Run full test suite: `pnpm test`
- [ ] 5.6 Run typecheck: `pnpm typecheck`
- [ ] 5.7 Manual E2E test: complete registration → login → access protected routes → logout flow
