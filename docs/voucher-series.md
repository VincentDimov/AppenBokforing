# Voucher series — FAS 27

Series are existing tenant/fiscal-year entities, not a duplicate register.
`GET/POST /organizations/:id/voucher-series`; GET accepts `fiscalYear`, POST
accepts `fiscalYearId`, safe ASCII code, name and optional description.
`PATCH /organizations/:id/voucher-series/:seriesId` edits safe metadata/active
state. OWNER/ADMIN/ACCOUNTANT may write; every member may read. Closed years
reject writes. There is no deletion or manually-set counter API.

Codes are unique per org/year and become immutable after POSTED use (API plus
database). Inactivation retains historical reporting/export but denies future
posting. Posting and series changes share the fiscal-year/series lock order;
the active state cannot be checked before a concurrent deactivation is committed.

The existing atomic allocator remains authoritative: DRAFT gets no number;
POSTED gets the next number per org/year/series within the posting transaction.
Rollback does not consume a committed number. Unique voucher identity prevents
duplicates. A new year's series starts at 1. Twenty simultaneous real-PG posts
produce exactly 1–20. Names are presentation metadata; used codes cannot change.

Onboarding creates A. `/settings/voucher-series` lets users choose a real fiscal
year, create/edit/deactivate and inspect next number/use. OWNER/ADMIN can select
an active code as the organization default; voucher creation prefers it when
available, otherwise falls back to an available valid series. A default is a
code preference, not an authority to post outside that series' fiscal dates.
