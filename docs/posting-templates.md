# Posting templates — FAS 30

The existing tenant-scoped PostingTemplate/PostingTemplateLine tables are reused.
Nullable NUMERIC(18,2) `amount` means user-entered amount; a value means a fixed
line amount. Each row has explicit DEBIT/CREDIT, account, optional project and
cost centre. No percentage engine, automatic balancing or accounting advice.

Forward migration adds default text and an optional series **code preference**.
A reusable template spans years, so it does not own a fiscal-year-specific series
foreign key. The editor uses that code only if available in the current calendar.
Normal journal APIs enforce the actual year/series/period and numbering.

GET/POST `/organizations/:id/posting-templates`; GET/PATCH `/:templateId`;
POST `/:templateId/apply`. Membership is required on all routes; established
CREATE_BOOKKEEPING permission restricts administration/application to OWNER,
ADMIN and ACCOUNTANT. Other active members may read. List is capped at 200 and
searches name/code. No delete API. Duplication is an explicit new template.

Creation/update and audit are atomic. Reference reads use row share locks to
serialize with deactivation. Same-tenant composite foreign keys remain intact.
Deactivation is audited as UPDATE with isActive=false; historical templates
remain readable. Applying rejects deactivated templates/references and returns
copied rows, not a mutable relation to posted bookkeeping.

`/bookkeeping/posting-templates` and its `/app` alias provide the editor.
New/draft vouchers require explicit row-replacement consent before application.
The resulting unsaved draft remains editable and is saved/posted through the
ordinary optimistic-versioned journal workflow. Later template changes cannot
alter a draft copy or POSTED entry. Snapshot application itself is a read and
does not generate noisy audit records. POSTED vouchers cannot apply templates.

Recovery already includes both tables; the new default fields must be retained
in backup fixtures. Decimal values remain strings; no browser amount summation
is introduced. Frontend instances are organization-keyed and late responses
are ignored on unmount. No production deployment is performed.
