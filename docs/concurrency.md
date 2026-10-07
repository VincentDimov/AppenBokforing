# Concurrency contract and threat model (FAS 22)

## FAS 24 evidence update

12 real PG concurrency cases now pass (subset of 94 PG integration tests),
including two distinct members reversing, three iterations of reverse/period
lock and three import/period-lock iterations with counter/no-partial-row checks.
Standalone real S3/PG drill adds upload/post, upload/lock and upload/calendar-move:
real PUT completes, state changes, upload rejects with 409 and new object cleanup
plus zero attachment/audit rows are verified. No in-memory storage race mock.
Fiscal-close combinations, concurrent separate-tenant counters and deliberately
induced transient retry failures remain untested, so P0-11 stays PARTIAL.
Earlier FAS 22 counts below are historical. [Full evidence](fas24-release-gate.md).

Implementation plan recorded before the concurrency changes. Accounting values
must never be merged or overwritten on behalf of a stale editor.

| Race                     | Required outcome                                                    |
| ------------------------ | ------------------------------------------------------------------- |
| Two draft saves          | One version advances; stale writer receives 409                     |
| Save / post              | Posting requires the exact reviewed version; no newer values posted |
| Same draft posted twice  | One POSTED transition, one number, one POST audit                   |
| Two reversals            | One correction, immutable original and one REVERSE audit            |
| Posting / period lock    | Calendar row lock orders operations; loser cannot bypass lock       |
| Import / local posting   | Same calendar/series locks; counter is a monotone maximum           |
| Import / year closure    | Entire import commits before closure or is rejected/rolled back     |
| Different tenants/series | No shared numbering; unique tenant/year/series/number identity      |

Read responses expose integer `version` (initially 1). PATCH and POST require
`expectedVersion`; successful mutations advance it. Stale writes return HTTP
409 `JOURNAL_ENTRY_VERSION_CONFLICT`. UI retains local values and offers explicit
reload/discard; it does not silently retry a stale save or merge accounting rows.

Acquire calendar locks before entry and series locks; changing year locks both
years in sorted UUID order. Serialization/deadlock retries are bounded and only
for PostgreSQL 40001/40P01 (Prisma P2034). Business conflicts are never retried.
No network/storage calls inside accounting transactions.

Idempotency: POST is an atomic state transition, reversal has a tenant-scoped
unique original link, and import is protected by voucher identity and preview
fingerprint. Retries may return a clear 409 rather than repeating committed
effects. No separate client idempotency-key API is claimed.

Real PostgreSQL evidence: nine race tests pass, including 20 simultaneous posts,
two saves/posts/reversals, save versus post, independent series, period lock and
SIE import/manual counter race. The full suite has 86 passing tests. Browser E2E
uses two independent contexts: stale save/post receives 409, local input survives,
and only explicit reload adopts the current version. All 13 browser tests pass.

Successful accounting audit includes actor, entity, action, timestamp and request
ID. Failed 409 attempts do not create accounting audit events; production HTTP
metadata logs distinguish the attempts without storing submitted accounting data.
Correction retries are bounded to three known transient attempts; no universal
retry/merge policy or idempotency-key endpoint is promised.

Remaining validation: cross-tenant simultaneous numbering, import versus fiscal
closure, and deliberately induced 40001/40P01 retry fixtures are not yet covered
by dedicated concurrent tests. P0-11 is PARTIAL against the full threat matrix,
although the nine implemented races and optimistic locking are demonstrated.
