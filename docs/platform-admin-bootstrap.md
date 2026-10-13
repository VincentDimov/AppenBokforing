# Secure operator bootstrap

Bootstrap is an explicit operator action, not automatic startup behavior. The
initial email `admin@admin.com` is supported as configuration, never interpreted
as authority. Passwords must never be included in this repository.

## Authorized execution

1. Back up the intended database and verify its host/name privately. Apply migrations
   using the migration principal, not the application's runtime principal.
2. Install dependencies with the pinned package manager and build DB/API packages.
3. Supply `DATABASE_URL`, `MASTER_ADMIN_BOOTSTRAP_EMAIL`,
   `MASTER_ADMIN_BOOTSTRAP_PASSWORD`, and `MASTER_ADMIN_BOOTSTRAP_ENABLED=true`
   through protected operator environment/secret tooling. Validate production
   Argon2 policy. Do not put the password in command-line arguments, screenshots,
   logs, shell history, `.env.example`, source code, migrations or seed data.
4. Execute `corepack pnpm@9.15.4 admin:bootstrap --authorize` once from the repo root.
   It outputs only CREATED/ALREADY_COMPLETED or a sanitized configuration failure.
5. Remove bootstrap enablement/password from deployed runtime configuration and
   operator process environment. Give the API only the least-privilege runtime DB
   login. The runtime role cannot create bootstrap markers.
6. Login, change the initial password and login again before entering admin data.
   MFA is removed; enrollment, codes and server MFA configuration are not required.

The explicit `--authorize` AND environment enablement are required. Normal app
startup, deployment, registration, migrations and seeds never run bootstrap.
An advisory transaction lock plus immutable singleton marker make repeat execution
idempotent; concurrent callers cannot create two bootstrap administrators. An
already-existing email is refused, even if it is an ordinary admin@admin.com account.
Any prior platform grant also refuses unmarked bootstrap. There is no overwrite,
silent privilege upgrade, password reset or organization membership side effect.

## Recovery and operator decisions

Do not delete the marker or alter immutable audit to rerun bootstrap. Ordinary
password recovery requires a separately reviewed identity-verification/operator procedure.
Newly granted/reactivated global accounts require password change. Last
active SUPER_ADMIN cannot be disabled, downgraded, suspended or deleted through
normal APIs or direct SQL while guards are enabled.

Before cloud activation verify ICU support, existing extensions, migration backup,
runtime privileges, TLS/origin/cookies, remote CI and a tested
operator recovery path. No local PASS certifies the hosted deployment.
