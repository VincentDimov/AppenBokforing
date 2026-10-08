# FAS 20 — explicit VAT accounting (2026-10-07)

## Model and base source

VAT code, rate, direction, reporting category, account and journal line are separate
concepts. `VatCode.type` retains INPUT/OUTPUT/EXEMPT for compatibility; the frozen
reporting snapshot translates EXEMPT to direction NONE. Rates are NUMERIC(5,2),
money NUMERIC(18,2). Journal lines add `vatRole` BASE/TAX/NONE/UNCLASSIFIED,
optional `vatGroup` (64 characters), and `vatSnapshot` JSONB. Existing tenant
composite foreign keys and RESTRICT deletion policies remain unchanged.

The base is the actual amount on explicit BASE lines, **not** tax divided by a
rate, account-number inference or gross bank/receivable amounts. TAX lines are
the actual posted VAT. Within one voucher, matching code IDs form a group by
default; explicit groups distinguish separate supplies with the same code.
Different codes must not share an explicit group. Bank settlement has no code.
This fits the existing flexible double-entry editor without introducing invoices
or requiring a tax calculation in the browser. Editor labels expose role/group.

At posting, the server freezes code ID/name/rate/direction, configuration version,
category, effective dates and the account's expected code in the same serializable
transaction as numbering/post/audit. Effective dates must contain the original
transaction date. Requests cannot supply `vatSnapshot`. Reversals preserve roles,
groups and snapshots, even if current metadata changed or expired. Their own
posting date must satisfy the existing calendar/locking rules.

Snapshot creation is implemented in the manual posting service. Direct SQL and
current SIE imports do not gain inferred VAT metadata. They remain unresolved if
tagged without snapshots. General historical account classification (P0-07) and
VAT-code administration remain separate work; this is not a full metadata CRUD UI.

## Pure arithmetic and anomalies

`vat-reporting-engine.ts` is country-independent. INPUT uses debit−credit;
OUTPUT uses credit−debit for both BASE and TAX. NONE uses debit−credit and has
zero tax. Matching negative base/tax pairs represent credits; reversing every
line cancels the original without an automatic wrong-side warning. Ordinary
uncoded settlement/bookkeeping lines are not magically classified as VAT bases.

An isolated Decimal precision 40 sums exact posted amounts. Expected tax is
group base × rate / 100 rounded HALF_UP to two decimals, **only for validation**.
Books are never changed to make tax match. Separately rounded supplies should use
separate groups; aggregate rounding differences are surfaced, not silently fixed.
Rate arithmetic supports 25/12/6/0 and other valid 0–100 rates; Swedish mappings
are more limited. A nonzero rate with NONE is invalid.

Signals: missing code, missing historical snapshot, unclassified tagged line,
account/code conflict, invalid rate, mixed/inconsistent group codes, orphan TAX,
BASE without expected TAX, opposite base/tax sides, rate/base/tax mismatch,
unexpected TAX on NONE, and unbalanced posted voucher. Anomalies do not suppress
booked amounts that have an explicit usable role/snapshot. Totals are accounting
observations, not corrected/approved tax-return amounts.

## Versioned Swedish adapter and exact scope

`swedish-vat-configuration.ts` owns the review-required template boundary, starter codes,
semantic return-field names and mapping. Version `SE-DOMESTIC-2026-01` covers
2026-01-01 through 2026-12-31 as an **application configuration**, not a claim
that all legislation stayed constant during that year. No sector/rate selection
(including food or services) is inferred. Organization codes must explicitly
opt into DOMESTIC_STANDARD and the matching version. Existing codes default to
UNMAPPED / unreviewed, not to a presumed Swedish category.

