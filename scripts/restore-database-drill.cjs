/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// Fixed, disposable loopback containers only. No deletion or production access.
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("../packages/db/dist");
if (process.env.RUN_DISPOSABLE_RESTORE_DRILL !== "yes")
  throw new Error("Explicit disposable drill opt-in required.");
async function main() {
  const started = Date.now();
  const source = new PrismaClient({
    datasourceUrl:
      "postgresql://ledgerapp_test:local_disposable_test_only@127.0.0.1:15438/ledgerapp_test"
  });
  const target = new PrismaClient({
    datasourceUrl:
      "postgresql://ledgerapp_test:local_disposable_test_only@127.0.0.1:15439/ledgerapp_restore"
  });
  try {
    const existing = await target.$queryRawUnsafe(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'"
    );
    assert.equal(existing[0].count, 0, "Restore target must be empty; no overwrite is allowed.");
    const dump = execFileSync(
      "docker",
      [
        "exec",
        "ledgerapp-fas21-23-20261007",
        "pg_dump",
        "-U",
        "ledgerapp_test",
        "-d",
        "ledgerapp_test",
        "-Fc"
      ],
      { maxBuffer: 128 * 1024 * 1024 }
    );
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "ledgerapp-fas23-restore-20261007",
        "pg_restore",
        "-U",
        "ledgerapp_test",
        "-d",
        "ledgerapp_restore",
        "--no-owner",
        "--no-acl",
        "--exit-on-error"
      ],
      { input: dump }
    );
    const models = [
      "user",
      "session",
      "organization",
      "organizationMember",
      "account",
      "fiscalYear",
      "accountingPeriod",
      "voucherSeries",
      "journalEntry",
      "journalLine",
      "openingBalance",
      "auditEvent",
      "attachment"
    ];
    for (const model of models)
      assert.equal(await target[model].count(), await source[model].count(), model);
    assert.ok(await target.journalEntry.count({ where: { status: "POSTED" } }));
    assert.ok(await target.accountingPeriod.count({ where: { status: "LOCKED" } }));
    const entry = await target.journalEntry.findFirstOrThrow({ where: { status: "POSTED" } });
    const audit = await target.auditEvent.findFirstOrThrow();
    for (const sql of [
      `UPDATE journal_lines SET debit_amount=11 WHERE journal_entry_id='${entry.id}'`,
      `DELETE FROM journal_entries WHERE id='${entry.id}'`,
      `UPDATE audit_events SET metadata='{}' WHERE id='${audit.id}'`,
      `DELETE FROM audit_events WHERE id='${audit.id}'`
    ])
      await assert.rejects(target.$executeRawUnsafe(sql));
    const other = await target.organization.findFirstOrThrow({
      where: { id: { not: entry.organizationId } }
    });
    const line = await target.journalLine.findFirstOrThrow({ where: { journalEntryId: entry.id } });
    await assert.rejects(
      target.openingBalance.create({
        data: {
          organizationId: other.id,
          fiscalYearId: entry.fiscalYearId,
          accountId: line.accountId,
          debitAmount: "0",
          creditAmount: "0"
        }
      })
    );
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "ledgerapp-fas23-restore-20261007",
        "psql",
        "-U",
        "ledgerapp_test",
        "-d",
        "ledgerapp_restore",
        "-v",
        "ON_ERROR_STOP=1"
      ],
      { input: fs.readFileSync(path.resolve(__dirname, "../ops/database-runtime-role.sql")) }
    );
    for (const sql of [
      "DROP TABLE audit_events",
      "ALTER TABLE journal_lines DISABLE TRIGGER ALL",
      "TRUNCATE journal_entries CASCADE",
      `UPDATE audit_events SET metadata='{}' WHERE id='${audit.id}'`
    ])
      await assert.rejects(
        target.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL ROLE ledgerapp_runtime");
          await tx.$executeRawUnsafe(sql);
        })
      );
    console.log(
      JSON.stringify({
        drill: "DATABASE_ONLY_PASS",
        modelsCompared: models.length,
        immutableTriggers: true,
        tenantForeignKeys: true,
        runtimeDdlDenied: true,
        blobRestoreVerified: false,
        elapsedSeconds: (Date.now() - started) / 1000
      })
    );
  } finally {
    await source.$disconnect();
    await target.$disconnect();
  }
}
main().catch((error) => {
  console.error(
    "Disposable database restore drill failed:",
    String(error.message).replace(/postgresql:\/\/\S+/g, "[redacted]")
  );
  process.exitCode = 1;
});
