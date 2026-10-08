# Platform administration security

The principal boundary is platform metadata versus tenant accounting. Every global
endpoint uses authenticated active sessions and persisted active grants. Company
OWNER/ADMIN is not a platform administrator. Unknown roles fail closed. Normal
accounting controllers retain tenant checks, period locks, immutable posted values,
voucher-number transactions, Decimal arithmetic and evidence retention.

## Credentials, MFA and sessions

Passwords and recovery codes use Argon2id and existing environment-validated policy.
Privileged/temporary passwords require 14–128 characters, upper/lowercase and a
digit; passwords never appear in audit, URLs or list/profile DTOs. The bootstrap
password is input only from operator environment and is never seeded or committed.

First login: password change → revoke all sessions → new login → own TOTP enrollment
→ verify current password and TOTP → save ten recovery codes once → overview.
TOTP uses the OTPAuth library (SHA1, six digits, 30-second interval, ±one window),
monotonic counters reject replay. Enrollment requires a fresh active session and
expires after ten minutes. Previously verified MFA is not silently overwritten.

MFA secrets are encrypted using AES-256-GCM with random 12-byte IV, authenticated
tag and user/key-ID associated data. `PLATFORM_ADMIN_MFA_ENCRYPTION_KEY` must be
canonical base64 for exactly 32 random bytes; `PLATFORM_ADMIN_MFA_KEY_ID` identifies
the active key (default v1). Missing/mismatching keys fail closed. Never put this
key in NEXT_PUBLIC variables, browser builds or repository files. Keep encrypted
database backups and the key in separate access-controlled recovery systems.
Key rotation needs a reviewed re-encryption/re-enrollment runbook; replacing the
key or key-ID without migrating ciphertext will lock out administrators.

MFA approval belongs to a persisted session; refresh rotation copies the original
approval time instead of resetting its age. Read access expires after 12 hours,
sensitive mutations after five minutes. Password/grant/status changes revoke
sessions at both service and database levels. Mutation transactions lock the
current session and revalidate permissions. No long-lived unchecked admin JWT
or email superuser shortcut exists.

Recovery requires the caller's active session, current password and one unused
128-bit recovery code. Only hashes are retained. Recovery consumes the entire code
set, invalidates MFA, requires password change and revokes every session. Lost
password PLUS lost recovery proof cannot be safely solved by this UI: identity
proof/operator recovery remains an explicit release blocker, not a password override.

## Rate limits and concurrency

Existing authentication/origin/cookie/refresh protections remain active. Global
controllers add bounded request rates; enrollment/verification/recovery use five
requests per minute. Persisted failed MFA/recovery attempts impose five failures
per actor per rolling 15 minutes. Failure evidence is committed before the error
is returned. A PostgreSQL transaction advisory lock serializes privileged security
mutations and the last-active-superadministrator invariant. Concurrent eight-attempt
and concurrent last-super-revocation tests exercise actual PostgreSQL, not mocks.
The coarse global lock is intentionally conservative: high-volume scaling and a
separate distributed authentication limiter need reviewed performance work.

## Evidence, least privilege and retention

PlatformAdminAuditEvent stores actor, action, target type/ID, optional organization,
safe before/after metadata, result, request ID, masked IP and timestamp. Database
triggers reject UPDATE/DELETE/TRUNCATE of audit/bootstrap history. Normal APIs offer
no modification route. Failed admin logins and denied access are also persisted;
never log password/token/MFA secret/recovery code/SIE contents or financial amounts.
Some pre-existing events have no request metadata; do not fabricate missing history.

`ops/database-runtime-role.sql` grants explicit runtime rights, audit SELECT/INSERT,
bootstrap SELECT only and no schema ownership. The operator/migrator principal must
be separate. Database owner/superuser can disable triggers: local append-only guards
are not independent external tamper evidence. Retention, external log replication,
privacy access policy and disaster-recovery key custody need deployment review.

Inactive organizations retain all accounting and attachments. Tenant guards reject
access and database triggers reject financial writes, locking organization state
against concurrent changes. Platform metadata maintenance never unlocks periods or
allows historical journal edits. Ownership transfer is explicit and atomic; the
last owner cannot be casually removed. No accounting records are cascade-deleted.

## Deployment limitations

New migration, runtime GRANTs, protected secrets, same-origin Next API proxy/cookie
and origin settings, HTTPS, a backup, and coordinated API/web versions are required.
The local tests do not prove hosted key custody, provider IAM, SMTP identity proof,
external tamper evidence, load budgets, regulatory compliance or cloud readiness.
Initial privileged account creation is an explicit operator action, not startup,
build, migration or development seed behavior. See [bootstrap](platform-admin-bootstrap.md).
