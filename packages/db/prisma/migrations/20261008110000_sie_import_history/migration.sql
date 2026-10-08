-- Metadata-only history does not fabricate an attachment/storage key.
-- Existing source attachments and their composite RESTRICT FK are preserved.
ALTER TABLE sie_imports ALTER COLUMN source_attachment_id DROP NOT NULL;
ALTER TABLE sie_imports ADD COLUMN source_file_name VARCHAR(160),
  ADD COLUMN source_sha256 CHAR(64), ADD COLUMN summary JSONB;
ALTER TABLE sie_imports ADD CONSTRAINT sie_import_source_hash_check
  CHECK (source_sha256 IS NULL OR source_sha256 ~ '^[a-f0-9]{64}$');
