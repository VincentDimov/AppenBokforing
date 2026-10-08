# FAS 36 – Master Admin & Platform Administration

Global administration is a separate NestJS domain and Next.js workspace, not a
company role. `/auth/me` exposes capabilities from persisted active grants; email,
JWT claims, client state and organization OWNER/ADMIN never confer global access.
The ordinary sidebar shows **Admin immediately below Översikt** only to globally
authorized users. `/admin` has its own navigation, drawer, collapse control and
back link. A global administrator without companies sees real platform counts in
the normal overview, not onboarding or mock accounting. Logout returns home.

## Permissions

| Persisted platform role | Metadata read | User/company/membership write | Global role grants |
| ----------------------- | ------------- | ----------------------------- | ------------------ |
| SUPER_ADMIN             | Yes           | Yes                           | Yes                |
| PLATFORM_ADMIN          | Yes           | Yes                           | No                 |
| SUPPORT_ADMIN           | Yes           | No                            | No                 |
| PLATFORM_VIEWER         | Yes           | No                            | No                 |

All require first password change and verified MFA. READ expires after 12 hours;
WRITE/GRANTS require password-and-MFA step-up within five minutes. Roles are
rechecked with the current database session on every request and inside write
transactions. Neither role gives implicit organization membership or access to
financial amounts, report contents, SIE files, attachment keys or downloads.

## Database

Migration `20261008200000_platform_administration` is forward-only migration 24.
It adds PlatformAdministrator, PlatformAdminMfaCredential,
PlatformAdminRecoveryCode, PlatformAdminAuditEvent and PlatformAdminBootstrap.
Domain identities are UUIDs; the bootstrap marker intentionally uses singleton
integer key 1 to serialize the one-time operation. User status/notes/password-change
and Session.adminMfaVerifiedAt extend existing models. Referential deletion is
RESTRICT; no accounting deletion or financial cascade is introduced.

Swedish ICU collation `ledgerapp_admin_sv`, UUID tie-breakers, search/status and
membership indexes support stable parameterized server-side lists. Prerequisites
include ICU PostgreSQL and the existing pg_trgm/btree_gist migration requirements.
Old migrations and accounting snapshots remain unchanged. Database triggers
protect immutable audit/bootstrap evidence, the last active SUPER_ADMIN, credential
and grant session revocation, and inactive-company financial writes.

## Functional workspace

- Overview: actual counts, date presets/custom interval, daily registrations,
  countries, company roles, SIE statuses and latest global audit.
- Users: names/emails, company memberships/roles, account/platform status,
  creation/last-login dates, profile links/actions; name/email/company search,
  Swedish A–Ö/Ö–A and whitelisted sorting, company/role/status/date filters.
- User profile: persisted name/admin notes, safe status changes, session details
  and revocation, temporary password for non-admin accounts with mandatory change,
  membership add/change/soft removal/restore, invitation and audit history.
- Companies: name/number/address/country/member count/status/timestamps;
  server-side search/filter/sort. Profiles show paged members, latest 25 fiscal
  years with lock metadata, up to 100 series and voucher counts, never amounts.
  Metadata editing, explicit ownership transfer and reversible deactivation are
  transactional and audited. Identity changes are blocked after posting/IB.
- Global administrators: actual grants, role/activation changes by SUPER_ADMIN;
  current sessions invalidated and security setup required for newly granted users.
- Invitations: actual states, safe revocation, no token disclosure or fake resend.
- Sessions/security: masked IP/device metadata, active/pending/inactive grants,
  failed attempts, credential/role history, configuration warnings.
- Audit: append-only filters for actor, affected user, company, action, result,
  target type and dates; CSV explicitly exports only the displayed bounded page
  and escapes spreadsheet formula prefixes.
- Usage: actual SQL counts and attachment metadata byte sums, not an object-store
  inventory or billing system. System checks run SELECT 1, applied/failed migration
  queries and schema compatibility; CPU, uptime and storage remain explicitly
  unprobed. Jobs show bounded SIE status metadata, not contents/retry controls.

All lists are paged: 10/25/50/100 rows, at most 200 pages; larger datasets require
filters. Requests are abortable and stale responses are ignored. Loading, empty,
validation, unavailable delivery, denied access and retry states are explicit.
UUID pickers intentionally require an explicit existing user; there is no automatic
privileged membership creation. Company fiscal-year changes use the existing
tenant workspace and its ordinary membership/period permissions.

## API contract

All following paths have prefix `/platform-admin`; NONE are public:

| Method            | Paths                                                                                                                                                                                        | Permission                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| GET               | dashboard, users, users/:id, users/:id/memberships, organizations, organizations/:id, organizations/:id/members, administrators, invitations, sessions, audit, security, usage, system, jobs | READ                                                |
| POST              | users, organizations                                                                                                                                                                         | WRITE                                               |
| PATCH             | users/:id, organizations/:id                                                                                                                                                                 | WRITE                                               |
| POST              | users/:id/status, suspend, reactivate, revoke-sessions, sessions/:sessionId/revoke, temporary-password, require-password-change, password-reset                                              | WRITE; suffixes are under users/:id                 |
| POST/PATCH/DELETE | users/:id/memberships; PATCH/DELETE add /:membershipId                                                                                                                                       | WRITE; removal is soft                              |
| POST              | organizations/:id/deactivate, reactivate, transfer-owner                                                                                                                                     | WRITE; suffixes are under organizations/:id         |
| POST              | administrators                                                                                                                                                                               | GRANTS                                              |
| POST              | invitations/:id/revoke                                                                                                                                                                       | WRITE                                               |
| GET               | security-setup/status                                                                                                                                                                        | Authenticated own active global grant               |
| POST              | security-setup/enroll, verify, recover                                                                                                                                                       | Authenticated own grant/session and own credentials |

`POST /auth/password` changes only the caller's password and clears cookies.
Strict DTOs forbid extra properties; identifiers, list limits and sort whitelist
are validated. Destructive/security actions require exact target confirmation.
Global audit has no update/delete endpoint. No admin accounting-edit API exists.

## Deliberately unavailable

Email reset/resend and email ownership changes fail closed until a reviewed delivery,
verification and recovery adapter exists. Admin temporary-password override is
blocked; MFA recovery needs the caller's current password and unused recovery code.
No fake billing, support tickets, uptime provider or external metrics are added.
See [security](platform-admin-security.md), [bootstrap](platform-admin-bootstrap.md)
and [verification/release report](fas36-release-gate.md).
