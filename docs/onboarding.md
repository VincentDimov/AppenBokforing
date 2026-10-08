# Company onboarding — FAS 25

Authenticated users with zero active memberships are redirected to `/onboarding`
from protected routes, including after login/register and on direct reload.
Existing members are not forced through setup. An invitation registration keeps
its acceptance route instead of creating an unrelated company.

`POST /onboarding` uses a client UUID `setupKey`. Under a transaction-scoped
advisory lock it creates organization, OWNER membership, first fiscal year and
monthly periods, series A, six application-owned starter accounts and audit.
Retries return the same workspace only to its active owner. Failed validation
cannot leave half a company. Different companies may share an organization number.

Swedish format `XXXXXX-XXXX` or `XXXXXXXXXX` is stored as ten digits. This is
format validation, not Bolagsverket validation. Supported setup is Sweden/SEK;
the UI states these defaults, with name, optional number/address and custom
start/end dates. Monthly periods are limited to 13, matching the database contract.
The starter chart (1930, 1510, 2440, 2091, 3000, 4000) is original and small:
it is neither a licensed complete BAS chart nor a finished VAT configuration.

`/settings/organization` uses existing `PATCH /organizations/:id`. OWNER/ADMIN
can change safe metadata. Country/currency/company-number changes are blocked
after IB or POSTED activity. Account classification/identities also freeze once
used. Company/account presentation names are not generally versioned: P0-07
remains open. No legal historical-document guarantee is implied.

The organization selector resets tenant-bound pages. The top bar now fetches
real fiscal years, persists selection per tenant and synchronizes same-tab and
cross-tab selectors. Report pages still provide their explicit report year/date
filters; changing the top bar is not a retroactive report query.
