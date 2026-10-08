# Secure operator bootstrap

**Mechanism implemented; the actual intended local/cloud Master Admin account has
not been created by this implementation.** All privileged accounts used in gates
are synthetic fixtures in isolated loopback test databases. Initial email
`admin@admin.com` is supported as configuration, never interpreted as authority.
The initial password supplied separately is never included in this repository.

## Authorized execution

1. Back up the intended database and verify its host/name privately. Apply migration
   24 using the migration principal, not the application's runtime principal.
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
6. Configure a separately protected 32-byte MFA encryption key and stable key-ID
   for the API, never for Next.js. Login, change the initial password, login again,
   enroll MFA and save recovery codes safely before entering admin data.

The explicit `--authorize` AND environment enablement are required. Normal app
startup, deployment, registration, migrations and seeds never run bootstrap.
An advisory transaction lock plus immutable singleton marker make repeat execution
idempotent; concurrent callers cannot create two bootstrap administrators. An
already-existing email is refused, even if it is an ordinary admin@admin.com account.
Any prior platform grant also refuses unmarked bootstrap. There is no overwrite,
silent privilege upgrade, password reset or organization membership side effect.

## Recovery and operator decisions

Do not delete the marker or alter immutable audit to rerun bootstrap. Ordinary
administrators use password + single-use recovery proof; loss of both password and
proof requires a separately reviewed identity-verification/operator procedure.
Newly granted/reactivated global accounts require password change and MFA. Last
active SUPER_ADMIN cannot be disabled, downgraded, suspended or deleted through
normal APIs or direct SQL while guards are enabled.

Before cloud activation verify ICU support, existing extensions, migration backup,
runtime privileges, TLS/origin/cookies, MFA key backups, remote CI and a tested
operator recovery path. No local PASS certifies the hosted deployment.
