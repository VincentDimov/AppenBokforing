# VAT reporting architecture

LedgerApp separates the generic accounting calculation engine from the current
Swedish starter configuration.

## Calculation engine

`apps/api/src/vat/vat-reporting-engine.ts` only reads tenant-owned VAT code
metadata (`code`, `type`, and `rate`) and posted journal lines. It never uses
Swedish VAT return boxes, tax periods, or statutory exceptions. VAT amounts are
therefore only as reliable as the configured codes and the accounting data.

The engine reports input VAT, output VAT, the resulting VAT position, and these
review signals: a missing expected code, an account/code conflict, an amount on
the unexpected debit/credit side, or an unbalanced posted entry.

## Swedish configuration

`apps/api/src/vat/swedish-vat-configuration.ts` is a review-required starter
template for common Swedish 25 %, 12 %, and 6 % output VAT, plus 25 % input VAT.
It is deliberately not imported by the calculation engine. Each organization
owns and configures its actual `VatCode` records and may choose different code
names.

When rates, reporting requirements, or interpretations change, update and
review that one configuration template, organization VAT metadata, tests, and
this document together. A qualified reviewer must validate the configuration
and each VAT return. Passing automated tests does **not** establish regulatory
or tax compliance.
