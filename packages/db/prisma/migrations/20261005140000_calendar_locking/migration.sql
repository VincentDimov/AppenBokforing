-- Serialize accounting writes with period locking and fiscal year closing.
CREATE FUNCTION public.require_writable_calendar(org UUID, year_id UUID, period_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE year_status "FiscalYearStatus"; period_status "AccountingPeriodStatus";
BEGIN
  SELECT status INTO year_status FROM fiscal_years
    WHERE id = year_id AND organization_id = org FOR UPDATE;
  IF NOT FOUND OR year_status <> 'OPEN' THEN
    RAISE EXCEPTION 'Fiscal year is closed or unavailable' USING ERRCODE = '55000';
  END IF;
  IF period_id IS NOT NULL THEN
    SELECT status INTO period_status FROM accounting_periods
      WHERE id = period_id AND fiscal_year_id = year_id AND organization_id = org FOR UPDATE;
    IF NOT FOUND OR period_status <> 'OPEN' THEN
      RAISE EXCEPTION 'Accounting period is locked or unavailable' USING ERRCODE = '55000';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM accounting_periods WHERE fiscal_year_id = year_id
      AND organization_id = org AND status = 'LOCKED') THEN
      RAISE EXCEPTION 'Opening balances cannot change after any period is locked' USING ERRCODE = '55000';
    END IF;
  END IF;
END;
$$;

CREATE FUNCTION public.protect_locked_accounting_records()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE record_data JSONB; parent_entry journal_entries%ROWTYPE; direction INTEGER;
BEGIN
  -- Validate both calendars so moving a locked draft cannot bypass its lock.
  FOR direction IN 1..2 LOOP
    IF direction = 1 THEN
      IF TG_OP = 'INSERT' THEN CONTINUE; END IF;
      record_data := to_jsonb(OLD);
    ELSE
      IF TG_OP = 'DELETE' THEN CONTINUE; END IF;
      record_data := to_jsonb(NEW);
    END IF;
    IF TG_TABLE_NAME IN ('journal_lines', 'attachments') THEN
      IF record_data->>'journal_entry_id' IS NULL THEN CONTINUE; END IF;
      SELECT * INTO parent_entry FROM journal_entries
        WHERE id = (record_data->>'journal_entry_id')::uuid
          AND organization_id = (record_data->>'organization_id')::uuid;
      IF NOT FOUND THEN RAISE EXCEPTION 'Accounting parent not found' USING ERRCODE = '23503'; END IF;
      PERFORM public.require_writable_calendar(parent_entry.organization_id,
        parent_entry.fiscal_year_id, parent_entry.accounting_period_id);
    ELSE
      PERFORM public.require_writable_calendar((record_data->>'organization_id')::uuid,
        (record_data->>'fiscal_year_id')::uuid, (record_data->>'accounting_period_id')::uuid);
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER calendar_write_guard BEFORE INSERT OR UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.protect_locked_accounting_records();
CREATE TRIGGER calendar_write_guard BEFORE INSERT OR UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.protect_locked_accounting_records();
CREATE TRIGGER calendar_write_guard BEFORE INSERT OR UPDATE OR DELETE ON opening_balances
  FOR EACH ROW EXECUTE FUNCTION public.protect_locked_accounting_records();
CREATE TRIGGER calendar_write_guard BEFORE INSERT OR UPDATE OR DELETE ON attachments
  FOR EACH ROW EXECUTE FUNCTION public.protect_locked_accounting_records();

CREATE FUNCTION public.protect_closed_calendar()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE year_status "FiscalYearStatus";
BEGIN
  IF TG_TABLE_NAME = 'fiscal_years' THEN
    IF OLD.status = 'CLOSED' THEN
      RAISE EXCEPTION 'Closed fiscal years cannot be modified or reopened' USING ERRCODE = '55000';
    END IF;
    IF NEW.status = 'CLOSED' AND (
      NOT EXISTS (SELECT 1 FROM accounting_periods WHERE fiscal_year_id = NEW.id)
      OR EXISTS (SELECT 1 FROM accounting_periods WHERE fiscal_year_id = NEW.id AND status <> 'LOCKED')
      OR EXISTS (SELECT 1 FROM journal_entries WHERE fiscal_year_id = NEW.id AND status = 'DRAFT')
    ) THEN
      RAISE EXCEPTION 'Close requires locked periods and no drafts' USING ERRCODE = '55000';
    END IF;
  ELSE
    SELECT status INTO year_status FROM fiscal_years
      WHERE id = NEW.fiscal_year_id AND organization_id = NEW.organization_id FOR UPDATE;
    IF year_status <> 'OPEN' THEN
      RAISE EXCEPTION 'Periods in closed years cannot change' USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER closed_calendar_guard BEFORE UPDATE ON fiscal_years
  FOR EACH ROW EXECUTE FUNCTION public.protect_closed_calendar();
CREATE TRIGGER closed_calendar_guard BEFORE INSERT OR UPDATE ON accounting_periods
  FOR EACH ROW EXECUTE FUNCTION public.protect_closed_calendar();
