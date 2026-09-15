-- Account descriptions support locally maintained chart-of-accounts notes.
ALTER TABLE "accounts"
  ADD COLUMN "description" VARCHAR(500);

-- Account-number lookups use the existing tenant-scoped unique B-tree index.
-- A trigram index makes case-insensitive name substring search practical without
-- introducing an external chart-of-accounts dataset.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "accounts_name_trgm_idx"
  ON "accounts" USING GIN ("name" gin_trgm_ops);
