# MFA retirement — verification, 2026-10-13

MFA enrollment, TOTP/recovery-code verification and step-up have been removed at
the operator's explicit request, including platform administration. This lowers
protection against stolen passwords; it does not imply regulatory compliance.

## Verified checks

- Root lint, typecheck and unit/schema tests: PASS (314 tests).
- PostgreSQL integration tests: 23 suites, 208 tests PASS.
- Full Chromium browser flow: 47 tests PASS, including initial admin password
  change, subsequent login directly to the overview, password-only settings,
  role/tenant boundaries and logout to the public homepage.
- API and Next.js production builds: PASS.
- Neon migration automation and isolated E2E safety contracts: 14 tests PASS.

Integration/browser tests used isolated loopback test databases and disposable
object storage, never the normal local database or production accounting data.
Windows Prisma generation must finish before starting another process using its
native query engine; an overlapping build hit a DLL lock and passed on sequential
retry without changing application behavior.

## Database verification

Migration `20261012170000_remove_mfa_requirement` was exercised on a copy of the
production Neon branch before production execution. Local and production databases
now have 26 successful migrations, no mandatory-MFA constraint and zero grants
with `mfa_required=true`.

Private custom-format `pg_dump` backups were created immediately before both
updates and their archives were validated with `pg_restore --list`. PostgreSQL 18
was used for the Neon server. Backups are ignored under `.local-artifacts/backups`;
no credentials or personal data belong in this report or Git.

All public-table row fingerprints were compared before/after each update, excluding
only the deliberately changed `mfa_required` property on platform grants. No other
row changed. Roles, password-change requirements, password hashes, sessions,
memberships, accounting records, encrypted legacy MFA credentials and immutable
audit evidence were retained. Historical security events remain readable.

## Deployment and rollback policy

Publish through the existing `master` Git integration for Render/Vercel. The Neon
CI migration remains gated on all existing verification jobs and is idempotent
after this authorized operator execution. Confirm the deployed commit and public
API behavior separately; local tests alone are not deployment evidence.

Do not delete legacy credentials/audit, overwrite passwords, clear initial
password-change flags or recreate bootstrap to recover access. Reintroducing MFA
would require a reviewed code/schema rollback and enrollment/recovery policy;
merely switching an old boolean back on does not implement authentication.
