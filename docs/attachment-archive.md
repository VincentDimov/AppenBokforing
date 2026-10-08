# Global attachment archive — FAS 32

`/bookkeeping/attachments` and `/app` alias list all existing tenant attachment
records, including supporting/SIE documents without a journal-entry link.
No inbox or new unattached-document workflow is introduced. Upload remains
restricted to saved DRAFT entries/open calendar; retained POSTED attachments
are visible/downloadable. PDF/image files are downloaded, not rendered as HTML
or automatically embedded. Safe disposition, original size/MIME/extension/magic
checks and the private object-storage policy remain unchanged.

GET `/organizations/:id/attachments` requires current active membership.
Filters: filename (minimum 3 characters), upload date interval, safe MIME type,
voucher status, series, voucher number, uploader UUID and hasVoucher=true/false.
Voucher filters intentionally exclude unlinked documents; without those filters
unlinked records remain visible, with an explicit no-voucher state. Search uses ILIKE and
a justified pg_trgm GIN index. Migration needs trusted pg_trgm availability;
the tenant/time/id B-tree supports stable newest-first keyset pagination.
Each page is 50 rows by default, maximum 100, with one extra row for has-more.
Cursor contains tenant/date/id, is validated and cannot change tenant predicates.
It is a position, not a grant of resource access. No permanent storage keys are
selected or returned. SHA-256 is metadata; possible duplicates are not deleted.

The UI links to the actual voucher and obtains a short-lived signed URL from
the existing authorized download endpoint. Removed/foreign memberships cannot
obtain a new URL. Already-issued bearer URLs retain their bounded lifetime;
immediate object URL revocation is not claimed. No delete action or retention
change. The archive's upload-date filter does not mean voucher accounting date.

Archive state/requests are organization-keyed, aborted on unmount and stale
responses are ignored. A new company has an honest empty state. Backups retain
existing attachment metadata and object manifests; there is no computed archive
state to restore. Large deployment EXPLAIN/load tests remain operator work.
