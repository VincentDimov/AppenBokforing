# Members and invitations — FAS 26

Every organization route verifies current, non-removed membership. Membership
removal is soft: user, journals, foreign keys and audit history survive. All
account/journal access paths and nested guards now exclude removed memberships.
Already-issued signed storage URLs are bounded bearer credentials until expiry;
membership removal denies new access/signing, not retrospective URL revocation.

| Operation                                                 | OWNER | ADMIN | ACCOUNTANT | MEMBER | READ_ONLY |
| --------------------------------------------------------- | ----- | ----- | ---------- | ------ | --------- |
| Read organization/registers/reports                       | Yes   | Yes   | Yes        | Yes    | Yes       |
| Organization settings / default series                    | Yes   | Yes   | No         | No     | No        |
| Invite/revoke/member role/remove                          | Yes   | Yes   | No         | No     | No        |
| Manage accounts, series, dimensions, IB, carry-forward    | Yes   | Yes   | Yes        | No     | No        |
| Post/reverse / period lock/unlock                         | Yes   | Yes   | Yes        | No     | No        |
| Fiscal year create/close                                  | Yes   | Yes   | No         | No     | No        |
| Read-only SIE export (existing READ_BOOKKEEPING contract) | Yes   | Yes   | Yes        | Yes    | Yes       |
| Explicit ownership transfer                               | Yes   | No    | No         | No     | No        |

ADMIN cannot remove/change OWNER. No invite or generic role PATCH can promote
OWNER. Explicit transfer promotes another active member and demotes the actor
to ADMIN atomically. Organization-row serialization and a deferred database
constraint ensure at least one active OWNER survives concurrent changes and
direct database membership writes.

Endpoints:

- `GET /organizations/:id/members` (safe member and invitation status DTOs).
- `POST /organizations/:id/invitations` (email, non-OWNER role).
- `DELETE /organizations/:id/invitations/:invitationId` (revoke, not hard-delete).
- `PATCH /organizations/:id/members/:memberId` (role).
- `DELETE /organizations/:id/members/:memberId` (soft remove).
- `POST /organizations/:id/transfer-ownership` (memberId).
- `POST /invitations/accept` (authenticated email-bound token).

Tokens contain 32 cryptographically random bytes, expire after seven days and
are stored only as SHA-256 hashes. Acceptance checks authenticated email, tenant
activity, expiry, revocation and consumption under the same org lock. Resend
revokes predecessors; partial uniqueness admits one pending org/email invite.
Concurrent accept/accept or accept/revoke cannot consume twice. Normal API
responses, audits and member lists exclude token hashes/passwords/session data.
Explicit development/test delivery returns a fragment URL; tokens never enter
the URL query or server request path, JWT or persistent browser storage.

`InvitationDelivery` is a provider boundary. Production creation returns
`INVITATION_DELIVERY_UNAVAILABLE` until a reviewed real mail adapter is installed.
There is no pretend emailed-success response. A reliable production adapter also
needs retry/outbox, provider-secret provisioning and delivery monitoring.
Authenticated email matching currently relies on existing account identity;
verified-email infrastructure is a separate production requirement.

UI: `/settings/members` (`/settings/users` alias) and `/invitations/accept`.
Last-owner, expiry, already-used/revoked and wrong-email failures are explicit.
Security policy, cookie/CSRF/rate-limit settings remain authoritative. Concurrent
refresh rotations/revocations now lock a credential family and re-read before
creating the child; contention has a bounded 10-second transaction budget.
