BEGIN;
-- CreateEnum
CREATE TYPE "PlatformAdminRole" AS ENUM ('SUPER_ADMIN', 'PLATFORM_ADMIN', 'SUPPORT_ADMIN', 'PLATFORM_VIEWER');

-- CreateEnum
CREATE TYPE "UserAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "admin_mfa_verified_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "account_status" "UserAccountStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "admin_notes" VARCHAR(2000),
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "platform_administrators" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "PlatformAdminRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "mfa_required" BOOLEAN NOT NULL DEFAULT true,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by_id" UUID,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_administrators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_admin_mfa_credentials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "encrypted_secret" VARCHAR(500) NOT NULL,
    "key_id" VARCHAR(80) NOT NULL,
    "verified_at" TIMESTAMPTZ(3),
    "pending_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_used_counter" BIGINT NOT NULL DEFAULT -1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_admin_mfa_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_admin_recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" VARCHAR(255) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admin_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_admin_bootstrap" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "user_id" UUID NOT NULL,
    "completed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admin_bootstrap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_admin_audit_events" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "target_type" VARCHAR(80) NOT NULL,
    "target_id" UUID,
    "organization_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "result" VARCHAR(16) NOT NULL DEFAULT 'SUCCESS',
    "before_metadata" JSONB,
    "after_metadata" JSONB,
    "request_id" VARCHAR(100),
    "ip_metadata" VARCHAR(64),
    "timestamp" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admin_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_administrators_user_id_key" ON "platform_administrators"("user_id");

-- CreateIndex
CREATE INDEX "platform_administrators_role_is_active_revoked_at_idx" ON "platform_administrators"("role", "is_active", "revoked_at");

-- CreateIndex
CREATE INDEX "platform_administrators_granted_by_id_idx" ON "platform_administrators"("granted_by_id");

