-- Phase 8: an attachment is durable accounting evidence.  Keep the existing
-- tenant-safe foreign keys and RESTRICT actions; this migration only tightens
-- metadata that is produced by the upload service.

-- Do not invent a checksum for an existing object. A deployment containing
-- legacy rows without one must be remediated explicitly before this invariant
-- is enabled.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "attachments" WHERE "sha256" IS NULL) THEN
    RAISE EXCEPTION
      'Cannot require attachment SHA-256: one or more existing attachments have no checksum.';
  END IF;
END $$;

ALTER TABLE "attachments"
  ALTER COLUMN "sha256" SET NOT NULL;

ALTER TABLE "attachments"
  DROP CONSTRAINT "attachments_byte_size_check",
  ADD CONSTRAINT "attachments_size_range_check"
    CHECK ("byte_size" > 0 AND "byte_size" <= 10485760),
  ADD CONSTRAINT "attachments_sha256_lower_hex_check"
    CHECK ("sha256" ~ '^[0-9a-f]{64}$');

-- Listing evidence for a voucher is always tenant-scoped and newest-first.
DROP INDEX "attachments_organization_id_journal_entry_id_idx";
CREATE INDEX "attachments_organization_id_journal_entry_id_created_at_idx"
  ON "attachments"("organization_id", "journal_entry_id", "created_at" DESC);
