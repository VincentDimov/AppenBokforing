# Opening balances and carry-forward — FAS 28

This extends the FAS 19 [accounting contract](accounting-balances.md). Money
remains PostgreSQL NUMERIC and Decimal-safe (BigInt cents in the UI).

`GET /organizations/:id/opening-balances?fiscalYear=UUID` returns accounts,
rows, totals, editability and a SHA-256 fingerprint including row identities and
timestamps. `POST` supplies `fiscalYearId`, `expectedFingerprint` and the whole
`rows: [{accountId,debit,credit}]` set. One transaction locks the calendar and
accounts, validates all rows, rejects a stale fingerprint and replaces the set.
Zero rows are not persisted. A line is nonnegative, at most two decimals,
single-sided, unique-account and same-tenant. Nonzero rows need active ASSET,
LIABILITY or EQUITY accounts. Revenue/expense IB is forbidden. Debit equals
credit exactly; no partial/draft IB is consumed by reports.

IB editing is deliberately conservative: closed years, any locked period or
first POSTED activity block replacement. Database triggers protect direct
modifications too. Legacy invalid IB still fails closed in reports and requires
a separately reviewed remediation; the new UI does not silently repair it.
OWNER/ADMIN/ACCOUNTANT can write; MEMBER/READ_ONLY can view only.

`POST /organizations/:id/carry-forward/preview` takes sourceFiscalYearId,
targetFiscalYearId and explicitly selected resultAccountId. Source must be
CLOSED; target OPEN, unlocked, unused and begin the next day. Existing target IB
or a confirmed carry prevents overwrite, including a zero-balance carry.
Two year locks are acquired in stable UUID order, then account share locks.

For each BS account, source IB + all source POSTED debit − credit becomes target
raw net. Positive net is opening debit; negative net is opening credit. Income
accounts start at zero. Their expenses-minus-revenue net is added to the selected
active tenant EQUITY account. This is a defined result transfer, **not a balancing
plug**: source completeness and whole-set equality are validated independently.
No arbitrary Swedish result account is chosen and no complete annual closing
workflow or statutory compliance is claimed.

Preview persists a tenant/actor-bound fingerprint record, expires after 15 minutes
and writes no IB. UI shows source/target, account, original closing amount,
new debit/credit, totals and explicit result destination. `POST .../confirm`
supplies previewId, recomputes under locks, rejects stale source/metadata/target,
writes target IB and confirmation/audit atomically. Repeated/concurrent confirms
cannot duplicate or silently replace IB. Existing IB needs a separately designed
explicit replacement workflow, not an implicit retry.

Golden evidence: source 11,000 assets / 11,000 equity including current result
becomes 11,000 debit / 11,000 credit target IB; target TB/BS reconcile and income
is zero. PG races cover duplicate confirmations, manual target IB vs carry,
source close vs preview and prohibited source accounting vs confirm. Since
source must already be closed, a genuine source posting cannot race successfully.

OpeningBalance has no project/cost-centre allocation. GL/TB/BS dimension queries
with IB retain existing fail-closed policy; no invented dimensional allocations.
`/settings/opening-balances` uses actual year/account APIs, exact totals, read-only
states and explicit carry confirmation. Audit records fiscal year, changed account
IDs/totals and source/target/result/fingerprint summaries, never token material.
