ALTER TABLE projects ADD COLUMN description VARCHAR(500);
ALTER TABLE cost_centers ADD COLUMN description VARCHAR(500);
ALTER TABLE journal_lines ADD COLUMN project_snapshot JSONB, ADD COLUMN cost_center_snapshot JSONB;
-- No retrospective backfill: current labels cannot prove historical labels.
CREATE FUNCTION public.protect_dimension_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE used BOOLEAN; legacy BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; -- FK RESTRICT protects referenced dimensions.
  IF NEW.organization_id <> OLD.organization_id THEN RAISE EXCEPTION 'Dimension tenant is immutable' USING ERRCODE = '55000'; END IF;
  IF TG_TABLE_NAME = 'projects' THEN
    SELECT EXISTS(SELECT 1 FROM journal_lines l JOIN journal_entries e ON e.id=l.journal_entry_id WHERE l.project_id=OLD.id AND e.status='POSTED'),
      EXISTS(SELECT 1 FROM journal_lines l JOIN journal_entries e ON e.id=l.journal_entry_id WHERE l.project_id=OLD.id AND e.status='POSTED' AND l.project_snapshot IS NULL) INTO used,legacy;
  ELSE
    SELECT EXISTS(SELECT 1 FROM journal_lines l JOIN journal_entries e ON e.id=l.journal_entry_id WHERE l.cost_center_id=OLD.id AND e.status='POSTED'),
      EXISTS(SELECT 1 FROM journal_lines l JOIN journal_entries e ON e.id=l.journal_entry_id WHERE l.cost_center_id=OLD.id AND e.status='POSTED' AND l.cost_center_snapshot IS NULL) INTO used,legacy;
  END IF;
  IF used AND NEW.code <> OLD.code THEN RAISE EXCEPTION 'DIMENSION_CODE_IN_USE' USING ERRCODE='55000'; END IF;
  IF legacy AND NEW.name <> OLD.name THEN RAISE EXCEPTION 'LEGACY_DIMENSION_LABEL_IN_USE' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER dimension_identity_guard BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION public.protect_dimension_identity();
CREATE TRIGGER dimension_identity_guard BEFORE UPDATE ON cost_centers FOR EACH ROW EXECUTE FUNCTION public.protect_dimension_identity();

CREATE FUNCTION public.snapshot_dimensions_on_post() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'POSTED' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'POSTED' THEN RETURN NEW; END IF;
  -- Stable table + UUID order serializes name edits/deactivation with every post path.
  PERFORM p.id FROM projects p WHERE p.id IN (SELECT project_id FROM journal_lines WHERE journal_entry_id=NEW.id) ORDER BY p.id FOR SHARE;
  PERFORM c.id FROM cost_centers c WHERE c.id IN (SELECT cost_center_id FROM journal_lines WHERE journal_entry_id=NEW.id) ORDER BY c.id FOR SHARE;
  IF NEW.reverses_entry_id IS NOT NULL THEN
    UPDATE journal_lines r SET project_snapshot=o.project_snapshot, cost_center_snapshot=o.cost_center_snapshot
      FROM journal_lines o WHERE r.journal_entry_id=NEW.id AND o.journal_entry_id=NEW.reverses_entry_id AND r.organization_id=o.organization_id AND r.line_number=o.line_number;
  ELSE
    IF EXISTS (SELECT 1 FROM journal_lines l LEFT JOIN projects p ON p.id=l.project_id LEFT JOIN cost_centers c ON c.id=l.cost_center_id WHERE l.journal_entry_id=NEW.id AND ((p.id IS NOT NULL AND NOT p.is_active) OR (c.id IS NOT NULL AND NOT c.is_active))) THEN
      RAISE EXCEPTION 'DIMENSION_INACTIVE' USING ERRCODE='55000';
    END IF;
    UPDATE journal_lines l SET
      project_snapshot=(SELECT jsonb_build_object('id',p.id,'code',p.code,'name',p.name) FROM projects p WHERE p.id=l.project_id AND p.organization_id=l.organization_id),
      cost_center_snapshot=(SELECT jsonb_build_object('id',c.id,'code',c.code,'name',c.name) FROM cost_centers c WHERE c.id=l.cost_center_id AND c.organization_id=l.organization_id)
      WHERE l.journal_entry_id=NEW.id AND l.organization_id=NEW.organization_id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER snapshot_dimensions BEFORE INSERT OR UPDATE ON journal_entries FOR EACH ROW EXECUTE FUNCTION public.snapshot_dimensions_on_post();
CREATE FUNCTION public.enforce_correction_dimension_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='POSTED' AND NEW.reverses_entry_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM journal_lines o JOIN journal_lines r ON r.organization_id=o.organization_id AND r.journal_entry_id=NEW.id AND r.line_number=o.line_number
      WHERE o.journal_entry_id=NEW.reverses_entry_id AND (o.project_snapshot IS DISTINCT FROM r.project_snapshot OR o.cost_center_snapshot IS DISTINCT FROM r.cost_center_snapshot)
  ) THEN RAISE EXCEPTION 'Correction must preserve dimension snapshots' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER correction_dimension_integrity AFTER INSERT OR UPDATE ON journal_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.enforce_correction_dimension_metadata();
