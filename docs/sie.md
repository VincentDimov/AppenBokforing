# SIE 4B limited loss-aware subset (FAS 21)

Authoritative reference: [SIE-Gruppen edition 4B specification](https://sie.se/wp-content/uploads/2020/05/SIE_filformat_ver_4B_ENGLISH.pdf).
The implementation is standalone `packages/sie`, not controller parsing logic.
It is not certified, a complete SIE implementation or independently validated
by another accounting product. The official-record fixture is a short attributed
specification excerpt, not an official full-file certification suite.

## Bytes, numbers and records

`#FORMAT PC8` now corresponds to actual IBM CP437 bytes. Export is an exact
`application/octet-stream` attachment named `ledgerapp.sie`, with nosniff and
no-store. Swedish ÅÄÖ/åäö and supported CP437 characters roundtrip; unrepresentable
Unicode is rejected, never replaced silently. Amount parsing uses BigInt cents
within NUMERIC(18,2), and API calculations use Decimal, never JS money floats.

Support: organization, current `#RAR 0`, `#KONTO`, optional `#KTYP` (T/S/I/K),
balance-sheet `#IB`/`#UB`, result `#RES`, numeric positive voucher numbers,
`#VER` and `#TRANS`, dimension 1 cost centre and 6 project, optional line date
and text. Calendar-invalid dates, duplicate identities, unbalanced IB/vouchers,
inconsistent declared closing balances and unsafe precision are rejected.
Exporter uses actual generation date (injectable for deterministic fixtures),
stable account/object/voucher order and original line order.

Quoted text preserves escaped quotes and empty optional date tokens. Control
characters/newlines and ambiguous backslash escapes are rejected by serializer;
no user string can inject a new record. HTML-like text remains file text, not HTML.

`#RAR -1` and earlier years can be shown as preview metadata but previous-year
accounting balances are not imported. Unsupported accounting records such as
RTRANS/BTRANS/OIB, quantities, signatures and unknown dimensions/records block
confirmation rather than losing history. Unsupported descriptive metadata has
explicit preview warnings. This stricter subset deliberately does not implement
every ignore/extension allowance of the specification.

## Preview and confirmation

`POST /imports/sie`: either JSON `content` (legacy Unicode input) or
`contentBase64` containing original PC8 bytes, never both. Each file is limited
to 128 KiB (UTF-8 bytes for content, raw bytes for base64), with a 1 MiB JSON
envelope. Preview is write-free. Select explicit tenant fiscalYearId matching
RAR 0, review warnings/errors, then send identical bytes, fiscalYearId and
returned previewToken with confirm=true. Token expires in 15 minutes and binds
SHA-256, actor, tenant and year mapping using an independent HMAC signature.
Production replicas need the same configured signing secret; changing keys
invalidates previews. Parser-only preview without a mapping is not confirmable.

Mapped preview reports existing account name/type, inactive account, object,
voucher identity and IB overwrite conflicts. Confirmation checks those again
under the fiscal-year lock; an earlier preview cannot authorize changed data.
Existing names are retained with warnings; conflicting explicit account type
blocks import. IB is only accepted into an unused year and is never overwritten.
Metadata inference for new accounts without KTYP is limited BAS-like classification,
not import of a licensed BAS dataset or an authoritative classification service.

Confirmation writes accounts, objects, IB, vouchers and audit events in one
transaction. Both voucher and explicit line dates must have OPEN periods in the
selected year. Line dates are preserved source metadata; current reports use
the voucher posting date, not a separate per-line reporting date. Current VAT
roles/configuration are not guessed from SIE: imported lines remain unclassified
and VAT report anomalies require review. No source-attachment-backed import job
workflow or new import UI is claimed by this phase.

Series counter is the maximum of existing counter, imported number+1 and existing
maximum+1; unordered A9 then A2 cannot move it backwards. Export reads the entire
organization/year in RepeatableRead, validates IB and emits POSTED only; DRAFT
is not exported. Complete corrected history is represented by original POSTED
and opposite correction vouchers, not destructive edits.

## Evidence and remaining gate

Nine standalone tests include exact cents, Swedish bytes, injection negatives,
dates, identities, declared balances and quoted text/dimensions/line-date roundtrip.
Real PostgreSQL tests perform preview→confirm→download→new-tenant confirm with
IB 1000.00 and exact 10.01 net movement. Browser E2E downloads real bytes and
imports the FAS 19 Golden fixture into another tenant, reconciling trial balance.
Concurrent import/manual posting has a real PostgreSQL race test.

P0-01 is fixed within the implemented transport/serializer boundary. P0-09 is
implemented for this subset, not all SIE variants. P0-10 remains PARTIAL until an
independent reader/full official sample validation is demonstrated; roundtripping
our own parser/exporter alone cannot establish SIE4B conformance.
