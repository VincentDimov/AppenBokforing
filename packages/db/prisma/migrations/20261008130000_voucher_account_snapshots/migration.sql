ALTER TABLE journal_lines ADD COLUMN account_snapshot JSONB;
-- No backfill: today's labels do not prove historical labels.
CREATE FUNCTION public.snapshot_accounts_on_post() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'POSTED' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'POSTED' THEN RETURN NEW; END IF;
  PERFORM a.id FROM accounts a WHERE a.id IN (SELECT account_id FROM journal_lines WHERE journal_entry_id=NEW.id) ORDER BY a.id FOR SHARE;
  IF NEW.reverses_entry_id IS NOT NULL THEN
    UPDATE journal_lines r SET account_snapshot=o.account_snapshot FROM journal_lines o
      WHERE r.journal_entry_id=NEW.id AND o.journal_entry_id=NEW.reverses_entry_id AND r.organization_id=o.organization_id AND r.line_number=o.line_number;
  ELSE
    UPDATE journal_lines l SET account_snapshot=(SELECT jsonb_build_object('id',a.id,'number',a.account_number,'name',a.name) FROM accounts a WHERE a.id=l.account_id AND a.organization_id=l.organization_id)
      WHERE l.journal_entry_id=NEW.id AND l.organization_id=NEW.organization_id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER snapshot_accounts BEFORE INSERT OR UPDATE ON journal_entries FOR EACH ROW EXECUTE FUNCTION public.snapshot_accounts_on_post();
CREATE FUNCTION public.protect_legacy_account_label() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name <> OLD.name AND EXISTS(SELECT 1 FROM journal_lines l JOIN journal_entries e ON e.id=l.journal_entry_id WHERE l.account_id=OLD.id AND e.status='POSTED' AND l.account_snapshot IS NULL) THEN
    RAISE EXCEPTION 'LEGACY_ACCOUNT_LABEL_IN_USE' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER legacy_account_label_guard BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION public.protect_legacy_account_label();
CREATE FUNCTION public.enforce_correction_account_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='POSTED' AND NEW.reverses_entry_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM journal_lines o JOIN journal_lines r ON r.organization_id=o.organization_id AND r.journal_entry_id=NEW.id AND r.line_number=o.line_number
      WHERE o.journal_entry_id=NEW.reverses_entry_id AND o.account_snapshot IS DISTINCT FROM r.account_snapshot
  ) THEN RAISE EXCEPTION 'Correction must preserve account snapshots' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER correction_account_integrity AFTER INSERT OR UPDATE ON journal_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.enforce_correction_account_metadata();
