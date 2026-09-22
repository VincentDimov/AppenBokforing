# Reporting

Income statements are calculated exclusively from `POSTED` journal lines. The
grouping contract is deterministic: `REVENUE` accounts form **Intäkter** and
`EXPENSE` accounts form **Kostnader**. Revenue is presented as credit less
debit, while expense is debit less credit. The result is revenue minus expense.

The browser print view is the initial PDF adapter: it renders the same immutable
report response and delegates saving as PDF to the user agent. A future
server-side PDF renderer should consume this API response through a
`ReportDocumentRenderer` adapter, rather than recalculate accounting amounts.
