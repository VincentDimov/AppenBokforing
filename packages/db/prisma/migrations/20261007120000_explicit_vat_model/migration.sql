-- Additive only: legacy posted rows remain unclassified; never guess or backfill history.
CREATE TYPE "VatLineRole" AS ENUM ('UNCLASSIFIED', 'BASE', 'TAX', 'NONE');
CREATE TYPE "VatReportingCategory" AS ENUM ('UNMAPPED', 'DOMESTIC_STANDARD', 'NONE');
ALTER TABLE "vat_codes"
  ADD COLUMN "configuration_version" VARCHAR(64) NOT NULL DEFAULT 'unreviewed',
  ADD COLUMN "reporting_category" "VatReportingCategory" NOT NULL DEFAULT 'UNMAPPED',
  ADD COLUMN "effective_from" DATE NOT NULL DEFAULT '1970-01-01',
  ADD COLUMN "effective_to" DATE,
  ADD CONSTRAINT "vat_codes_effective_dates_check" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from");
ALTER TABLE "journal_lines"
  ADD COLUMN "vat_role" "VatLineRole" NOT NULL DEFAULT 'UNCLASSIFIED',
  ADD COLUMN "vat_group" VARCHAR(64),
  ADD COLUMN "vat_snapshot" JSONB;
-- Existing posted-line UPDATE/DELETE trigger protects all columns, including these.
-- Extend reversal integrity without replacing or weakening the original inverse check.
CREATE FUNCTION public.enforce_correction_vat_metadata() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'POSTED' AND NEW."reverses_entry_id" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "journal_lines" o JOIN "journal_lines" r
      ON r."organization_id" = o."organization_id"
      AND r."journal_entry_id" = NEW."id" AND r."line_number" = o."line_number"
    WHERE o."organization_id" = NEW."organization_id"
      AND o."journal_entry_id" = NEW."reverses_entry_id"
      AND (o."vat_role" IS DISTINCT FROM r."vat_role"
        OR o."vat_group" IS DISTINCT FROM r."vat_group"
        OR o."vat_snapshot" IS DISTINCT FROM r."vat_snapshot")
  ) THEN
    RAISE EXCEPTION 'Correction must preserve original VAT metadata' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "journal_entries_correction_vat_integrity"
AFTER INSERT OR UPDATE ON "journal_entries" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_correction_vat_metadata();
