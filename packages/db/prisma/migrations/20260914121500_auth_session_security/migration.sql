-- CreateEnum
CREATE TYPE "SessionRevocationReason" AS ENUM ('LOGOUT', 'ROTATED', 'REUSE_DETECTED', 'PASSWORD_CHANGED', 'ADMIN_REVOKED');

-- AlterTable: add nullable first so existing persisted sessions remain migratable.
ALTER TABLE "sessions"
  ADD COLUMN "absolute_expires_at" TIMESTAMPTZ(3),
  ADD COLUMN "family_id" UUID,
  ADD COLUMN "replaced_by_id" UUID,
  ADD COLUMN "revocation_reason" "SessionRevocationReason";

-- Existing sessions predate rotation. Treat each as a single-member family and
-- preserve its current expiry as the absolute expiry boundary.
UPDATE "sessions"
SET
  "absolute_expires_at" = "expires_at",
  "family_id" = "id"
WHERE "absolute_expires_at" IS NULL OR "family_id" IS NULL;

ALTER TABLE "sessions"
  ALTER COLUMN "absolute_expires_at" SET NOT NULL,
  ALTER COLUMN "family_id" SET NOT NULL;

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_absolute_expires_at_check"
  CHECK ("absolute_expires_at" >= "expires_at");

-- Replace the former user-only lookup with the access and rotation lookup paths.
DROP INDEX "sessions_user_id_idx";

CREATE UNIQUE INDEX "sessions_replaced_by_id_key" ON "sessions"("replaced_by_id");
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");
CREATE INDEX "sessions_family_id_revoked_at_idx" ON "sessions"("family_id", "revoked_at");

-- Prisma's normal unique constraint remains for generated-client support; this
-- expression index closes case-variant account registration at the database layer.
CREATE UNIQUE INDEX "users_email_lower_key" ON "users"(LOWER("email"));

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_replaced_by_id_fkey"
  FOREIGN KEY ("replaced_by_id") REFERENCES "sessions"("id")
  ON DELETE SET NULL ON UPDATE RESTRICT;
