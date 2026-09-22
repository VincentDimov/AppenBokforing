-- General ledger filters organization and fiscal year by equality, then date.
CREATE INDEX "journal_entries_general_ledger_posted_idx"
  ON "journal_entries" ("organization_id", "fiscal_year_id", "entry_date")
  WHERE "status" = 'POSTED';
