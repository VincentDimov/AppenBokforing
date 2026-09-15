# Authentication and organization authorization

## Session model

LedgerApp uses an access token plus an opaque, persisted refresh session.

- Passwords are hashed with Argon2id. The production minimum is 65,536 KiB of
  memory and three iterations; startup refuses weaker production settings.
- Access tokens are short-lived signed JWTs (15 minutes by default). They carry
  a user ID and session ID, and the API checks the backing session on every
  protected request. Revoking a session therefore invalidates an access token
  immediately rather than waiting for JWT expiry.
- Refresh tokens are high-entropy opaque values in the form
  `session-id.secret`. Only an Argon2id hash with a separate refresh-token
  pepper is stored in PostgreSQL.
- A refresh rotates the session. The replaced session is revoked and linked to
  its successor inside one transaction. Reuse of a rotated token revokes every
  active session in that family.
- Logout revokes the active session family and clears both cookies. User deletion
  is the one intentional cascade path for sessions because credentials are
  disposable records.

Cookies are `httpOnly`, `SameSite=Lax`, path-scoped to `/`, and `Secure` in
production. Production uses `__Host-ledgerapp_access` and
`__Host-ledgerapp_refresh`, which prevents a `Domain` attribute from widening
their scope. The browser never receives token values through local storage or a
JSON response.

The Next.js app rewrites `/api/*` to the internal NestJS API origin. This makes
cookies first-party to the browser-facing application origin and avoids placing
tokens in JavaScript. In a container deployment set `API_INTERNAL_URL` to the
API service address.

## API endpoints

| Endpoint              | Authentication            | Behavior                                                             |
| --------------------- | ------------------------- | -------------------------------------------------------------------- |
| `POST /auth/register` | Public, 5/hour            | Creates a normalized email identity and first session.               |
| `POST /auth/login`    | Public, 5/minute          | Verifies credentials and creates a new session.                      |
| `POST /auth/refresh`  | Refresh cookie, 20/minute | Rotates the refresh session and sends replacement cookies.           |
| `POST /auth/logout`   | Public/idempotent         | Revokes the supplied session family when valid, then clears cookies. |
| `GET /auth/me`        | Access token              | Returns the current user.                                            |

The API accepts the access token through its secure cookie or a `Bearer` header
for non-browser clients. Public routes use an explicit `@Public()` decorator;
all other controllers inherit the global access-token guard. Nest throttling
adds a 100 requests/minute default ceiling. Production deployments with multiple
API instances should configure a shared `@nestjs/throttler` storage adapter so
the limits remain global across replicas.

## Organization authorization

`OrganizationMembershipGuard` resolves `:id` against the authenticated user's
membership before organization reads or writes. A non-member receives `404`,
rather than `403`, to avoid using predictable resource behavior as an
organization-ID oracle.

| Role         | Organization settings | Member administration | Account management | Future bookkeeping write | Read bookkeeping |
| ------------ | --------------------- | --------------------- | ------------------ | ------------------------ | ---------------- |
| `OWNER`      | Yes                   | Yes                   | Yes                | Yes                      | Yes              |
| `ADMIN`      | Yes                   | Yes                   | Yes                | Yes                      | Yes              |
| `ACCOUNTANT` | No                    | No                    | Yes                | Yes                      | Yes              |
| `MEMBER`     | No                    | No                    | No                 | No                       | Yes              |
| `READ_ONLY`  | No                    | No                    | No                 | No                       | Yes              |

The current endpoints are intentionally limited to listing, creating, reading,
and updating organizations. Creating an organization creates its `OWNER`
membership and audit event within the same database transaction. Updating an
organization requires `UPDATE_ORGANIZATION`, currently granted only to `OWNER`
and `ADMIN`, and records an immutable audit event.

Account routes use the same tenant-membership principle. `GET /accounts`
requires an `organizationId` query parameter; `GET /accounts/:id` resolves the
account's organization before returning it. `POST /accounts` and
`PATCH /accounts/:id` require `MANAGE_ACCOUNTS`, granted to `OWNER`, `ADMIN`
and `ACCOUNTANT`. A foreign account or organization remains a `404` to a
non-member. There is deliberately no account deletion endpoint: accounting
references use `RESTRICT` foreign keys and accounts are deactivated instead.

## Integration tests

Integration tests require an isolated PostgreSQL database through
`TEST_DATABASE_URL`; they never target the development database. Test setup
uses a lower-cost Argon2id profile only while `NODE_ENV=test` so the security
profile does not make the behavioral suite impractically slow.

The suite verifies unauthenticated rejection, cross-organization isolation,
read-only write denial, owner updates with auditing, and refresh-session
rotation.
