# SIE UI — FAS 31

`/settings/import-export` (with `/app` alias) reuses the existing PC8 SIE4B
subset, parser and signed preview/confirmation contract. Choose file and actual
tenant year, preview original bytes as base64, inspect counts, IB, company/year,
warnings and blocking/unsupported records, then explicitly consent. The same
bytes/actor/tenant/year/token are submitted on confirmation. A synchronous
client lock prevents double clicks; server conflicts/transactional uniqueness
remain authoritative. Year/file/tenant changes invalidate the reviewed state.

No writes happen during preview. Successful confirmation creates an existing
SieImport row and imported voucher links inside the single accounting transaction.
It records filename (display-only, never a storage key), SHA-256, actor/year,
created/reused account counts, IB/dimension counts and warnings. Failed imports
roll back this row too. The source object is optional: source bytes are not
automatically retained, and no fictional attachment is created. Existing real
source attachments retain their RESTRICT composite foreign keys. A coordinated
source-retention workflow is a future feature, not an implicit archive policy.

GET `/organizations/:id/sie/history` exposes the latest 100 imports and exports,
with explicit safe DTO selections, active membership guard and no raw contents,
tokens, storage keys or credentials. OWNER/ADMIN/ACCOUNTANT import; active
MEMBER/READ_ONLY may inspect history/export under the established permission.

Export obtains an actual response Blob and downloads it without converting to
text. The existing backend application/octet-stream, fixed attachment filename,
nosniff/no-store and export precheck remain authoritative. Errors are shown, not
saved as counterfeit SIE files. The binary object URL is temporary and revoked.
Backend file limit remains 128 KiB; UI size/extension checks are convenience only.

The complete format boundaries remain in [sie.md](sie.md). Imported VAT roles
are unclassified, not silently guessed. Tests do not prove regulatory compliance
or full third-party interoperability. New history columns belong in restore
fixtures and ordinary migration/runtime grants; no production writes occur here.
