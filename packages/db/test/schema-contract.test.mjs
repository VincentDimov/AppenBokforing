import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const schema = await readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const migration = await readFile(
  new URL(
    "../prisma/migrations/20260914065404_core_database_domain/migration.sql",
    import.meta.url
  ),
  "utf8"
);
const authMigration = await readFile(
  new URL(
    "../prisma/migrations/20260914121500_auth_session_security/migration.sql",
    import.meta.url
  ),
  "utf8"
);
const accountManagementMigration = await readFile(
  new URL("../prisma/migrations/20260914140000_account_management/migration.sql", import.meta.url),
  "utf8"
);
const journalEntryMigration = await readFile(
  new URL(
    "../prisma/migrations/20260914160000_journal_entry_bookkeeping/migration.sql",
    import.meta.url
  ),
  "utf8"
);
const journalEntryCorrectionsMigration = await readFile(
  new URL(
    "../prisma/migrations/20260915090000_journal_entry_corrections/migration.sql",
    import.meta.url
  ),
  "utf8"
);
const accountingAttachmentsMigration = await readFile(
  new URL(
    "../prisma/migrations/20260915110000_accounting_attachments/migration.sql",
    import.meta.url
  ),
  "utf8"
);

test("organization member roles are an explicit least-privilege enum", () => {
  assert.match(
    schema,
    /enum OrganizationMemberRole\s*{\s*OWNER\s+ADMIN\s+ACCOUNTANT\s+MEMBER\s+READ_ONLY\s*}/s
  );
  assert.match(schema, /@@unique\(\[organizationId,\s*userId\]\)/);
});

test("voucher identity is unique inside its organization, fiscal year and series", () => {
  assert.match(
    schema,
    /@@unique\(\[organizationId,\s*fiscalYearId,\s*voucherSeriesId,\s*voucherNumber\]\)/
  );
});

