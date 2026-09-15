# Licensed chart-of-accounts imports

LedgerApp deliberately contains no downloader, scraper or bundled third-party
chart of accounts. A future importer accepts an injected
`LicensedChartOfAccountsAdapter` from the accounts module. The adapter must
provide the account rows together with a source name, version and explicit
license reference.

This separation means a customer or an authorized integration can provide a
licensed BAS chart of accounts without LedgerApp collecting data from a
third-party website. Import jobs should preserve the supplied license metadata
in their audit trail and must always target one organization.

The current account model is organization-wide. A licensed chart may be
imported as a starting point for an organization, but year-specific
applicability will require an explicit `AccountFiscalYear` join model in a
later migration. No external chart data is included in this repository.
