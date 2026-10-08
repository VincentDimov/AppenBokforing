ALTER TABLE voucher_series ADD COLUMN description VARCHAR(500);
CREATE FUNCTION public.protect_used_voucher_series() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM journal_entries WHERE voucher_series_id = OLD.id) THEN
      RAISE EXCEPTION 'SERIES_IN_USE' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.organization_id <> OLD.organization_id OR NEW.fiscal_year_id <> OLD.fiscal_year_id THEN
    RAISE EXCEPTION 'Series tenant/year is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.code <> OLD.code AND EXISTS (SELECT 1 FROM journal_entries WHERE voucher_series_id = OLD.id AND status = 'POSTED') THEN
    RAISE EXCEPTION 'SERIES_IN_USE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER used_voucher_series_guard BEFORE UPDATE OR DELETE ON voucher_series FOR EACH ROW EXECUTE FUNCTION public.protect_used_voucher_series();