Supported limited mapping: ordinary domestic taxable sales base → 05; output
25/12/6 → 10/11/12; explicitly classified deductible input → 48; mapped output
minus mapped input → 49. Domestic purchase bases are **not** added to sales 05.
Source checked 2026-10-07: [Skatteverket's field guidance](https://www.skatteverket.se/foretag/moms/deklareramoms/fyllaimomsdeklarationen.4.3a2a542410ab40a421c80004214.html).

Unsupported versions/categories/zero-rate output mappings warn; periods outside
the version window withhold all mappings. NONE/exempt bases have no automatic
Swedish box and warn for manual assessment. `swedishReturn.complete` refers only
to absence of detected mapping/anomaly gaps, **never** filing approval.
`reviewRequired` is always true. Engine totals and mapped subtotals may differ
when unsupported data is present; the UI displays mapping warnings.

Not implemented: EU/import/export VAT, reverse charge, OSS, margin schemes,
withdrawals, voluntary rental taxation, partial/non-deductible input VAT,
exemption-specific fields, sector/rate eligibility, historical rule libraries,
return whole-krona rounding, XML submission or tax-account settlement.
Passing tests does not establish Swedish tax or regulatory compliance.

## Safe configuration change procedure

1. A qualified Swedish accounting professional reviews source, scope, dates,
   rates, deductibility and field semantics; attach the decision to the release.
2. Add a new immutable application version/adapter; retain old mappings if old
   reports must remain supported. Do not silently reinterpret old version IDs.
3. Provision tenant-owned new codes with explicit version/category/effective
   dates; use inactive status/effective end dates for future postings as needed.
   Never update posted line snapshots or reclassify legacy rows through backfill.
4. Add manually specified positive, credit, boundary-date and unsupported-case
   fixtures. Run migrations, unit, real PostgreSQL and browser checks.
5. Review actual returns. No automatic compliance guarantee or deployment occurs.

Migration `20261007120000_explicit_vat_model` is additive. Legacy posted roles
default to UNCLASSIFIED and snapshots remain SQL NULL; reports warn and do not
guess whether 1,000/250/1,250 is a tax amount. Existing immutable-line guards cover
all new columns. An additional deferred reversal trigger preserves exact VAT
metadata alongside the original inverse-line trigger. SQL NULL and JSON null
are copied verbatim for legacy reversals. No existing migration is rewritten.

## Golden facit (not computed with production helpers)

`tests/fixtures/vat-golden.ts` is shared by engine and PostgreSQL tests.

| Case                                | Explicit base | Input VAT | Output VAT |
| ----------------------------------- | ------------: | --------: | ---------: |
| A ordinary 25% sale                 |      1,000.00 |      0.00 |     250.00 |
| B 12% sale                          |      1,000.00 |      0.00 |     120.00 |
| C 6% sale                           |      1,000.00 |      0.00 |      60.00 |
| D 25% purchase                      |      1,000.00 |    250.00 |       0.00 |
| E credit / actual API reversal of A |     −1,000.00 |      0.00 |    −250.00 |
| F two supplies at 25% and 6%        |      2,000.00 |      0.00 |     310.00 |
| G NONE purchase, zero rate          |      1,000.00 |      0.00 |       0.00 |

Combined: output base **4,000.00**, input base **1,000.00**, NONE base **1,000.00**,
output VAT **490.00**, input VAT **250.00**, net VAT **240.00**.
Scoped fields: 05=4,000; 10=250; 11=120; 12=120; 48=250; 49=240.
G deliberately warns that its exemption mapping is not implemented.

## Endpoint and UI

GET `/reports/vat` retains organization membership and year/date validation.
Fiscal year and all interval POSTED lines are read under RepeatableRead. DRAFT is
excluded, originals and reversals are both included, locked periods are readable.
No per-account report queries. Full voucher lines are necessary for balance and
group validation; large-data paging/streaming and load measurement remain work.

Response has period/year, code+version records with explicit taxableBase,
inputAmount/outputAmount, separate output/input/NONE bases and input/output/net
totals, anomalies, and `swedishReturn` fields/warnings. Decimal values serialize
only as fixed-point strings. The report shows period, bases, tax, mappings and
review requirement; CSV adds a distinct base column and print remains available.

## Verification environment and commands

Only disposable container `ledgerapp-fas20-20261007`, PostgreSQL 16, loopback port
15437, databases `ledgerapp_test` and `ledgerapp_e2e`. The ordinary development
database and production were not touched; no seed or deployment. Twelve migrations
were applied from empty databases. Test credentials are local disposable values.

Commands from repository root (pnpm 9.15.4 / Node 22.20.0):

- `corepack pnpm@9.15.4 --filter @ledgerapp/db exec prisma migrate deploy --schema prisma/schema.prisma`
  with DATABASE_URL targeting ledgerapp_test: PASS, all 12 migrations.
- `corepack pnpm@9.15.4 lint`: PASS, 6 tasks.
- `corepack pnpm@9.15.4 typecheck`: PASS, 9 tasks.
- `corepack pnpm@9.15.4 test`: PASS, 132 tests (API 69, web 50, DB 11, SIE 2).
- `corepack pnpm@9.15.4 test:integration` with TEST_DATABASE_URL and DATABASE_URL
  targeting ledgerapp_test: PASS, 73 tests in 9 suites; 14 VAT integration cases.
- `$env:API_INTERNAL_URL='https://ledgerapp-api.example.invalid'; corepack pnpm@9.15.4 build`:
  PASS, 4 tasks / 28 static pages (reserved build address, not a runtime origin).
- `corepack pnpm@9.15.4 test:e2e` with E2E_DATABASE_URL targeting ledgerapp_e2e:
  PASS, 11 Chromium cases (20.3 seconds), including role selection → PATCH/POST → real frozen
  PostgreSQL data → actual VAT HTTP response → distinct base/tax UI.

Initial PG setup incorrectly omitted organizationId/confirm from the lock request;
the API correctly returned 400. The fixture was corrected without changing guards.
Initial typecheck caught Prisma JSON declaration portability; the public JSON
property is typed unknown, while audit data retains Prisma's explicit JSON contract.
Legacy SQL NULL versus JSON null reversal handling was identified during review
and gets a dedicated real PostgreSQL regression test. No assertions were removed.

Final test counts and remaining production gaps are recorded in CURRENT_STATE.
Separate `node --test scripts/e2e-safety.test.cjs`: PASS, 7 local-only safety contracts.
The test runner stopped its own Nest/Next processes. The disposable container
was stopped and retained with test data; no other containers were stopped.
P0-08 is COMPLETE only for this explicit arithmetic/limited adapter scope; expert
review, administration, unsupported tax cases and production readiness remain open.