-- CreateIndex
CREATE INDEX "platform_administrators_revoked_by_id_idx" ON "platform_administrators"("revoked_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_admin_mfa_credentials_user_id_key" ON "platform_admin_mfa_credentials"("user_id");

-- CreateIndex
CREATE INDEX "platform_admin_recovery_codes_user_id_used_at_idx" ON "platform_admin_recovery_codes"("user_id", "used_at");

-- CreateIndex
CREATE UNIQUE INDEX "platform_admin_bootstrap_user_id_key" ON "platform_admin_bootstrap"("user_id");

-- CreateIndex
CREATE INDEX "platform_admin_audit_events_timestamp_id_idx" ON "platform_admin_audit_events"("timestamp", "id");

-- CreateIndex
CREATE INDEX "platform_admin_audit_events_actor_user_id_timestamp_idx" ON "platform_admin_audit_events"("actor_user_id", "timestamp");

-- CreateIndex
CREATE INDEX "platform_admin_audit_events_target_type_target_id_timestamp_idx" ON "platform_admin_audit_events"("target_type", "target_id", "timestamp");

-- CreateIndex
CREATE INDEX "platform_admin_audit_events_organization_id_timestamp_idx" ON "platform_admin_audit_events"("organization_id", "timestamp");

-- CreateIndex
CREATE INDEX "platform_admin_audit_events_action_result_timestamp_idx" ON "platform_admin_audit_events"("action", "result", "timestamp");

-- AddForeignKey
ALTER TABLE "platform_administrators" ADD CONSTRAINT "platform_administrators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "platform_administrators" ADD CONSTRAINT "platform_administrators_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "platform_administrators" ADD CONSTRAINT "platform_administrators_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "platform_admin_mfa_credentials" ADD CONSTRAINT "platform_admin_mfa_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "platform_admin_recovery_codes" ADD CONSTRAINT "platform_admin_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "platform_admin_bootstrap" ADD CONSTRAINT "platform_admin_bootstrap_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "platform_admin_audit_events" ADD CONSTRAINT "platform_admin_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE platform_admin_audit_events ADD CONSTRAINT platform_audit_organization_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE platform_administrators ADD CONSTRAINT platform_admin_mfa_mandatory CHECK (mfa_required = true);
ALTER TABLE platform_admin_bootstrap ADD CONSTRAINT platform_bootstrap_singleton CHECK (id = 1);
ALTER TABLE platform_admin_audit_events ADD CONSTRAINT platform_audit_result CHECK (result IN ('SUCCESS','DENIED','FAILURE'));
UPDATE users SET account_status = 'DEACTIVATED' WHERE is_active = false;

-- Explicit ICU dependency: consistent Swedish A-Z, Å, Ä, Ö ordering in the DB,
-- with UUID tie breakers in queries. No locale-dependent browser-side sorting.
CREATE COLLATION ledgerapp_admin_sv (provider = icu, locale = 'sv-SE', deterministic = true);
CREATE INDEX users_admin_swedish_name_idx ON users (display_name COLLATE ledgerapp_admin_sv, id);
CREATE INDEX users_admin_status_created_idx ON users(account_status,created_at,id);
CREATE INDEX users_admin_last_login_idx ON users(last_login_at,id);
CREATE INDEX organizations_admin_swedish_name_idx ON organizations(name COLLATE ledgerapp_admin_sv,id);
CREATE INDEX organizations_admin_status_created_idx ON organizations(is_active,created_at,id);
CREATE INDEX organization_members_admin_active_idx ON organization_members(user_id,organization_id,role) WHERE removed_at IS NULL;
CREATE INDEX organization_invitations_admin_pending_idx ON organization_invitations(expires_at,created_at) WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE FUNCTION public.platform_evidence_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Platform evidence is append-only' USING ERRCODE='55000'; END; $$;
CREATE TRIGGER platform_audit_immutable BEFORE UPDATE OR DELETE ON platform_admin_audit_events FOR EACH ROW EXECUTE FUNCTION public.platform_evidence_append_only();
CREATE TRIGGER platform_audit_no_truncate BEFORE TRUNCATE ON platform_admin_audit_events FOR EACH STATEMENT EXECUTE FUNCTION public.platform_evidence_append_only();
CREATE TRIGGER platform_bootstrap_immutable BEFORE UPDATE OR DELETE ON platform_admin_bootstrap FOR EACH ROW EXECUTE FUNCTION public.platform_evidence_append_only();
CREATE TRIGGER platform_bootstrap_no_truncate BEFORE TRUNCATE ON platform_admin_bootstrap FOR EACH STATEMENT EXECUTE FUNCTION public.platform_evidence_append_only();

CREATE FUNCTION public.platform_grant_serialization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(36036,1);
  IF TG_OP = 'UPDATE' AND NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'Platform grant identity is immutable' USING ERRCODE='55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER platform_grant_lock BEFORE INSERT OR UPDATE OR DELETE ON platform_administrators FOR EACH ROW EXECUTE FUNCTION public.platform_grant_serialization();

CREATE FUNCTION public.platform_last_super_admin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE was_super boolean;
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    was_super := EXISTS(SELECT 1 FROM platform_administrators WHERE user_id=OLD.id AND role='SUPER_ADMIN' AND is_active=true AND revoked_at IS NULL);
  ELSE
    was_super := OLD.role='SUPER_ADMIN' AND OLD.is_active=true AND OLD.revoked_at IS NULL;
  END IF;
  IF was_super AND NOT EXISTS (
    SELECT 1 FROM platform_administrators p JOIN users u ON u.id=p.user_id
    WHERE p.role='SUPER_ADMIN' AND p.is_active=true AND p.revoked_at IS NULL AND u.is_active=true
  ) THEN RAISE EXCEPTION 'LAST_SUPER_ADMIN_REQUIRED' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER last_platform_super_admin AFTER UPDATE OR DELETE ON platform_administrators DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.platform_last_super_admin();
CREATE CONSTRAINT TRIGGER last_platform_super_user AFTER UPDATE ON users DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.platform_last_super_admin();

CREATE FUNCTION public.sync_platform_user_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.is_active=false AND NEW.account_status='ACTIVE' THEN NEW.account_status:='DEACTIVATED';
    ELSE NEW.is_active := NEW.account_status='ACTIVE'; END IF;
  ELSIF NEW.account_status IS DISTINCT FROM OLD.account_status THEN
    PERFORM pg_advisory_xact_lock(36036,1);
    NEW.is_active := NEW.account_status='ACTIVE';
  ELSIF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    PERFORM pg_advisory_xact_lock(36036,1);
    NEW.account_status := CASE WHEN NEW.is_active THEN 'ACTIVE'::"UserAccountStatus" ELSE 'DEACTIVATED'::"UserAccountStatus" END;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER sync_platform_status BEFORE INSERT OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION public.sync_platform_user_status();

CREATE FUNCTION public.revoke_platform_credential_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='users' THEN
    IF NEW.password_hash IS DISTINCT FROM OLD.password_hash OR NEW.email IS DISTINCT FROM OLD.email OR (OLD.is_active AND NOT NEW.is_active) THEN
      UPDATE sessions SET revoked_at=now(), revocation_reason='ADMIN_REVOKED',updated_at=now() WHERE user_id=NEW.id AND revoked_at IS NULL;
    END IF;
  ELSE
    IF NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
      UPDATE sessions SET revoked_at=now(),revocation_reason='ADMIN_REVOKED',updated_at=now() WHERE user_id=NEW.user_id AND revoked_at IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER platform_user_session_revocation AFTER UPDATE ON users FOR EACH ROW EXECUTE FUNCTION public.revoke_platform_credential_sessions();
CREATE TRIGGER platform_grant_session_revocation AFTER UPDATE ON platform_administrators FOR EACH ROW EXECUTE FUNCTION public.revoke_platform_credential_sessions();

-- Prevent a concurrent login/refresh from creating a session after suspension.
CREATE FUNCTION public.require_active_session_user() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM users WHERE id=NEW.user_id AND is_active=true FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inactive user cannot create session' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER active_session_user BEFORE INSERT ON sessions FOR EACH ROW EXECUTE FUNCTION public.require_active_session_user();

-- A tenant deactivation and an in-flight accounting write serialize on the
-- organization row. Do not alter or replace any existing accounting guards.
CREATE FUNCTION public.require_active_accounting_organization() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tenant uuid;
BEGIN
  IF TG_OP='DELETE' THEN tenant:=OLD.organization_id; ELSE tenant:=NEW.organization_id; END IF;
  PERFORM id FROM organizations WHERE id=tenant AND is_active=true FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inactive organization cannot mutate accounting data' USING ERRCODE='55000'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['accounts','vat_codes','fiscal_years','accounting_periods','voucher_series','journal_entries','journal_lines','projects','cost_centers','attachments','posting_templates','posting_template_lines','opening_balances','sie_imports','sie_exports'] LOOP
    EXECUTE format('CREATE TRIGGER active_accounting_organization BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.require_active_accounting_organization()',table_name);
  END LOOP;
END; $$;
CREATE INDEX users_admin_created_idx ON users(created_at,id);
CREATE INDEX organizations_admin_created_idx ON organizations(created_at,id);
CREATE INDEX users_admin_search_name_idx ON users USING gin(display_name gin_trgm_ops);
CREATE INDEX users_admin_search_email_idx ON users USING gin(email gin_trgm_ops);
COMMIT;
