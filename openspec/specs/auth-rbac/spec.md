# Auth RBAC Specification

## Purpose

Secure, maintainable Role-Based Access Control system with JWT authentication, password hashing, session management, and fine-grained permission guards for all OTB API resources.

## Requirements

### Requirement: User Registration

The system MUST allow new users to register with email, password, and name. Passwords MUST be hashed with Argon2id. Email MUST be unique (case-insensitive). Email format MUST be validated.

#### Scenario: Successful registration

- GIVEN no user exists with email "admin@otb.com"
- WHEN POST /api/auth/register { email, password, name }
- THEN the response SHALL be 201 with { user: { id, email, name, role } }
- AND a verification email SHALL be queued

#### Scenario: Duplicate email rejected

- GIVEN a user exists with email "admin@otb.com"
- WHEN POST /api/auth/register with same email
- THEN the response SHALL be 409 with error "Email already registered"

#### Scenario: Weak password rejected

- GIVEN the minimum password length is 8 characters
- WHEN POST /api/auth/register with password "123"
- THEN the response SHALL be 400 with error "Password too short"

### Requirement: User Login

The system MUST issue JWT access tokens (15min expiry) and refresh tokens (7 days, httpOnly cookie, rotation) on valid credentials.

#### Scenario: Successful login

- GIVEN a user exists with email "admin@otb.com" and valid password
- WHEN POST /api/auth/login { email, password }
- THEN the response SHALL set httpOnly cookie with refresh token
- AND return { accessToken, user: { id, email, name, role } }

#### Scenario: Invalid credentials rejected

- WHEN POST /api/auth/login { email, password: "wrong" }
- THEN the response SHALL be 401 with error "Invalid credentials"
- AND the failed attempt SHALL be logged

#### Scenario: Rate limiting on login

- WHEN 5 failed login attempts occur within 1 minute
- THEN subsequent attempts SHALL be 429 Too Many Requests

### Requirement: Token Refresh

The system MUST rotate refresh tokens with reuse detection. Old tokens MUST be invalidated after rotation. Token families MUST be tracked for reuse detection.

#### Scenario: Successful token refresh

- GIVEN a valid refresh token exists
- WHEN POST /api/auth/refresh
- THEN the response SHALL set a new httpOnly cookie with rotated refresh token
- AND return a new { accessToken }

#### Scenario: Refresh token reuse detected

- GIVEN a refresh token was already used (rotation)
- WHEN POST /api/auth/refresh with the old token
- THEN the response SHALL be 401
- AND ALL tokens in the family SHALL be invalidated

#### Scenario: Expired refresh token rejected

- WHEN POST /api/auth/refresh with expired token
- THEN the response SHALL be 401 with error "Invalid refresh token"

### Requirement: Logout

The system MUST invalidate the current refresh token on logout. The httpOnly cookie MUST be cleared.

#### Scenario: Successful logout

- WHEN POST /api/auth/logout (with valid refresh cookie)
- THEN the response SHALL clear the refresh cookie
- AND the refresh token SHALL be invalidated

### Requirement: Password Reset

The system MUST send a password reset email with a time-limited token (1 hour expiry). The token MUST be single-use.

#### Scenario: Password reset request

- GIVEN a user exists with email "admin@otb.com"
- WHEN POST /api/auth/forgot-password { email }
- THEN the response SHALL always be 200 (no user enumeration)
- AND a reset email SHALL be queued if the user exists

#### Scenario: Password reset with valid token

- WHEN POST /api/auth/reset-password { token, newPassword }
- THEN the response SHALL be 200
- AND the user's password SHALL be updated
- AND the reset token SHALL be invalidated

#### Scenario: Expired reset token rejected

- WHEN POST /api/auth/reset-password with expired token
- THEN the response SHALL be 400 with error "Token expired"

### Requirement: Authenticated User Profile

The system MUST return the current user's profile on GET /api/auth/me with role and permissions.

#### Scenario: Get current user

- GIVEN a user is authenticated with a valid access token
- WHEN GET /api/auth/me
- THEN the response SHALL be 200 with { user: { id, email, name, role, permissions[] } }

#### Scenario: Unauthenticated request rejected

- WHEN GET /api/auth/me (no token)
- THEN the response SHALL be 401 with error "Unauthorized"

### Requirement: RBAC Permission Model

The system MUST enforce permissions on all API routes using resource:action pairs. Roles (admin, tesorero, secretario, vocal, socio) MUST be assignable to users. Permissions MUST be assignable to roles.

#### Scenario: Admin has all permissions

- GIVEN a user with role "admin"
- WHEN accessing any API route
- THEN the request SHALL be allowed

#### Scenario: Socio can only access own data

- GIVEN a user with role "socio" and user id "u123"
- WHEN GET /api/socios/u123
- THEN the request SHALL be allowed

#### Scenario: Socio cannot access other users' data

- GIVEN a user with role "socio" and user id "u123"
- WHEN GET /api/socios/u456
- THEN the response SHALL be 403 Forbidden

#### Scenario: Permission denied for missing permission

- GIVEN a user with role "socio" (no "socios:create" permission)
- WHEN POST /api/socios
- THEN the response SHALL be 403 Forbidden

### Requirement: Permission Seeds

The system MUST seed default roles and permissions on migration. Permissions MUST cover all existing API actions.

#### Scenario: Default roles exist

- GIVEN the migration runs
- THEN roles "admin", "tesorero", "secretario", "vocal", "socio" SHALL exist

#### Scenario: Default permissions exist

- GIVEN the migration runs
- THEN permissions for all API resources SHALL exist: socios, aportes, multas, egresos, reportes, config, usuarios, roles, permisos

### Requirement: Audit Logging

The system MUST log all authentication and authorization events. Logs MUST include user id, action, resource, timestamp, and outcome.

#### Scenario: Login success logged

- WHEN a successful login occurs
- THEN an audit log entry SHALL be created with { action: "login", outcome: "success" }

#### Scenario: Permission denied logged

- WHEN a 403 Forbidden response is returned
- THEN an audit log entry SHALL be created with { action: "access_denied", resource, outcome: "denied" }

### Requirement: Password Change

The system MUST allow authenticated users to change their password. Current password MUST be verified first.

#### Scenario: Successful password change

- GIVEN a user is authenticated
- WHEN POST /api/auth/change-password { currentPassword, newPassword }
- THEN the response SHALL be 200
- AND the user's password SHALL be updated

#### Scenario: Wrong current password rejected

- WHEN POST /api/auth/change-password { currentPassword: "wrong", newPassword }
- THEN the response SHALL be 400 with error "Current password is incorrect"
