# Platform administration security

The principal boundary is platform metadata versus tenant accounting. Every global
endpoint uses authenticated active sessions and persisted active grants. Company
OWNER/ADMIN is not a platform administrator. Unknown roles fail closed. Normal
accounting controllers retain tenant checks, period locks, immutable posted values,
voucher-number transactions, Decimal arithmetic and evidence retention.

## Current authentication policy — 2026-10-12

MFA is removed application-wide at the operator's explicit request. There is no
enrollment, verification, recovery-code or MFA step-up route or UI. Administration
requires an authenticated, non-revoked, unexpired persisted session, an active
user/grant and the appropriate current platform role. The initial password-change
requirement remains. Both guards and mutation transactions recheck authorization.

First privileged login: change initial password → all sessions revoked → new login
→ overview. Subsequent password changes still require the caller's current password
and active session, revoke all sessions and append PASSWORD_CHANGED evidence.
Passwords use Argon2id; privileged/temporary passwords require 14–128 characters,
upper/lowercase and a digit. Passwords never appear in audit or profile DTOs.
Authentication, cookie/origin checks, refresh rotation and rate limits remain.
Password/grant/status changes retain database- and service-level session revocation.

Removing MFA reduces protection against stolen passwords. Do not describe this
password-only policy as equivalent to MFA or regulatory compliance.

Migration 26 (`20261012170000_remove_mfa_requirement`) changes the legacy
`mfa_required` default and existing grant flags to false and drops the mandatory
true constraint. It does not change roles, password hashes/change flags, sessions,
membership, bookkeeping or audit. Credential/recovery tables and session approval
timestamps are retained for historical data compatibility, never consulted or
exposed by current APIs. Refresh does not copy old approval timestamps.
The legacy crypto helper remains only to validate retained ciphertext in tests;
it is not part of authentication. Existing key material may be retained separately
for old backups; it is no longer required by the application.

## Rate limits and concurrency

Authentication and password-change endpoints remain rate-limited. Global metadata
controllers retain bounded request rates. PostgreSQL advisory/session locks still
serialize privileged password/grant changes and the last-active-superadministrator
invariant. Revoked, expired and foreign sessions cannot perform admin mutations.
The retired MFA-specific attempt limiter is removed along with those endpoints.

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
