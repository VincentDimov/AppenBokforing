-- Preserve supplied SIE line dates; existing history is not rewritten.
ALTER TABLE "journal_lines" ADD COLUMN "transaction_date" DATE;
CREATE FUNCTION public.enforce_correction_line_date() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'POSTED' AND NEW.reverses_entry_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM journal_lines o JOIN journal_lines r
      ON r.organization_id = o.organization_id AND r.journal_entry_id = NEW.id
        AND r.line_number = o.line_number
    WHERE o.organization_id = NEW.organization_id AND o.journal_entry_id = NEW.reverses_entry_id
      AND o.transaction_date IS DISTINCT FROM r.transaction_date
  ) THEN
    RAISE EXCEPTION 'Correction must preserve original line date' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER journal_entries_correction_line_date
AFTER INSERT OR UPDATE ON journal_entries DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_correction_line_date();