test("tenant-owned accounting references include organization in their foreign keys", () => {
  assert.match(
    schema,
    /journalEntry\s+JournalEntry\s+@relation\(fields:\s*\[journalEntryId,\s*organizationId\],\s*references:\s*\[id,\s*organizationId\]/
  );
  assert.match(
    schema,
    /account\s+Account\s+@relation\(fields:\s*\[accountId,\s*organizationId\],\s*references:\s*\[id,\s*organizationId\]/
  );
  assert.match(
    schema,
    /accountingPeriod\s+AccountingPeriod\s+@relation\(fields:\s*\[accountingPeriodId,\s*organizationId,\s*fiscalYearId\]/
  );
});

test("ledger amounts are decimal and the migration protects core invariants", () => {
  assert.match(
    schema,
    /debitAmount\s+Decimal\s+@default\(0\)\s+@map\("debit_amount"\)\s+@db\.Decimal\(18,\s*2\)/
  );
  assert.match(migration, /journal_lines_single_sided_amount_check/);
  assert.match(migration, /journal_entries_must_balance/);
  assert.match(migration, /audit_events_immutable/);
});

test("only disposable sessions and template lines use cascade deletion", () => {
  const cascades = schema.match(/onDelete: Cascade/g) ?? [];

  assert.equal(cascades.length, 2);
  assert.match(schema, /user\s+User\s+@relation\(fields: \[userId\][^\n]*onDelete: Cascade/);
  assert.match(schema, /postingTemplate\s+PostingTemplate\s+@relation\([^\n]*onDelete: Cascade/);
  assert.doesNotMatch(schema, /journalEntry JournalEntry @relation\([^\n]*onDelete: Cascade/);
});

test("refresh sessions model rotation and case-insensitive account identity", () => {
  assert.match(
    schema,
    /enum SessionRevocationReason\s*{\s*LOGOUT\s+ROTATED\s+REUSE_DETECTED\s+PASSWORD_CHANGED\s+ADMIN_REVOKED\s*}/s
  );
  assert.match(schema, /familyId\s+String\s+@default\(uuid\(\)\)/);
  assert.match(schema, /absoluteExpiresAt\s+DateTime/);
  assert.match(schema, /replacedById\s+String\?\s+@unique/);
  assert.match(schema, /replacedBy\s+Session\?[^\n]*onDelete: SetNull/);
  assert.match(authMigration, /UPDATE "sessions"/);
  assert.match(authMigration, /CREATE UNIQUE INDEX "users_email_lower_key"/);
});

test("accounts retain tenant-safe identifiers, descriptions and restricted ledger references", () => {
  assert.match(schema, /description\s+String\?\s+@db\.VarChar\(500\)/);
  assert.match(schema, /@@unique\(\[organizationId,\s*accountNumber\]\)/);
  assert.match(
    schema,
    /account\s+Account\s+@relation\(fields:\s*\[accountId,\s*organizationId\],[^\n]*onDelete: Restrict/
  );
  assert.match(accountManagementMigration, /ADD COLUMN "description" VARCHAR\(500\)/);
  assert.match(accountManagementMigration, /CREATE INDEX "accounts_name_trgm_idx"/);
});

test("posted journal entries have database-enforced calendar, balance and immutability safeguards", () => {
  assert.match(schema, /@@index\(\[organizationId,\s*fiscalYearId,\s*entryDate\]\)/);
  assert.match(journalEntryMigration, /line_count < 2/);
  assert.match(journalEntryMigration, /enforce_journal_entry_calendar_scope/);
  assert.match(journalEntryMigration, /prevent_posted_journal_entry_changes/);
  assert.match(journalEntryMigration, /prevent_posted_journal_line_changes/);
  assert.match(
    journalEntryMigration,
    /journal_entries_organization_id_fiscal_year_id_entry_date_idx/
  );
});

test("corrections use one tenant-safe reversal link and database-enforced inverse lines", () => {
  assert.match(schema, /enum JournalEntrySource\s*{[\s\S]*REVERSAL/);
  assert.match(schema, /reversesEntryId\s+String\?\s+@map\("reverses_entry_id"\)/);
  assert.match(
    schema,
    /reversesEntry\s+JournalEntry\?\s+@relation\([^\n]*fields:\s*\[reversesEntryId,\s*organizationId\][^\n]*onDelete: Restrict/
  );
  assert.match(schema, /reversedByEntry\s+JournalEntry\?\s+@relation\("JournalEntryReversal"\)/);
  assert.match(schema, /@@unique\(\[reversesEntryId,\s*organizationId\]\)/);
  assert.match(journalEntryCorrectionsMigration, /reverses_entry_not_self_check/);
  assert.match(journalEntryCorrectionsMigration, /journal_entries_correction_integrity/);
  assert.match(journalEntryCorrectionsMigration, /exact debit-credit opposites/);
});

test("attachments keep verified evidence tenant-safe, private and retention-oriented", () => {
  assert.match(schema, /originalName\s+String\s+@map\("original_file_name"\)/);
  assert.match(schema, /size\s+BigInt\s+@map\("byte_size"\)\s+@db\.BigInt/);
  assert.match(schema, /sha256\s+String\s+@db\.Char\(64\)/);
  assert.match(
    schema,
    /journalEntry\s+JournalEntry\?\s+@relation\(fields:\s*\[journalEntryId,\s*organizationId\],[^\n]*onDelete: Restrict/
  );
  assert.match(schema, /@@index\(\[organizationId,\s*journalEntryId,\s*createdAt\]\)/);
  assert.match(accountingAttachmentsMigration, /attachments_size_range_check/);
  assert.match(accountingAttachmentsMigration, /attachments_sha256_lower_hex_check/);
  assert.match(accountingAttachmentsMigration, /ALTER COLUMN "sha256" SET NOT NULL/);
  assert.match(
    accountingAttachmentsMigration,
    /attachments_organization_id_journal_entry_id_created_at_idx/
  );
});
