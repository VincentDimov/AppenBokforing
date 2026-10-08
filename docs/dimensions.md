# Projects and cost centres — FAS 29

Existing Project/CostCenter models now have managed tenant register APIs:
`GET/POST /organizations/:id/projects`, `PATCH .../projects/:dimensionId`,
and the corresponding `/cost-centers` endpoints. Search matches code/name;
`activeOnly=true` restricts new-line choices. The UI lists all statuses, permits
safe edits/deactivation and never offers destructive deletion.
Routes: `/registers/projects`, `/registers/cost-centers` and `cost-centres` alias;
all have consistent `/app` aliases. OWNER/ADMIN/ACCOUNTANT write; others read.

Safe codes are uppercase ASCII letters/digits/underscore/hyphen, at most 32.
Names support Swedish characters; duplicate code is tenant-scoped. Cross-tenant
IDs/codes are untrusted and rejected. Used POSTED codes are immutable in API/DB;
foreign keys restrict deletion. Inactive objects remain available to history,
report filters and SIE but cannot be assigned to new accounting.

At posting the database locks referenced dimensions in UUID order, checks active
state and freezes `{id,code,name}` JSON on every assigned line. API presentation
reads these snapshots. Rename/deactivate vs posting has one consistent locked
outcome. POSTED line immutability protects JSON as well as money. Reversal copies
the original snapshots, not current metadata, even if the object is inactive.

Old POSTED lines get **no fabricated snapshot backfill**. If a used dimension
has legacy NULL snapshot, its name cannot be changed either. Legacy nulls remain
explicit; a migration cannot recreate unknown prior labels. This narrows
dimensions/account classification risks but does not close general P0-07.

Voucher typeaheads search code/name, only return active same-tenant choices and
support arrows/Enter/Escape. Posted vouchers display frozen/inactive labels.
Existing GL/income/TB filter semantics are retained: IB has no dimensions and
must not be silently allocated. Appropriate IB-dependent reports fail closed.

SIE retains cost centre=dimension 1, project=6. Export includes inactive objects
and selects the first chronologically posted frozen label per code (stable
voucher order), never today's renamed label for old posted use. SIE4 has one
`#OBJEKT` name per code and cannot represent multiple historical name versions;
this is an explicit loss boundary, not a lossless historical-label claim.
Import freezes labels from supported imported objects when posting; conflicting
existing dimension metadata is rejected. Independent reader and real-PG
round-trip tests cover safe identities, Swedish characters and snapshots.
Explicit zero SIE `#IB` rows are accepted without creating invalid zero DB rows.
