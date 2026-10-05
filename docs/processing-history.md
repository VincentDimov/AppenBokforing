# Processing history

`GET /audit-events?organizationId=UUID` requires authentication and organization
membership with READ_BOOKKEEPING permission. All organization roles can read
their organization's history. There are no POST, PUT, PATCH or DELETE routes.
The existing PostgreSQL append-only trigger additionally rejects audit updates
and deletes. Failed operations roll back their audit rows with their transaction.

Filters: `fromDate`, `toDate` (inclusive UTC calendar dates), `user` (actor UUID),
`action`, `entityType`, and `page` (50 rows per page, newest first with UUID tie
breaker). The API exposes `createdAt` as `timestamp`, with actor display name,
entity identifiers, requestId and metadata. It omits before/after snapshots and
IP addresses. No passwords, tokens or complete SIE contents belong in metadata.

Existing service transactions record organization creation/updates, account
changes, voucher creation/posting/reversal and attachment uploads. Confirmed SIE
imports now record imported voucher creation/posting and a summary IMPORT event
atomically. SIE exports record a completed export job and EXPORT event before
returning content; this proves generation, not successful download by the client.
SIE previews create no events because they commit nothing.

Database triggers record fiscal-year creation, period locking/unlocking and
membership creation/role changes. They accept optional transaction-local
`ledgerapp.actor_user_id` and `ledgerapp.request_id` settings. Direct administrative
writes without context show a null actor (system/unknown); the affected user is
never assumed to be the actor. Audit INSERTs lacking a request ID receive a new
correlation UUID; existing historical rows are left untouched.

An invitation workflow does not yet exist in LedgerApp. Membership creation is
recorded as USER_ADDED, not falsely represented as an invitation being sent.
When invitations are implemented, record their creation in the same transaction
as the invitation with event metadata USER_INVITED and the authenticated actor.

The frontend is `/settings/processing-history` with the workspace alias
`/app/settings/processing-history`. It provides date, user, action and entity
filters, expandable metadata and pagination. It offers no mutation controls.
