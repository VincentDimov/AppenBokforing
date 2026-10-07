ALTER TABLE journal_entries ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_version_positive CHECK (version > 0);
