# Proposal: RBAC Authentication & Authorization System

## Intent

Implement a complete, secure, and maintainable Role-Based Access Control (RBAC) system for the OTB Handler application. Currently the project has a basic JWT auth package (`@otb/auth`) with role types but no user management, password hashing, session handling, permission system, or frontend integration. This change will deliver production-ready authentication and fine-grained authorization for every action in the system.

## Scope

### In Scope
- **User management**: Registration, login, logout, password reset (email-based), profile management
- **Secure authentication**: Argon2id password hashing, JWT access tokens (15min), refresh tokens (7d, httpOnly cookie, rotation), CSRF protection
- **RBAC core**: Roles (admin, tesorero, secretario, vocal, socio), permissions as resource:action pairs, role-permission assignments
- **API layer**: Auth middleware, permission guards per route, rate limiting on auth endpoints
- **Database schema**: users, roles, permissions, user_roles, role_permissions tables with Drizzle
- **Frontend**: Login page, protected routes, role-based UI rendering, token management (auto-refresh), Zustand auth store
- **Session management**: Concurrent session limit, revocation, device tracking
- **Audit logging**: Login attempts, permission changes, sensitive actions

### Out of Scope
- OAuth2/OIDC providers (Google, Microsoft, etc.) — future enhancement
- MFA/2FA — future enhancement (TOTP, WebAuthn)
- Impersonation (admin acting as user) — future enhancement
- SSO/SAML — out of scope for this project
- Advanced password policies (breach detection, custom rules) — basic only

## Approach

**Tech choices (open-source, battle-tested):**
- **Password hashing**: `@node-rs/argon2` (Rust-backed, zero-deps, fastest Argon2id)
- **JWT**: `jose` (already in `@otb/auth`, RFC 7519 compliant, edge-compatible)
- **Rate limiting**: `@hono-rate-limiter` with Upstash Redis (or in-memory fallback for dev)
- **Validation**: Zod 4 (already in stack)
- **Email**: Nodemailer with SMTP (configurable provider)
- **Frontend auth**: TanStack Router route guards + Zustand 5 persist middleware

**Architecture:**
1. Extend `@otb/auth` with complete auth flows (register, login, refresh, logout, reset)
2. Add Drizzle schema for users/roles/permissions in `@otb/db`
3. Create `@otb/core` types for User, Role, Permission, Session
4. Build Hono middleware: `authMiddleware`, `requirePermission(resource, action)`
5. Implement auth routes: `/api/auth/*` (register, login, refresh, logout, me, reset-password)
6. Frontend: login page, auth store, protected route wrapper, `usePermission` hook
7. Seed default roles + permissions on migration

**Security standards:**
- OWASP Authentication Cheatsheet compliance
- NIST SP 800-63B (Digital Identity Guidelines)
- Secure defaults: httpOnly, secure, sameSite=lax cookies; short-lived access tokens; refresh token rotation with reuse detection
- Constant-time comparisons, timing-safe validation

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/auth` | **Major New** | Complete auth flows, token management, password hashing, email service |
| `packages/db` | **Major New** | users, roles, permissions, user_roles, role_permissions, sessions tables + migrations |
| `packages/core` | **Modified** | Add User, Role, Permission, Session types; permission checking utilities |
| `packages/api` | **Major New** | Auth routes, auth middleware, permission guards, rate limiting |
| `apps/web` | **Major New** | Login page, auth store, protected routes, role-based UI components |
| `apps/server` | **Modified** | Mount auth routes, configure middleware |
| `packages/ui` | **New** | Auth form components (LoginForm, RegisterForm, PasswordResetForm) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Breaking existing API routes during middleware integration | Medium | Add middleware incrementally; test each route; feature flag for gradual rollout |
| Refresh token rotation complexity (reuse detection) | Medium | Use established pattern: store token hash + family ID; invalidate family on reuse |
| Password reset email delivery failures | Low | Queue emails with retry; log failures; provide admin "resend" action |
| Migration data loss (no users table currently) | Low | Fresh migration; no existing user data to preserve |
| Frontend token race conditions (multiple tabs) | Medium | Use BroadcastChannel for cross-tab token sync; test thoroughly |

## Rollback Plan

1. **Git revert**: `git revert <merge-commit>` — removes all code changes
2. **Database**: `pnpm db:migrate down` — drops new tables (users, roles, permissions, sessions)
3. **Config**: Remove `JWT_SECRET`, `REFRESH_SECRET`, `ARGON2_*` env vars
4. **Frontend**: Delete auth store, login page, protected route wrapper
5. **Dependencies**: Remove `@node-rs/argon2`, `@hono-rate-limiter`, `nodemailer` from affected packages

## Dependencies

- `@node-rs/argon2` ^2.0.0 (password hashing)
- `@hono-rate-limiter` ^0.3.0 (rate limiting)
- `nodemailer` ^6.9.0 (email delivery)
- `@types/nodemailer` ^6.4.0
- Upstash Redis (optional, for production rate limiting) — `@upstash/ratelimit`, `@upstash/redis`

## Success Criteria

- [ ] User can register, verify email, login, access protected routes
- [ ] Access tokens expire in 15min; refresh tokens rotate every 7 days with reuse detection
- [ ] All API routes protected by `requirePermission(resource, action)` guards
- [ ] Roles seeded: admin (all), tesorero (financial), secretario (admin), vocal (read), socio (self)
- [ ] Permissions cover all current API actions (socios CRUD, aportes, multas, egresos, reportes, config)
- [ ] Frontend shows/hides UI based on permissions (`usePermission`, `<Can>` component)
- [ ] Rate limiting: 5 req/min on login/register, 10 req/min on password reset
- [ ] Audit log captures: login success/failed, password change, role assignment, permission deny
- [ ] TypeScript strict mode passes; all tests pass (`pnpm test`); typecheck passes (`pnpm typecheck`)
- [ ] Zero high/critical vulnerabilities in `pnpm audit`