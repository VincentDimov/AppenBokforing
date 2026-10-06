# SIE import and export

LedgerApp targets a **limited SIE4 subset**, based on edition 4B, without
claiming full conformance or certification. The implemented
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

## HTTP transport and input boundary (FAS 17)

Export downloads use `text/plain; charset=utf-8`, a fixed attachment filename
`ledgerapp.sie`, `nosniff` and `no-store`. The response is a UTF-8 Buffer of
the unmodified serializer string, not HTML and not HTML-escaped. Record names
or control characters cannot become response headers. The serializer still
declares `#FORMAT PC8` without CP437 encoding; that format-level mismatch and
record/newline injection remain unresolved P0 issues, not hidden by HTTP safety.

Imports receive a Unicode content string in JSON, limited to **131072 UTF-8
bytes (128 KiB)** after JSON decoding. Preview and confirm both check the bound
before SIE parsing or import DB work (authentication/membership may still read
DB first). The single explicit global JSON parser is bounded to **1048576
bytes (1 MiB)**; this accommodates worst-case 6x JSON escapes plus the normal
UUID/confirm envelope. Oversized content or wire envelopes return JSON HTTP
413 with an explanatory message. DTO validation still applies. Multipart
attachment limits are independent and unchanged.

These transport tests do not establish accounting correctness, CP437 support,
SIE4B certification, or successful real PostgreSQL import/export.
