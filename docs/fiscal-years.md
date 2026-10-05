# Fiscal years and period locks

`GET /fiscal-years?organizationId=...` lists years and monthly periods. Owner/admin
can `POST /fiscal-years` with organizationId, name, startDate, endDate (date-only).
Creation is tenant-serialized, rejects overlaps and creates partial first/last
months where needed. The application supports at most 24 monthly periods; this
is an application constraint, not a statement of statutory eligibility.

Owner/admin/accountant can `POST /accounting-periods/:id/lock` or `/unlock`.
Owner/admin can `POST /fiscal-years/:id/close`. All state-change bodies require
`organizationId` and **`confirm: true`**. Closing requires all periods LOCKED and
zero DRAFT entries. CLOSED years cannot reopen in the application.

OPEN/LOCKED periods retain read/report/export access. Locking blocks draft
creation, edits (including moving drafts), posting, corrections dated in the
locked period, confirmed SIE voucher imports and attachment changes. Corrections
of historical vouchers may still be posted into another OPEN period. Opening
balances cannot change once any period in that year is locked.

Calendar row locks and database triggers serialize accounting writes against
locking/closing. The shared year-first lock ordering is used for calendar state
changes. PostgreSQL may reject a deadlocked concurrent transaction; it must not
be considered successful. No accounting records are cascade-deleted.

Period status transitions are audited atomically by the database trigger from
phase 14, using transaction-local actor/request context. Closing writes an
immutable LOCK/FISCAL_YEAR event with OPEN→CLOSED metadata. Repeated requests
that do not change period state do not generate duplicate status-change events.

Run all migrations before enabling the endpoints. PostgreSQL integration tests
cover authenticated POST routes and direct-write bypass attempts; they require
an isolated TEST_DATABASE_URL. Passing tests is not a regulatory compliance claim.
