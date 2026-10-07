/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const assert = require("node:assert/strict");
const { PrismaClient } = require("../packages/db/dist");
if (process.env.RUN_DISPOSABLE_RESTORE_DRILL !== "yes")
  throw new Error("Disposable restore opt-in required.");
const db = new PrismaClient({
  datasourceUrl:
    "postgresql://ledgerapp_test:local_disposable_test_only@127.0.0.1:15439/ledgerapp_restore"
});
async function main() {
  const locked = await db.accountingPeriod.findFirstOrThrow({
    where: { status: "LOCKED", fiscalYear: { status: "OPEN" } }
  });
  const series = await db.voucherSeries.findFirstOrThrow({
    where: { organizationId: locked.organizationId, fiscalYearId: locked.fiscalYearId }
  });
  const lockedData = {
    organizationId: locked.organizationId,
    fiscalYearId: locked.fiscalYearId,
    accountingPeriodId: locked.id,
    voucherSeriesId: series.id,
    entryDate: locked.startDate,
    description: "Disposable locked restore assertion"
  };
  await assert.rejects(db.journalEntry.create({ data: lockedData }));
  const period = await db.accountingPeriod.findFirstOrThrow({
    where: {
      organizationId: locked.organizationId,
      fiscalYearId: locked.fiscalYearId,
      status: "OPEN"
    }
  });
  const accounts = await db.account.findMany({
    where: { organizationId: locked.organizationId },
    take: 2
  });
  assert.equal(accounts.length, 2);
  await assert.rejects(
    db.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          ...lockedData,
          accountingPeriodId: period.id,
          entryDate: period.startDate,
          lines: {
            create: [
              { accountId: accounts[0].id, lineNumber: 1, debitAmount: "10", creditAmount: "0" },
              { accountId: accounts[1].id, lineNumber: 2, debitAmount: "0", creditAmount: "9" }
            ]
          }
        }
      });
      await tx.journalEntry.update({
        where: { id: entry.id },
        data: { status: "POSTED", voucherNumber: 2147483646, postedAt: new Date() }
      });
    })
  );
  console.log(
    JSON.stringify({ restoredPeriodLockDenied: true, restoredUnbalancedPostingDenied: true })
  );
}
main()
  .catch((error) => {
    console.error("Restored guard verification failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
