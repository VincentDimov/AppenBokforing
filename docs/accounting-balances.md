# Accounting balances — FAS 19

## One sign contract

Storage uses PostgreSQL NUMERIC(18,2), separate non-negative debit/credit columns.
Calculation uses Decimal only; JSON amounts are fixed-two-decimal strings.
The reporting helpers use a local Decimal clone with 40 significant digits for
aggregates; they do not change precision settings in posting, VAT or SIE.
No accounting amount goes through JavaScript Number, parseFloat or Math.abs.

- Raw net = debit − credit, irrespective of account type.
- Fiscal opening debit/credit are the OpeningBalance columns at year start.
- Fiscal opening net = opening debit − opening credit.
- Interval opening net = fiscal opening net + POSTED net strictly before fromDate.
- Interval opening debit = max(interval opening net, 0); opening credit = max(−net, 0).
  These are net account sides, not gross historical turnover.
- Period debit/credit are gross POSTED totals on the respective sides in the
  inclusive fromDate…toDate interval.
- Closing net = interval opening net + period debit − period credit.
- Closing debit/credit split that net into its actual side, never its normal side.

Normal debit accounts: ASSET, EXPENSE. Normal credit: LIABILITY, EQUITY, REVENUE.
Account type is the presentation authority, consistent with the existing
normalBalanceForAccountType metadata contract. Opposite-side balances remain
negative in type-based reports; they are not silently reclassified or absolutized.
GL displays raw net for every account. Income statement displays revenue
credit-positive and expense debit-positive; result = revenue − expense.
Balance sheet displays assets debit-positive and equity/liabilities credit-positive.
Current-year result is −sum(POSTED income-account raw nets), never a balancing plug.
It is a presentation line, not an invented journal transaction.

## IB validity and workflow

The complete tenant/year IB is read and validated before any GL account filter.
An absent IB set means zero. Zero account balance is represented by absence of
an IB row (existing SQL requires one strictly positive side for stored IB).
Each row must resolve to the same organization's valid balance-sheet account
and selected fiscal year; debit/credit must be finite, exact to cents,
non-negative and not both strictly positive. Duplicate accounts are invalid.
Revenue/expense opening balances are rejected: this model starts income accounts
at zero and carries retained results in equity, not in income-account IB.
Inactive historical accounts are intentionally included in reports.
Year IB debit must equal credit exactly, including accounts outside a GL filter.

There is no user-facing IB editor or IB mutation API yet. An administrator may
temporarily persist incomplete IB while provisioning it, but it is NOT an
application-approved draft workflow: GL/BS/trial balance refuse it with HTTP 422.
A future IB writer/import must validate the entire set atomically, honor calendar
locks and produce audit events. This phase does not implement carry-forward.

Errors: INVALID_OPENING_BALANCE, UNBALANCED_OPENING_BALANCE,
UNALLOCATED_OPENING_BALANCE and UNBALANCED_ACCOUNTING_DATA return HTTP 422 with
code/message, never a successful fabricated balanced report. Existing tenant FK,
single-side checks, locks, journal balance/immutability and audit protections remain.

## Scope, dates, dimensions, snapshots

Only POSTED entries are movements. Original and POSTED inverse correction both
count; they net out from the correction's date, not retrospectively.
Dates are real YYYY-MM-DD calendar dates and remain within the selected year.
No journal from another year/organization contributes.
Balance comparison dates are within the same year; absent comparison is zero.

OpeningBalance has no project/cost-center fields. GL rejects either dimension
filter when the year has any non-zero IB, even if the chosen account has no IB.
With no IB, dimensions filter posted lines, including pre-interval movements.
Such a dimensional GL is not a whole-organization trial balance.
Trial balance and balance sheet do not accept dimensions. Income statement
retains its existing movement-only dimension filtering.

GL, BS, trial balance and income statement each read within a RepeatableRead
transaction: year, account metadata, IB and movements share one DB snapshot.
Separate HTTP requests do not share snapshots; compare stable data/cutoffs.
This does not freeze mutable historical metadata or change the SIE/VAT readers.

## Deterministic Golden fixture and manually calculated facit

