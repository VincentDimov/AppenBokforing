-- Actual archive predicates: tenant + descending time/id; ILIKE filename search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX attachments_organization_id_created_at_id_idx
  ON attachments(organization_id, created_at DESC, id DESC);
CREATE INDEX attachments_original_name_trgm_idx
  ON attachments USING GIN (original_file_name gin_trgm_ops);
