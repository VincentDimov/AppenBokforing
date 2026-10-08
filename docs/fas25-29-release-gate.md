# FAS 25–29 — implementation and local release report

2026-10-07. This report separates the new working tree from the successful,
committed FAS 24 remote baseline. Passing these gates is not approval for real
Swedish bookkeeping, tax declarations, legal compliance or SIE certification.

## 1. Commit and working tree

HEAD/master remains `96f131e8def14831b2f4000666d35584087fe242`.
New FAS 25–29 changes are local, uncommitted, unpushed and undeployed.
The pre-existing untracked `faser.md` was preserved. No production data,
credentials, infrastructure or application state was changed. No FAS 30 work.
The historical baseline has all three jobs SUCCESS in
[run 37679581119](https://github.com/VincentDimov/AppenBokforing/actions/runs/37679581119)
and its Vercel production deployment is READY. This is not remote CI for this patch.

## 2. FAS 25 — company setup and settings

Real atomic, retry-safe organization/OWNER/calendar/series/starter creation;
normalized non-globally-unique organization number; safe company settings,
identity restrictions and active organization integration. The top bar now uses
real tenant fiscal years. [Full onboarding contract](onboarding.md).

## 3. FAS 26 — invitations and permissions

One existing role system; hashed, expiring, email-bound single-use invitations;
resend/revoke, soft membership removal, concurrent last-owner protection and
explicit ownership transfer. Existing/new users can accept through the browser.
Development/test delivery abstraction, not invented production email.
[Security and exact role rules](members-and-permissions.md).

## 4. FAS 27 — managed series

Tenant/year series CRUD without destructive deletion or manual counters;
usage/next-number display, stable used codes, active status, configurable default
and retained transactional allocator. [Series contract](voucher-series.md).

## 5. FAS 28 — IB and carry-forward

Whole-set balanced IB editor with optimistic fingerprint, calendar/account locks
and direct DB protection. Explicit preview/confirm transfer to the next unused
year and selected equity account; Golden report reconciliation.
[Accounting contract](opening-balances-and-carry-forward.md).

## 6. FAS 29 — projects and cost centres

Real tenant registers, search/edit/deactivate, keyboard voucher typeaheads,
active-reference checks and frozen posted JSON labels preserved by reversals.
Historical inactive objects remain visible; no invented dimensional IB.
[Snapshots and SIE boundaries](dimensions.md).

## 7. Forward-only migrations

Five new migrations, total 19. No already-applied SQL was edited:

- `20261007160000_organization_onboarding`
- `20261007170000_members_and_invitations`
- `20261007180000_voucher_series_management`
- `20261007190000_opening_balance_carry_forward`
- `20261007200000_dimension_management_and_snapshots`

New invitation/carry relations use tenant-aware constraints and restrictive
foreign keys. Accounting is not cascade-deleted. Used identity/classification,
last-owner, IB freeze and snapshot guards remain database-authoritative.
Reapply reviewed runtime grants after migration; use a separate migrator login.

## 8. API endpoints

Existing organization PATCH gains safe settings/default-series fields. New APIs:

| Method         | Path                                                         |
| -------------- | ------------------------------------------------------------ |
| POST           | `/onboarding`                                                |
| GET            | `/organizations/:id/members`                                 |
| POST           | `/organizations/:id/invitations`                             |
| DELETE         | `/organizations/:id/invitations/:invitationId` (revoke)      |
| PATCH / DELETE | `/organizations/:id/members/:memberId` (role / soft removal) |
| POST           | `/organizations/:id/transfer-ownership`                      |
| POST           | `/invitations/accept`                                        |
| GET / POST     | `/organizations/:id/voucher-series`                          |
| PATCH          | `/organizations/:id/voucher-series/:seriesId`                |
| GET / POST     | `/organizations/:id/opening-balances`                        |
| POST           | `/organizations/:id/carry-forward/preview`                   |
| POST           | `/organizations/:id/carry-forward/confirm`                   |
| GET / POST     | `/organizations/:id/projects`                                |
| PATCH          | `/organizations/:id/projects/:dimensionId`                   |
| GET / POST     | `/organizations/:id/cost-centers`                            |
| PATCH          | `/organizations/:id/cost-centers/:dimensionId`               |

Protected routes check current non-removed tenant membership. Foreign resource
identity is not disclosed (existing 404 policy); insufficient member role is 403.
Important conflicts return machine codes and Swedish messages, including
inactive series/dimensions, stale/locked IB, consumed invitations and carry conflicts.

## 9. Frontend routes

`/onboarding`, `/invitations/accept`, `/settings/organization`,
`/settings/members` (`/settings/users` alias), `/settings/voucher-series`,
`/settings/opening-balances`, `/registers/projects`, `/registers/cost-centers`
(`cost-centres` alias). Settings/register pages also have consistent `/app` aliases.
No mock data was introduced in these product flows. Loading, validation, errors,
read-only/locked states and late tenant/year responses are explicitly handled.

## 10. Authorization matrix

| Operation                                              | OWNER | ADMIN | ACCOUNTANT | MEMBER | READ_ONLY |
| ------------------------------------------------------ | ----- | ----- | ---------- | ------ | --------- |
| Read company/registers/reports/attachments; SIE export | Yes   | Yes   | Yes        | Yes    | Yes       |
| Company settings, invite/member management             | Yes   | Yes   | No         | No     | No        |
| Accounts, draft/save/post/reverse, upload, SIE import  | Yes   | Yes   | Yes        | No     | No        |
| Series, dimensions, IB/carry, period lock/unlock       | Yes   | Yes   | Yes        | No     | No        |
| Fiscal year create/close                               | Yes   | Yes   | No         | No     | No        |
| Explicit ownership transfer                            | Yes   | No    | No         | No     | No        |

ADMIN cannot change/remove OWNER; generic role changes/invites cannot promote
OWNER. Transfer atomically promotes an active member and demotes the actor to
ADMIN. Actual HTTP/PG tests exercise all five roles across new and old domains.
The existing SIE export permission is READ_BOOKKEEPING; it was not silently tightened.

## 11. Onboarding behavior

Zero organizations redirects protected routes/login/registration into setup;
existing members skip setup, and invitation registration retains acceptance.
Successful setup selects the new organization and resets tenant state. A UUID
setupKey serializes retries; another actor cannot obtain that workspace by retry.
SE/SEK are the supported initial setup. Custom date ranges have at most 13 monthly
periods. Starter 1930/1510/2440/2091/3000/4000 is application-owned, not full BAS.
Organization-number validation is format-only, not a registry/legal assertion.

## 12. Invitation security

32 random bytes; SHA-256 hash only in the database; seven-day expiry; same
authenticated email and tenant; one atomic acceptance. Resend generates a fresh
token and revokes predecessors. Pending uniqueness and org locks handle races.
Tokens are absent from normal lists/audits/logs. Explicit development/test URLs
use fragments and are not stored in persistent browser storage.
Production creation fails closed with `INVITATION_DELIVERY_UNAVAILABLE` until a
real reviewed mail adapter exists. No production email was sent or claimed.

## 13. Voucher numbering

DRAFT consumes no number. POSTED allocation and accounting writes share a
transaction; rollback does not consume a committed number. Sequence is per
organization/year/series, starts at 1 for a new year's series, and used code cannot
change. Twenty simultaneous posts and independent series/tenant posting while a
new series is created have PG evidence. Deactivation vs post has one valid outcome.
No API accepts a forged counter or destructive deletion of a used series.

## 14. Opening-balance contract

Exact nonnegative two-decimal, single-sided, unique same-tenant BS accounts;
nonzero values require active accounts. Whole debit equals whole credit. POST
replaces atomically only with the current fingerprint. Closed year, locked period
or any POSTED activity denies replacement, including direct SQL paths. Zero rows
are omitted. Invalid legacy IB fails closed rather than being silently repaired.

## 15. Carry-forward accounting

CLOSED source, OPEN/unlocked/unused target beginning the next day; no overwrite
of existing target IB or repeated confirmation, even for zero balances. Target BS
gets source IB plus all POSTED debit-minus-credit. Revenue/expense open at zero;
expenses-minus-revenue is transferred to the explicitly chosen active tenant
EQUITY account. This is not a balancing plug or a complete annual closing engine.
Actor/tenant-bound preview expires after 15 minutes; confirm recomputes the
fingerprint under stable year/account locks and writes IB/audit once. Golden
11,000 debit/11,000 credit carries forward and reconciles target TB and BS.

## 16. Posted dimension snapshots

Database posting freezes `{id,code,name}` under dimension share locks; API
presentation uses the frozen labels. Codes become immutable after posted use.
Corrections retain original JSON/legacy NULL even after deactivation. Historical
NULL snapshots are not guessed/backfilled; a used legacy dimension's name is
also locked. This addresses dimension history, not all account/company history.

## 17. SIE impact

Retained SIE4/PC8 subset, dimension 1=cost centre and 6=project; Swedish characters,
inactive historical objects, safe identifiers and independent-reader round-trip
tests. Export chooses first chronological frozen label per code. One SIE #OBJEKT
label cannot encode multiple name versions: this loss boundary is documented.
Conflicting existing import metadata is rejected. Zero #IB records no longer
create invalid zero DB rows. No certification/full external interoperability claim.

## 18. Audit impact

Company settings include address/country/currency/default series before/after;
onboarding, invitation lifecycle, membership changes/transfer, series/dimensions,
balanced IB and applied carry are auditable. Metadata contains safe entity/account
identities/totals, not passwords, JWTs, invitation secrets or signed URLs.
Append-only application/DB protections survive restore and runtime LOGIN tests.

## 19–21. Exact test counts

| Full repository gate                    | Result | Count                              |
| --------------------------------------- | ------ | ---------------------------------- |
| `corepack pnpm@9.15.4 test`             | PASS   | 180: API 93, web 63, DB 11, SIE 13 |
| `corepack pnpm@9.15.4 test:integration` | PASS   | 140 PostgreSQL cases, 17 suites    |
| `corepack pnpm@9.15.4 test:e2e`         | PASS   | 18 Chromium cases                  |

Browser coverage includes all six requested workflows; onboarding extends an
existing registration case, five other new cases account for the total 13→18.
No test exclusions, weakened type checks or in-memory accounting database.
One attempted parallel Windows rerun collided with Prisma's loaded native DLL
during regeneration (EPERM). The client was regenerated and the gates rerun
sequentially; this setup failure is not counted as a passing test or hidden by exclusions.
Storage in the role-matrix PG suite is an explicit test transport; full storage
restore/security/races additionally use real disposable RustFS.
Independent SIE/Golden/concurrency cases already included above are not additive.

## 22. Security audit

`node scripts/security-audit.cjs`: PASS; info/low/moderate/high/critical all zero.
Existing cookie, Origin/CSRF, secret validation, rate limits, request IDs, no-store,
headers and upload boundaries were preserved. Process-local limits are not a
multi-replica production limiter. Previously disclosed secrets still require
operator rotation; tests cannot prove that rotation occurred.

## 23. Static checks and build

Lint PASS (6 tasks), typecheck PASS (9), full build PASS (4), with
`API_INTERNAL_URL=https://ledgerapp-api.example.invalid` as required. Schema
validation and git whitespace check pass. New routes are production-built.
The PostgreSQL locking and React review skills informed stable lock order,
fail-closed snapshots, accessible typeaheads and stale-response isolation.

## 24. Fresh migration and upgrade

All 19 migrations applied to fresh loopback disposable databases. Upgrade test
applies the real 14-migration FAS 24 schema, seeds 13 representative historical
models (including balanced posted lines, IB and dimensions), then applies the
five new migrations and compares every original column/value. PASS; legacy NULL
snapshots remain NULL and their name guard is verified. No db push or fabricated history.

## 25. Restore/recovery

Extended real pg_dump/pg_restore compares complete rows across 20 models:
settings, members, one pending/one accepted invitation, series, four IB rows,
confirmed carry, dimensions, journal snapshots, corrections, VAT, SIE and audits.
Private blob restores into a fresh bucket; signed bytes/size/SHA match. Correct
reconciliation has zero discrepancies; four independent negative buckets detect
missing/orphan/checksum/size. No user bucket or orphan was deleted.
Actual nonsuperuser runtime LOGIN passes ordinary and new company/member/series/
dimension/IB/carry HTTP workflows. Eight original DDL/audit/migration denials plus
invitation deletion/role mutation/carry fingerprint mutation denials pass.
Restored direct locked/unbalanced-post rejection and three real storage upload
races pass. CI retains these gates and adds restored guard verification.
Disposable containers/databases/artifacts are retained, not production backups.
The four owned disposable containers were stopped after verification, not removed;
ordinary PostgreSQL/MinIO services were left running. The final complete restore
used `ledgerapp_drill_2529b` → `ledgerapp_restore_2529b`, with backup artifacts in
`C:\Users\Vince\AppData\Local\Temp\ledgerapp-restore-drill-nXQOl4`.
Cloud credentials/TLS/encryption/retention/RPO-RTO and full restricted-role SIE/upload
coverage remain unproven. Historical smaller restore scripts are superseded by
the complete drill plus explicit restored-guard contract, not counted twice.

## 26. Narrow bugs discovered and fixed

- Void advisory-lock SELECT used an unsupported query-result path; switched to executeRaw.
- Monthly-year service allowed more periods than the database's limit; aligned to 13.
- Refresh contention could reject through pool timeout without executing family-reuse
  revocation; added bounded transaction budget and serialized rotation/revocation.
- SIE exported zero #IB rows could violate imported IB constraints; omit their storage.
- Inactive series could hit a generic DB failure before the machine-code path;
  precheck under the shared year lock now returns `VOUCHER_SERIES_INACTIVE`.
- Company settings audit omitted new fields; now records safe before/after values.
- Onboarding UUID failure, typeahead typing/reset, malformed dimension responses,
  stale year saves and safe settings accidentally coercing legacy currency/country
  were corrected. Browser fixture no longer demotes the sole owner illegally.

New fixture failures (duplicate registration throttling, missing report dates,
incorrect fiscal-year permission/foreign-resource status expectations) were fixed
in the fixtures, not by weakening production rate limits, authorization or DTOs.

## 27. Remaining P0 blockers

P0-03: exposed-secret rotation, deployed authentication/logging/proxy/shared limits
and upload/malware/operator controls. P0-07: general historical account/company
presentation/versioned exports remain open despite classification/dimension fixes.
P0-10: complete SIE interoperability/official validation and external review.
P0-11: residual broader close/import/retry/transient concurrency matrix, although
new requested phase races and cross-organization numbering now have coverage.
P0-12: this working tree still needs review/commit/push and all three remote CI gates.
P0-13: actual cloud backup/runtime permissions/encryption/retention/RPO-RTO; complete
restricted-role SIE/upload proof. See [baseline dispositions](fas24-release-gate.md).

## 28. Remaining P1/product gaps

Reviewed production email adapter/outbox/verified-email policy; friendly shared
report fiscal selectors instead of explicit report UUID inputs; dimensional IB
allocation; full annual closing workflow; broader VAT/BAS/import workflows and
professional accounting/legal review. No statutory, BAS licensing, SIE, VAT,
GDPR-completeness or production-certification claims follow from these tests.

## 29. Phase completion

| Phase  | Status within the requested documented contract                                                        |
| ------ | ------------------------------------------------------------------------------------------------------ |
| FAS 25 | COMPLETE — supported SE/SEK onboarding and safe settings                                               |
| FAS 26 | COMPLETE — development-safe delivery abstraction as explicitly permitted; production email unavailable |
| FAS 27 | COMPLETE — managed year/tenant series and safe numbering                                               |
| FAS 28 | COMPLETE — balanced IB and closed-source preview/confirm carry                                         |
| FAS 29 | COMPLETE — managed dimensions and frozen historical labels                                             |

Completion here is implementation/test scope, not production release approval.

## 30. Recommended next phase — not started

Review and commit this patch, then run the complete remote release gate. Next
development should prioritize residual P0-07 historical metadata and production
operator/cloud/concurrency closure before adding more accounting features.
FAS 30 was not started.
