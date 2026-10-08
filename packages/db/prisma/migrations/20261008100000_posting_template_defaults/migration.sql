-- Templates are mutable draft suggestions, never a historical accounting source.
ALTER TABLE posting_templates ADD COLUMN default_text VARCHAR(500),
  ADD COLUMN voucher_series_code VARCHAR(16);
ALTER TABLE posting_templates ADD CONSTRAINT posting_template_series_code_check
  CHECK (voucher_series_code IS NULL OR voucher_series_code ~ '^[A-Z0-9_-]{1,16}$');
