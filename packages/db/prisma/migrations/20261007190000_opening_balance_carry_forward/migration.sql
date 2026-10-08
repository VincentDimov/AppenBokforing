CREATE TABLE year_carry_forwards (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  source_fiscal_year_id UUID NOT NULL, target_fiscal_year_id UUID NOT NULL, result_account_id UUID NOT NULL,
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  fingerprint CHAR(64) NOT NULL, expires_at TIMESTAMPTZ(3) NOT NULL, confirmed_at TIMESTAMPTZ(3), created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  FOREIGN KEY (source_fiscal_year_id, organization_id) REFERENCES fiscal_years(id,organization_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (target_fiscal_year_id, organization_id) REFERENCES fiscal_years(id,organization_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (result_account_id, organization_id) REFERENCES accounts(id,organization_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (source_fiscal_year_id <> target_fiscal_year_id)
);
CREATE INDEX year_carry_forwards_organization_id_target_fiscal_year_id_idx ON year_carry_forwards(organization_id,target_fiscal_year_id);
CREATE UNIQUE INDEX one_confirmed_carry_forward_per_target ON year_carry_forwards(organization_id,target_fiscal_year_id) WHERE confirmed_at IS NOT NULL;
CREATE FUNCTION public.freeze_opening_balance_after_posting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN row_data := to_jsonb(OLD); ELSE row_data := to_jsonb(NEW); END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE organization_id = (row_data->>'organization_id')::uuid AND fiscal_year_id = (row_data->>'fiscal_year_id')::uuid AND status = 'POSTED') THEN
    RAISE EXCEPTION 'OPENING_BALANCE_LOCKED_AFTER_POSTING' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.organization_id <> OLD.organization_id OR NEW.fiscal_year_id <> OLD.fiscal_year_id) THEN
    RAISE EXCEPTION 'Opening balance scope is immutable' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
CREATE TRIGGER opening_balance_posted_guard BEFORE INSERT OR UPDATE OR DELETE ON opening_balances FOR EACH ROW EXECUTE FUNCTION public.freeze_opening_balance_after_posting();

-- Protect the account classification used by IB/carry/report calculation.
-- Presentation-name changes remain a documented legacy metadata gap.
CREATE FUNCTION public.freeze_account_classification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id THEN RAISE EXCEPTION 'Account tenant is immutable' USING ERRCODE = '55000'; END IF;
  IF (NEW.account_number, NEW.type, NEW.normal_balance) IS DISTINCT FROM (OLD.account_number, OLD.type, OLD.normal_balance)
    AND (EXISTS (SELECT 1 FROM opening_balances WHERE account_id = OLD.id)
      OR EXISTS (SELECT 1 FROM journal_lines l JOIN journal_entries e ON e.id = l.journal_entry_id WHERE l.account_id = OLD.id AND e.status = 'POSTED')) THEN
    RAISE EXCEPTION 'ACCOUNT_CLASSIFICATION_IN_USE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER account_classification_guard BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION public.freeze_account_classification();
