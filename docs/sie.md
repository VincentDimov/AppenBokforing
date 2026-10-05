# SIE import and export

LedgerApp implements **SIE type 4, edition 4B** for export. The implemented
subset emits `#SIETYP 4`, organization and fiscal-year metadata, `#KONTO`,
`#IB`/`#UB`, projects and cost centres as `#OBJEKT`, and posted `#VER` blocks
with balanced `#TRANS` rows. In SIE, a positive transaction amount represents
debit and a negative amount represents credit.

The import parser accepts the corresponding practical SIE4 subset and reports
unknown records as warnings. Preview is the default for `POST /imports/sie`:
it returns the fiscal year, account and voucher counts, warnings, and validation
errors without writing any data. Submit the same content with `confirm: true`
only after review. Confirmed import runs in one database transaction and is
rejected if the matching LedgerApp fiscal year or accounting period is missing.

The implementation is based on SIE-Gruppen's publicly available SIE 4B file
format specification: https://sie.se/wp-content/uploads/2020/05/SIE_filformat_ver_4B_ENGLISH.pdf

SIE files can contain variants and extensions not yet supported here, including
`#RTRANS`, `#BTRANS`, control sums and non-numeric voucher identities. Those
must be reviewed before relying on import for production migration.
