# Manually authored SIE fixture

`sie-spec-derived.pc8-escaped.txt` was manually authored for this repository on
2026-10-07 from the public SIE 4B specification (edition 2008-09-30):
https://sie.se/wp-content/uploads/2020/05/SIE_filformat_ver_4B_ENGLISH.pdf

It is original synthetic test data, not a LedgerApp export and not a copied
vendor/customer file. The fixture is dedicated to the public domain under
CC0-1.0. Literal `\xNN` escapes store CP437 bytes in a reviewable ASCII file;
tests materialize the bytes without the production encoder.

The independent reader validates only the implemented fixture/export subset
and six Swedish non-ASCII letters. It is not a general CP437 decoder, official
SIE validator, certification or proof of third-party interoperability.
