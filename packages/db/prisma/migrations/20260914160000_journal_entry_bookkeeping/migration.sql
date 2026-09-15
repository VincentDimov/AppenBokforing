-- Query journal entries by tenant, fiscal year and transaction date without a
-- full tenant scan. The existing (organization_id, entry_date) index remains
-- useful for cross-year views.
CREATE INDEX "journal_entries_organization_id_fiscal_year_id_entry_date_idx"
  ON "journal_entries" ("organization_id", "fiscal_year_id", "entry_date");

-- Tighten the existing deferred balance guard. A balanced posted entry must
-- have at least two persisted rows as well as equal non-zero totals.
CREATE OR REPLACE FUNCTION public.enforce_posted_journal_entry_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  affected_entry_id UUID;
  affected_status "JournalEntryStatus";
  debit_total NUMERIC(18, 2);
  credit_total NUMERIC(18, 2);
  line_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    affected_entry_id := COALESCE(NEW."id", OLD."id");
  ELSE
    affected_entry_id := COALESCE(NEW."journal_entry_id", OLD."journal_entry_id");
  END IF;

  SELECT "status"
    INTO affected_status
    FROM "journal_entries"
   WHERE "id" = affected_entry_id;

  IF NOT FOUND OR affected_status = 'DRAFT' THEN
    RETURN NULL;
  END IF;

  SELECT
    COUNT(*),
    COALESCE(SUM("debit_amount"), 0),
    COALESCE(SUM("credit_amount"), 0)
    INTO line_count, debit_total, credit_total
    FROM "journal_lines"
   WHERE "journal_entry_id" = affected_entry_id;

  IF line_count < 2 OR debit_total <= 0 OR debit_total <> credit_total THEN
    RAISE EXCEPTION
      'Posted journal entry % must have at least two balanced non-zero lines',
      affected_entry_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

-- A journal entry must always point at the one fiscal year and accounting
-- period that contains its transaction date. Posting additionally requires an
-- open fiscal year and an unlocked period.
CREATE FUNCTION public.enforce_journal_entry_calendar_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  fiscal_year_status "FiscalYearStatus";
  fiscal_year_start DATE;
  fiscal_year_end DATE;
  accounting_period_status "AccountingPeriodStatus";
  accounting_period_start DATE;
  accounting_period_end DATE;
BEGIN
  SELECT "status", "start_date", "end_date"
    INTO fiscal_year_status, fiscal_year_start, fiscal_year_end
    FROM "fiscal_years"
   WHERE "id" = NEW."fiscal_year_id"
     AND "organization_id" = NEW."organization_id";

  IF NOT FOUND
     OR NEW."entry_date" < fiscal_year_start
     OR NEW."entry_date" > fiscal_year_end THEN
    RAISE EXCEPTION 'Journal entry date must belong to its fiscal year'
      USING ERRCODE = '23514';
  END IF;

  SELECT "status", "start_date", "end_date"
    INTO accounting_period_status, accounting_period_start, accounting_period_end
    FROM "accounting_periods"
   WHERE "id" = NEW."accounting_period_id"
     AND "organization_id" = NEW."organization_id"
     AND "fiscal_year_id" = NEW."fiscal_year_id";

  IF NOT FOUND
     OR NEW."entry_date" < accounting_period_start
     OR NEW."entry_date" > accounting_period_end THEN
    RAISE EXCEPTION 'Journal entry date must belong to its accounting period'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."status" IN ('POSTED', 'REVERSED') THEN
    IF fiscal_year_status <> 'OPEN' THEN
      RAISE EXCEPTION 'A closed fiscal year cannot receive a posted journal entry'
        USING ERRCODE = '55000';
    END IF;

    IF accounting_period_status <> 'OPEN' THEN
      RAISE EXCEPTION 'A locked accounting period cannot receive a posted journal entry'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "journal_entries_calendar_scope"
BEFORE INSERT OR UPDATE ON "journal_entries"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_journal_entry_calendar_scope();

-- POSTED and REVERSED records are ledger history. A DRAFT may be amended or
-- transitioned to POSTED, but a historical entry cannot be changed or deleted.
CREATE FUNCTION public.prevent_posted_journal_entry_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" IN ('POSTED', 'REVERSED') THEN
      RAISE EXCEPTION 'Posted journal entries are immutable'
        USING ERRCODE = '55000';
    END IF;

    RETURN OLD;
  END IF;

  IF OLD."status" IN ('POSTED', 'REVERSED') THEN
    RAISE EXCEPTION 'Posted journal entries are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."status" <> 'DRAFT' OR NEW."status" NOT IN ('DRAFT', 'POSTED') THEN
    RAISE EXCEPTION 'Journal entries may only transition from DRAFT to POSTED'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "journal_entries_immutable_after_posting"
BEFORE UPDATE OR DELETE ON "journal_entries"
FOR EACH ROW
EXECUTE FUNCTION public.prevent_posted_journal_entry_changes();

-- Lines inherit the lifecycle of their parent entry, closing the direct-SQL
-- loophole where a posted entry could otherwise remain balanced but be altered.
CREATE FUNCTION public.prevent_posted_journal_line_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  old_entry_status "JournalEntryStatus";
  new_entry_status "JournalEntryStatus";
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT "status"
      INTO old_entry_status
      FROM "journal_entries"
     WHERE "id" = OLD."journal_entry_id"
       AND "organization_id" = OLD."organization_id";

    IF old_entry_status IN ('POSTED', 'REVERSED') THEN
      RAISE EXCEPTION 'Lines on posted journal entries are immutable'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT "status"
      INTO new_entry_status
      FROM "journal_entries"
     WHERE "id" = NEW."journal_entry_id"
       AND "organization_id" = NEW."organization_id";

    IF new_entry_status IN ('POSTED', 'REVERSED') THEN
      RAISE EXCEPTION 'Lines on posted journal entries are immutable'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "journal_lines_immutable_after_posting"
BEFORE INSERT OR UPDATE OR DELETE ON "journal_lines"
FOR EACH ROW
EXECUTE FUNCTION public.prevent_posted_journal_line_changes();
