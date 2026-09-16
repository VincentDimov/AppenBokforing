-- A correction is a separately posted voucher. It points to its immutable
-- original through a tenant-scoped, restricted FK; the reciprocal API field is
-- derived from this unique relationship instead of duplicating ledger state.
ALTER TYPE "JournalEntrySource" ADD VALUE IF NOT EXISTS 'REVERSAL';

ALTER TABLE "journal_entries"
  RENAME COLUMN "reversal_of_entry_id" TO "reverses_entry_id";

ALTER TABLE "journal_entries"
  RENAME CONSTRAINT "journal_entries_reversal_of_entry_id_organization_id_fkey"
  TO "journal_entries_reverses_entry_id_organization_id_fkey";

ALTER INDEX "journal_entries_organization_id_reversal_of_entry_id_idx"
  RENAME TO "journal_entries_organization_id_reverses_entry_id_idx";

-- One source voucher can have exactly one full correction. PostgreSQL permits
-- multiple NULLs, so ordinary non-correction entries remain unaffected.
DROP INDEX "journal_entries_organization_id_reverses_entry_id_idx";

CREATE UNIQUE INDEX "journal_entries_reverses_entry_id_organization_id_key"
  ON "journal_entries" ("reverses_entry_id", "organization_id");

CREATE INDEX "journal_entries_organization_id_reverses_entry_id_idx"
  ON "journal_entries" ("organization_id", "reverses_entry_id");

ALTER TABLE "journal_entries"
  ADD CONSTRAINT "journal_entries_reverses_entry_not_self_check"
  CHECK ("reverses_entry_id" IS NULL OR "reverses_entry_id" <> "id");

-- Prisma cannot express the cross-row guarantee that a linked correction is a
-- posted reverse-image of its source. The constraint trigger is deferred so a
-- short transaction may create DRAFT + lines, then post the entry atomically.
CREATE OR REPLACE FUNCTION public.enforce_journal_entry_correction_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  correction RECORD;
  original RECORD;
  original_line_count INTEGER;
  correction_line_count INTEGER;
BEGIN
  SELECT
    "id",
    "organization_id",
    "reverses_entry_id",
    "source",
    "status"
    INTO correction
    FROM "journal_entries"
   WHERE "id" = NEW."id";

  -- A DRAFT removed within its transaction has no historical effect.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF correction."source"::text = 'REVERSAL'
     AND correction."reverses_entry_id" IS NULL THEN
    RAISE EXCEPTION 'A reversal journal entry must link to its original entry'
      USING ERRCODE = '23514';
  END IF;

  IF correction."reverses_entry_id" IS NULL THEN
    RETURN NULL;
  END IF;

  IF correction."status" <> 'POSTED' OR correction."source"::text <> 'REVERSAL' THEN
    RAISE EXCEPTION 'A correction must be a posted reversal journal entry'
      USING ERRCODE = '23514';
  END IF;

  SELECT "id", "source", "status"
    INTO original
    FROM "journal_entries"
   WHERE "id" = correction."reverses_entry_id"
     AND "organization_id" = correction."organization_id";

  IF NOT FOUND
     OR original."status" <> 'POSTED'
     OR original."source"::text = 'REVERSAL' THEN
    RAISE EXCEPTION 'A correction must reference one posted non-correction original entry'
      USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*)
    INTO original_line_count
    FROM "journal_lines"
   WHERE "organization_id" = correction."organization_id"
     AND "journal_entry_id" = correction."reverses_entry_id";

  SELECT COUNT(*)
    INTO correction_line_count
    FROM "journal_lines"
   WHERE "organization_id" = correction."organization_id"
     AND "journal_entry_id" = correction."id";

  IF original_line_count <> correction_line_count THEN
    RAISE EXCEPTION 'A correction must have the same number of lines as its original'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM "journal_lines" AS original_line
      LEFT JOIN "journal_lines" AS correction_line
        ON correction_line."organization_id" = original_line."organization_id"
       AND correction_line."journal_entry_id" = correction."id"
       AND correction_line."line_number" = original_line."line_number"
     WHERE original_line."organization_id" = correction."organization_id"
       AND original_line."journal_entry_id" = correction."reverses_entry_id"
       AND (
         correction_line."id" IS NULL
         OR correction_line."account_id" IS DISTINCT FROM original_line."account_id"
         OR correction_line."vat_code_id" IS DISTINCT FROM original_line."vat_code_id"
         OR correction_line."project_id" IS DISTINCT FROM original_line."project_id"
         OR correction_line."cost_center_id" IS DISTINCT FROM original_line."cost_center_id"
         OR correction_line."description" IS DISTINCT FROM original_line."description"
         OR correction_line."quantity" IS DISTINCT FROM original_line."quantity"
         OR correction_line."unit" IS DISTINCT FROM original_line."unit"
         OR correction_line."debit_amount" <> original_line."credit_amount"
         OR correction_line."credit_amount" <> original_line."debit_amount"
       )
  ) THEN
    RAISE EXCEPTION 'Correction journal lines must be exact debit-credit opposites of the original'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "journal_entries_correction_integrity"
AFTER INSERT OR UPDATE ON "journal_entries"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.enforce_journal_entry_correction_integrity();