Source: [accounting-golden.ts](../tests/fixtures/accounting-golden.ts).
Values, dates, account classifications and expected amounts are fixed.
Only generated DB/user/organization identifiers are run-isolation identifiers,
not random accounting inputs. Used by real PG/HTTP cross-report integration,
trial-balance UI rendering and the local browser→Next→Nest→PG test.
Turbo includes tests/fixtures/** in its global cache inputs, so changed Golden
data/facit cannot reuse a stale package test/typecheck/build result.

Year: 2026-01-01…2026-12-31. IB: bank debit 10,000; receivable debit 2,000;
payable credit 3,000; equity credit 9,000. IB totals 12,000 on each side.
Posted events: Jan 1 customer payment 2,000; Feb supplier expense 1,500;
Mar revenue 5,000; Apr liability payment 3,000; Jun credit note 500;
Jul actual API reversal of Feb expense 1,500; Dec 31 expense 2,500.
A balanced 999,999 draft is deliberately excluded.

| Account |  IB D |  IB C | Period D | Period C |  UB D |  UB C |
| ------- | ----: | ----: | -------: | -------: | ----: | ----: |
| 1510    |  2000 |     0 |        0 |     2000 |     0 |     0 |
| 1930    | 10000 |     0 |     7000 |     6000 | 11000 |     0 |
| 2080    |     0 |  9000 |        0 |        0 |     0 |  9000 |
| 2440    |     0 |  3000 |     4500 |     1500 |     0 |     0 |
| 3010    |     0 |     0 |      500 |     5000 |     0 |  4500 |
| 5000    |     0 |     0 |     4000 |     1500 |  2500 |     0 |
| Total   | 12000 | 12000 |    16000 |    16000 | 13500 | 13500 |

Year-end GL bank = trial-bank net = BS bank = 11,000.
BS assets 11,000 = equity 9,000 + current result 2,000 + liabilities 0.
Income revenue 4,500 − expenses 2,500 = 2,000.
June 30 assets 13,500 = equity 12,000 (including result 3,000) + liabilities 1,500.
July…December interval bank opening = fiscal IB 10,000 + earlier net 3,500 = 13,500.
All-account interval opening sides total 15,000 each (including expense 1,500);
period sides total 4,000 each; closing sides 13,500 each.

Other integration fixtures cover missing IB, zero balances, draft-only/mixed
status, credit assets/debit liabilities, fiscal/date boundaries, invalid IB and
foreign tenant/year/account references. Old fixture tests remain as regressions.

## Query footprint and limits

No new indexes/migrations: existing IB tenant/year/account unique + tenant/year
index, journal org/year/date and partial POSTED org/year/date index, and
journal-line tenant/account indexes support the selected predicates.
Each context uses three queries (year, accounts, IB), not one per account.
TB adds one period groupBy, optionally one pre-period groupBy; BS adds one current
groupBy and optionally one comparison groupBy. SQL returns per-account sums,
not the entire year's lines. GL aggregates earlier lines, then reads only
selected-account interval details with explicit selects and stable date/series/
voucher/entry/line/ID ordering. Prisma relation loading may add batched statements,
but application query count does not grow per account.
Income-statement detail reads remain year/date bounded.

No load/EXPLAIN benchmark or general paging guarantee is claimed. Large detailed
GL/IS still need volume budgets/paging; historical metadata stability, SIE IB
loss/snapshot/encoding, VAT correctness, year closing/carry-forward and production
DB privileges/backup are separate unresolved work. Tests do not prove statutory
compliance or replace qualified accounting review.

## Verification — 2026-10-07

Run from root with Node 22.20.0 / pnpm 9.15.4. Fresh isolated PostgreSQL 16
container ledgerapp-fas19-20261007, loopback port 15436.
DATABASE_URL/TEST_DATABASE_URL target ledgerapp_test; E2E_DATABASE_URL targets
the separate ledgerapp_e2e. All eleven existing migrations applied from empty DB
in both databases. No new migration/index, cloud writes or deployment.

| Exact command                                                                                        | Final result                                                |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| corepack pnpm@9.15.4 --filter @ledgerapp/db exec prisma migrate deploy --schema prisma/schema.prisma | PASS, 11 migrations                                         |
| corepack pnpm@9.15.4 lint                                                                            | PASS, 6 tasks                                               |
| corepack pnpm@9.15.4 typecheck                                                                       | PASS, 9 tasks                                               |
| corepack pnpm@9.15.4 test                                                                            | PASS, 109 tests: API 48, web 48, DB 11, SIE 2               |
| corepack pnpm@9.15.4 test:integration                                                                | PASS, 59 tests / 8 suites against PostgreSQL                |
| corepack pnpm@9.15.4 build                                                                           | PASS, 4 tasks; web 28 static pages                          |
| corepack pnpm@9.15.4 test:e2e                                                                        | PASS, 10 Chromium tests, 17.0 s; production-built local web |
| node --test scripts/e2e-safety.test.cjs                                                              | PASS, 7 local-only boundary contracts                       |

Root build uses processenv API_INTERNAL_URL=https://ledgerapp-api.example.invalid,
a reserved non-production origin. E2E rebuilds against loopback API 4410/web 4310.
Final root unit run executed API/web/DB/SIE tests; two dependency builds were
replayed from Turbo cache. Golden source is included in cache inputs. No public smoke/cloud
authentication repeated in FAS 19.

Added: 5 Decimal/sign unit cases, 5 trial UI/org-state cases, 9 real PG/HTTP
Golden/edge/security cases and 1 browser Golden case (20 total).
Existing dimension fixture now asserts the explicit 422 IB policy; another PG
fixture proves dimension/pre-interval filtering still works without IB.
Corrections use the existing reverse API, not fabricated status updates.

Initial failures: 8 PG failures exposed Decimal's isPositive() including zero;
validation now uses strict greaterThan("0"). One new browser selector matched
both top-bar and report year fields; it now uses exact matching. Default sandbox
process access also delayed Windows Playwright teardown; only the identified
owned test tree was stopped. The complete subsequent run with process access
passed without retries. No accounting assertion or DB protection was weakened.
