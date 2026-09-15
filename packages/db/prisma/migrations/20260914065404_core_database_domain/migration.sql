/*
  Warnings:

  - You are about to drop the `bootstrap_markers` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "OrganizationMemberRole" AS ENUM ('OWNER', 'ADMIN', 'ACCOUNTANT', 'MEMBER', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "FiscalYearStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "AccountingPeriodStatus" AS ENUM ('OPEN', 'LOCKED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "BalanceSide" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "VatCodeType" AS ENUM ('INPUT', 'OUTPUT', 'EXEMPT');

-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "JournalEntrySource" AS ENUM ('MANUAL', 'POSTING_TEMPLATE', 'OPENING_BALANCE', 'SIE_IMPORT');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('VOUCHER', 'SUPPORTING_DOCUMENT', 'SIE_IMPORT_FILE', 'SIE_EXPORT_FILE', 'OTHER');

-- CreateEnum
CREATE TYPE "SieJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'POST', 'REVERSE', 'LOCK', 'UNLOCK', 'IMPORT', 'EXPORT');

-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM ('USER', 'ORGANIZATION', 'ORGANIZATION_MEMBER', 'FISCAL_YEAR', 'ACCOUNTING_PERIOD', 'ACCOUNT', 'VAT_CODE', 'VOUCHER_SERIES', 'JOURNAL_ENTRY', 'JOURNAL_LINE', 'PROJECT', 'COST_CENTER', 'ATTACHMENT', 'POSTING_TEMPLATE', 'OPENING_BALANCE', 'SIE_IMPORT', 'SIE_EXPORT');

-- DropTable
DROP TABLE "public"."bootstrap_markers";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "display_name" VARCHAR(160) NOT NULL,
    "password_hash" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "last_seen_at" TIMESTAMPTZ(3),
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "organization_number" VARCHAR(32),
    "default_currency" VARCHAR(3) NOT NULL DEFAULT 'SEK',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "OrganizationMemberRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_years" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "FiscalYearStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMPTZ(3),
    "closed_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_periods" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "period_number" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "locked_at" TIMESTAMPTZ(3),
    "locked_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vat_codes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "type" "VatCodeType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vat_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "account_number" VARCHAR(16) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "type" "AccountType" NOT NULL,
    "normal_balance" "BalanceSide" NOT NULL,
    "vat_code_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_series" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "next_voucher_number" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "voucher_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sie_imports" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "fiscal_year_id" UUID,
    "source_attachment_id" UUID NOT NULL,
    "status" "SieJobStatus" NOT NULL DEFAULT 'PENDING',
    "source_system" VARCHAR(160),
    "imported_by_id" UUID,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "imported_entry_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_entry_count" INTEGER NOT NULL DEFAULT 0,
    "error_details" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sie_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "accounting_period_id" UUID NOT NULL,
    "voucher_series_id" UUID,
    "voucher_number" INTEGER,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "JournalEntrySource" NOT NULL DEFAULT 'MANUAL',
    "entry_date" DATE NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "reference" VARCHAR(160),
    "created_by_id" UUID,
    "posted_by_id" UUID,
    "posted_at" TIMESTAMPTZ(3),
    "reversal_of_entry_id" UUID,
    "sie_import_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "vat_code_id" UUID,
    "project_id" UUID,
    "cost_center_id" UUID,
    "line_number" INTEGER NOT NULL,
    "description" VARCHAR(500),
    "debit_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "quantity" DECIMAL(18,4),
    "unit" VARCHAR(20),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "journal_entry_id" UUID,
    "storage_key" VARCHAR(512) NOT NULL,
    "original_file_name" VARCHAR(512) NOT NULL,
    "safe_file_name" VARCHAR(512) NOT NULL,
    "mime_type" VARCHAR(160) NOT NULL,
    "byte_size" BIGINT NOT NULL,
    "sha256" CHAR(64),
    "kind" "AttachmentKind" NOT NULL DEFAULT 'SUPPORTING_DOCUMENT',
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posting_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "posting_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posting_template_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "posting_template_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "vat_code_id" UUID,
    "project_id" UUID,
    "cost_center_id" UUID,
    "line_number" INTEGER NOT NULL,
    "side" "BalanceSide" NOT NULL,
    "amount" DECIMAL(18,2),
    "description" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "posting_template_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_balances" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "debit_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "opening_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" "AuditAction" NOT NULL,
    "entity_type" "AuditEntityType" NOT NULL,
    "entity_id" UUID,
    "before_data" JSONB,
    "after_data" JSONB,
    "metadata" JSONB,
    "ip_address" VARCHAR(64),
    "request_id" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sie_exports" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "output_attachment_id" UUID,
    "status" "SieJobStatus" NOT NULL DEFAULT 'PENDING',
    "exported_by_id" UUID,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "exported_entry_count" INTEGER NOT NULL DEFAULT 0,
    "error_details" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sie_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_organization_number_key" ON "organizations"("organization_number");

-- CreateIndex
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_id_organization_id_key" ON "organization_members"("id", "organization_id");

-- CreateIndex
CREATE INDEX "fiscal_years_organization_id_start_date_end_date_idx" ON "fiscal_years"("organization_id", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_years_organization_id_name_key" ON "fiscal_years"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_years_organization_id_start_date_key" ON "fiscal_years"("organization_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_years_id_organization_id_key" ON "fiscal_years"("id", "organization_id");

-- CreateIndex
CREATE INDEX "accounting_periods_organization_id_status_idx" ON "accounting_periods"("organization_id", "status");

-- CreateIndex
CREATE INDEX "accounting_periods_organization_id_fiscal_year_id_start_dat_idx" ON "accounting_periods"("organization_id", "fiscal_year_id", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_periods_organization_id_fiscal_year_id_period_nu_key" ON "accounting_periods"("organization_id", "fiscal_year_id", "period_number");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_periods_id_organization_id_fiscal_year_id_key" ON "accounting_periods"("id", "organization_id", "fiscal_year_id");

-- CreateIndex
CREATE INDEX "vat_codes_organization_id_type_is_active_idx" ON "vat_codes"("organization_id", "type", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "vat_codes_organization_id_code_key" ON "vat_codes"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "vat_codes_id_organization_id_key" ON "vat_codes"("id", "organization_id");

-- CreateIndex
CREATE INDEX "accounts_organization_id_type_is_active_idx" ON "accounts"("organization_id", "type", "is_active");

-- CreateIndex
CREATE INDEX "accounts_organization_id_vat_code_id_idx" ON "accounts"("organization_id", "vat_code_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_organization_id_account_number_key" ON "accounts"("organization_id", "account_number");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_id_organization_id_key" ON "accounts"("id", "organization_id");

-- CreateIndex
CREATE INDEX "voucher_series_organization_id_fiscal_year_id_is_active_idx" ON "voucher_series"("organization_id", "fiscal_year_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_series_organization_id_fiscal_year_id_code_key" ON "voucher_series"("organization_id", "fiscal_year_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_series_id_organization_id_fiscal_year_id_key" ON "voucher_series"("id", "organization_id", "fiscal_year_id");

-- CreateIndex
CREATE INDEX "projects_organization_id_is_active_idx" ON "projects"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "projects_organization_id_code_key" ON "projects"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "projects_id_organization_id_key" ON "projects"("id", "organization_id");

-- CreateIndex
CREATE INDEX "cost_centers_organization_id_is_active_idx" ON "cost_centers"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_organization_id_code_key" ON "cost_centers"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_id_organization_id_key" ON "cost_centers"("id", "organization_id");

-- CreateIndex
CREATE INDEX "sie_imports_organization_id_status_created_at_idx" ON "sie_imports"("organization_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sie_imports_organization_id_source_attachment_id_key" ON "sie_imports"("organization_id", "source_attachment_id");

-- CreateIndex
CREATE UNIQUE INDEX "sie_imports_id_organization_id_key" ON "sie_imports"("id", "organization_id");

-- CreateIndex
CREATE INDEX "journal_entries_organization_id_entry_date_idx" ON "journal_entries"("organization_id", "entry_date");

-- CreateIndex
CREATE INDEX "journal_entries_organization_id_status_entry_date_idx" ON "journal_entries"("organization_id", "status", "entry_date");

-- CreateIndex
CREATE INDEX "journal_entries_organization_id_accounting_period_id_idx" ON "journal_entries"("organization_id", "accounting_period_id");

-- CreateIndex
CREATE INDEX "journal_entries_organization_id_reversal_of_entry_id_idx" ON "journal_entries"("organization_id", "reversal_of_entry_id");

-- CreateIndex
CREATE INDEX "journal_entries_organization_id_sie_import_id_idx" ON "journal_entries"("organization_id", "sie_import_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_organization_id_fiscal_year_id_voucher_seri_key" ON "journal_entries"("organization_id", "fiscal_year_id", "voucher_series_id", "voucher_number");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_id_organization_id_key" ON "journal_entries"("id", "organization_id");

-- CreateIndex
CREATE INDEX "journal_lines_organization_id_account_id_idx" ON "journal_lines"("organization_id", "account_id");

-- CreateIndex
CREATE INDEX "journal_lines_organization_id_vat_code_id_idx" ON "journal_lines"("organization_id", "vat_code_id");

-- CreateIndex
CREATE INDEX "journal_lines_organization_id_project_id_idx" ON "journal_lines"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "journal_lines_organization_id_cost_center_id_idx" ON "journal_lines"("organization_id", "cost_center_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_lines_organization_id_journal_entry_id_line_number_key" ON "journal_lines"("organization_id", "journal_entry_id", "line_number");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storage_key_key" ON "attachments"("storage_key");

-- CreateIndex
CREATE INDEX "attachments_organization_id_journal_entry_id_idx" ON "attachments"("organization_id", "journal_entry_id");

-- CreateIndex
CREATE INDEX "attachments_organization_id_sha256_idx" ON "attachments"("organization_id", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_id_organization_id_key" ON "attachments"("id", "organization_id");

-- CreateIndex
CREATE INDEX "posting_templates_organization_id_is_active_idx" ON "posting_templates"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "posting_templates_organization_id_code_key" ON "posting_templates"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "posting_templates_id_organization_id_key" ON "posting_templates"("id", "organization_id");

-- CreateIndex
CREATE INDEX "posting_template_lines_organization_id_account_id_idx" ON "posting_template_lines"("organization_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "posting_template_lines_organization_id_posting_template_id__key" ON "posting_template_lines"("organization_id", "posting_template_id", "line_number");

-- CreateIndex
CREATE INDEX "opening_balances_organization_id_fiscal_year_id_idx" ON "opening_balances"("organization_id", "fiscal_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "opening_balances_organization_id_fiscal_year_id_account_id_key" ON "opening_balances"("organization_id", "fiscal_year_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "opening_balances_id_organization_id_key" ON "opening_balances"("id", "organization_id");

-- CreateIndex
CREATE INDEX "audit_events_organization_id_created_at_idx" ON "audit_events"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_organization_id_entity_type_entity_id_idx" ON "audit_events"("organization_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_created_at_idx" ON "audit_events"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_request_id_idx" ON "audit_events"("request_id");

-- CreateIndex
CREATE INDEX "sie_exports_organization_id_status_created_at_idx" ON "sie_exports"("organization_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sie_exports_organization_id_output_attachment_id_key" ON "sie_exports"("organization_id", "output_attachment_id");

-- CreateIndex
CREATE UNIQUE INDEX "sie_exports_id_organization_id_key" ON "sie_exports"("id", "organization_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_fiscal_year_id_organization_id_fkey" FOREIGN KEY ("fiscal_year_id", "organization_id") REFERENCES "fiscal_years"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_locked_by_id_fkey" FOREIGN KEY ("locked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "vat_codes" ADD CONSTRAINT "vat_codes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_vat_code_id_organization_id_fkey" FOREIGN KEY ("vat_code_id", "organization_id") REFERENCES "vat_codes"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "voucher_series" ADD CONSTRAINT "voucher_series_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "voucher_series" ADD CONSTRAINT "voucher_series_fiscal_year_id_organization_id_fkey" FOREIGN KEY ("fiscal_year_id", "organization_id") REFERENCES "fiscal_years"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sie_imports" ADD CONSTRAINT "sie_imports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sie_imports" ADD CONSTRAINT "sie_imports_fiscal_year_id_organization_id_fkey" FOREIGN KEY ("fiscal_year_id", "organization_id") REFERENCES "fiscal_years"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sie_imports" ADD CONSTRAINT "sie_imports_source_attachment_id_organization_id_fkey" FOREIGN KEY ("source_attachment_id", "organization_id") REFERENCES "attachments"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sie_imports" ADD CONSTRAINT "sie_imports_imported_by_id_fkey" FOREIGN KEY ("imported_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_fiscal_year_id_organization_id_fkey" FOREIGN KEY ("fiscal_year_id", "organization_id") REFERENCES "fiscal_years"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_accounting_period_id_organization_id_fisca_fkey" FOREIGN KEY ("accounting_period_id", "organization_id", "fiscal_year_id") REFERENCES "accounting_periods"("id", "organization_id", "fiscal_year_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_voucher_series_id_organization_id_fiscal_y_fkey" FOREIGN KEY ("voucher_series_id", "organization_id", "fiscal_year_id") REFERENCES "voucher_series"("id", "organization_id", "fiscal_year_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_entry_id_organization_id_fkey" FOREIGN KEY ("reversal_of_entry_id", "organization_id") REFERENCES "journal_entries"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_sie_import_id_organization_id_fkey" FOREIGN KEY ("sie_import_id", "organization_id") REFERENCES "sie_imports"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_entry_id_organization_id_fkey" FOREIGN KEY ("journal_entry_id", "organization_id") REFERENCES "journal_entries"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_organization_id_fkey" FOREIGN KEY ("account_id", "organization_id") REFERENCES "accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_vat_code_id_organization_id_fkey" FOREIGN KEY ("vat_code_id", "organization_id") REFERENCES "vat_codes"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_project_id_organization_id_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "projects"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_cost_center_id_organization_id_fkey" FOREIGN KEY ("cost_center_id", "organization_id") REFERENCES "cost_centers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_journal_entry_id_organization_id_fkey" FOREIGN KEY ("journal_entry_id", "organization_id") REFERENCES "journal_entries"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "posting_templates" ADD CONSTRAINT "posting_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "posting_templates" ADD CONSTRAINT "posting_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "posting_template_lines" ADD CONSTRAINT "posting_template_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "posting_template_lines" ADD CONSTRAINT "posting_template_lines_posting_template_id_organization_id_fkey" FOREIGN KEY ("posting_template_id", "organization_id") REFERENCES "posting_templates"("id", "organization_id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "posting_template_lines" ADD CONSTRAINT "posting_template_lines_account_id_organization_id_fkey" FOREIGN KEY ("account_id", "organization_id") REFERENCES "accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "posting_template_lines" ADD CONSTRAINT "posting_template_lines_vat_code_id_organization_id_fkey" FOREIGN KEY ("vat_code_id", "organization_id") REFERENCES "vat_codes"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "posting_template_lines" ADD CONSTRAINT "posting_template_lines_project_id_organization_id_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "projects"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "posting_template_lines" ADD CONSTRAINT "posting_template_lines_cost_center_id_organization_id_fkey" FOREIGN KEY ("cost_center_id", "organization_id") REFERENCES "cost_centers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_fiscal_year_id_organization_id_fkey" FOREIGN KEY ("fiscal_year_id", "organization_id") REFERENCES "fiscal_years"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_account_id_organization_id_fkey" FOREIGN KEY ("account_id", "organization_id") REFERENCES "accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sie_exports" ADD CONSTRAINT "sie_exports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sie_exports" ADD CONSTRAINT "sie_exports_fiscal_year_id_organization_id_fkey" FOREIGN KEY ("fiscal_year_id", "organization_id") REFERENCES "fiscal_years"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sie_exports" ADD CONSTRAINT "sie_exports_output_attachment_id_organization_id_fkey" FOREIGN KEY ("output_attachment_id", "organization_id") REFERENCES "attachments"("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sie_exports" ADD CONSTRAINT "sie_exports_exported_by_id_fkey" FOREIGN KEY ("exported_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- Accounting-domain integrity that cannot be expressed in Prisma's schema DSL.
-- The btree_gist extension lets a GiST exclusion constraint compare UUID tenants.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "fiscal_years"
  ADD CONSTRAINT "fiscal_years_date_range_check"
    CHECK ("start_date" <= "end_date"),
  ADD CONSTRAINT "fiscal_years_no_overlapping_ranges"
    EXCLUDE USING GIST (
      "organization_id" WITH =,
      daterange("start_date", "end_date", '[]') WITH &&
    );

ALTER TABLE "accounting_periods"
  ADD CONSTRAINT "accounting_periods_number_check"
    CHECK ("period_number" BETWEEN 1 AND 13),
  ADD CONSTRAINT "accounting_periods_date_range_check"
    CHECK ("start_date" <= "end_date");

ALTER TABLE "vat_codes"
  ADD CONSTRAINT "vat_codes_rate_range_check"
    CHECK ("rate" >= 0 AND "rate" <= 100);

ALTER TABLE "voucher_series"
  ADD CONSTRAINT "voucher_series_next_number_check"
    CHECK ("next_voucher_number" > 0);

ALTER TABLE "journal_entries"
  ADD CONSTRAINT "journal_entries_voucher_status_check"
    CHECK (
      ("status" = 'DRAFT' AND "voucher_number" IS NULL)
      OR (
        "status" IN ('POSTED', 'REVERSED')
        AND "voucher_series_id" IS NOT NULL
        AND "voucher_number" > 0
        AND "posted_at" IS NOT NULL
      )
    );

ALTER TABLE "journal_lines"
  ADD CONSTRAINT "journal_lines_number_check"
    CHECK ("line_number" > 0),
  ADD CONSTRAINT "journal_lines_single_sided_amount_check"
    CHECK (
      "debit_amount" >= 0
      AND "credit_amount" >= 0
      AND (
        ("debit_amount" > 0 AND "credit_amount" = 0)
        OR ("credit_amount" > 0 AND "debit_amount" = 0)
      )
    );

ALTER TABLE "opening_balances"
  ADD CONSTRAINT "opening_balances_single_sided_amount_check"
    CHECK (
      "debit_amount" >= 0
      AND "credit_amount" >= 0
      AND (
        ("debit_amount" > 0 AND "credit_amount" = 0)
        OR ("credit_amount" > 0 AND "debit_amount" = 0)
      )
    );

ALTER TABLE "posting_template_lines"
  ADD CONSTRAINT "posting_template_lines_number_check"
    CHECK ("line_number" > 0),
  ADD CONSTRAINT "posting_template_lines_amount_check"
    CHECK ("amount" IS NULL OR "amount" >= 0);

ALTER TABLE "attachments"
  ADD CONSTRAINT "attachments_byte_size_check"
    CHECK ("byte_size" >= 0);

ALTER TABLE "sie_imports"
  ADD CONSTRAINT "sie_imports_counts_check"
    CHECK ("imported_entry_count" >= 0 AND "skipped_entry_count" >= 0);

ALTER TABLE "sie_exports"
  ADD CONSTRAINT "sie_exports_count_check"
    CHECK ("exported_entry_count" >= 0);

-- A posted (or reversed) entry must remain balanced at the transaction boundary.
-- A deferred constraint trigger permits creating its header and lines atomically.
CREATE FUNCTION public.enforce_posted_journal_entry_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  affected_entry_id UUID;
  affected_status "JournalEntryStatus";
  debit_total NUMERIC(18, 2);
  credit_total NUMERIC(18, 2);
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    affected_entry_id := COALESCE(NEW."id", OLD."id");
  ELSE
    affected_entry_id := COALESCE(NEW."journal_entry_id", OLD."journal_entry_id");
  END IF;

  SELECT "status"
    INTO affected_status
    FROM "journal_entries"
   WHERE "id" = affected_entry_id;

  IF NOT FOUND OR affected_status = 'DRAFT' THEN
    RETURN NULL;
  END IF;

  SELECT
    COALESCE(SUM("debit_amount"), 0),
    COALESCE(SUM("credit_amount"), 0)
    INTO debit_total, credit_total
    FROM "journal_lines"
   WHERE "journal_entry_id" = affected_entry_id;

  IF debit_total <= 0 OR debit_total <> credit_total THEN
    RAISE EXCEPTION
      'Posted journal entry % must have equal, non-zero debit and credit totals',
      affected_entry_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "journal_entries_must_balance"
AFTER INSERT OR UPDATE OR DELETE ON "journal_entries"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.enforce_posted_journal_entry_balance();

CREATE CONSTRAINT TRIGGER "journal_lines_keep_entries_balanced"
AFTER INSERT OR UPDATE OR DELETE ON "journal_lines"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.enforce_posted_journal_entry_balance();

-- Audit history is append-only even if an application client reaches the database
-- directly. The organization and optional actor FKs remain intentionally retained.
CREATE FUNCTION public.prevent_audit_event_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are immutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "audit_events_immutable"
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW
EXECUTE FUNCTION public.prevent_audit_event_changes();
