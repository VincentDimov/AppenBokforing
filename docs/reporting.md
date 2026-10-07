# Reporting

## FAS 19: shared balances

[Accounting sign, IB validation, dimensions, Golden facit and query policy](accounting-balances.md)
is the authoritative balance contract.
GL now includes validated fiscal-year IB plus postings before the interval.
GL/BS/trial balance/income statement each use a RepeatableRead snapshot.
BS rejects inconsistent data and derives current-year result from income lines.

`GET /reports/trial-balance` requires authenticated READ_BOOKKEEPING membership,
organizationId, fiscalYear, fromDate and toDate; dates are inclusive and year-bound.
Response has accounts (id/number/name and openingDebit/openingCredit/periodDebit/
periodCredit/closingDebit/closingCredit), same-named totals, fiscalYear,
fromDate/toDate and fiscalYearOpeningTotals. Amounts are decimal strings.
No account or dimensions filter is supported on trial balance, so its totals
can be reconciled for the whole organization.
UI: /reports/trial-balance and /app/reports/trial-balance; table, filters and print.
API owns calculations; UI only renders amounts.

Income statements are calculated exclusively from `POSTED` journal lines. The
grouping contract is deterministic: `REVENUE` accounts form **Intäkter** and
`EXPENSE` accounts form **Kostnader**. Revenue is presented as credit less
debit, while expense is debit less credit. The result is revenue minus expense.

The browser print view is the initial PDF adapter: it renders the same immutable
report response and delegates saving as PDF to the user agent. A future
server-side PDF renderer should consume this API response through a
`ReportDocumentRenderer` adapter, rather than recalculate accounting amounts.
