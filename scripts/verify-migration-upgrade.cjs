/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// Apply a genuine earlier migration set, seed ordinary rows, then deploy the
// remaining forward migrations. Fresh, fixed disposable DB only; no db push.
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { PrismaClient } = require("../packages/db/dist");
if (process.env.RUN_DISPOSABLE_RESTORE_DRILL !== "yes")
  throw new Error("Disposable opt-in required");
const url =
  "postgresql://ledgerapp_test:local_disposable_test_only@127.0.0.1:15440/ledgerapp_upgrade_2529";
const root = path.resolve(__dirname, ".."),
  schemaRoot = path.join(root, "packages/db/prisma");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "ledgerapp-old-migrations-"));
fs.mkdirSync(path.join(temporary, "migrations"));
fs.copyFileSync(path.join(schemaRoot, "schema.prisma"), path.join(temporary, "schema.prisma"));
fs.copyFileSync(
  path.join(schemaRoot, "migrations/migration_lock.toml"),
  path.join(temporary, "migrations/migration_lock.toml")
);
const migrations = fs
  .readdirSync(path.join(schemaRoot, "migrations"))
  .filter((name) => /^\d/.test(name))
  .sort();
for (const name of migrations.slice(0, 14))
  fs.cpSync(path.join(schemaRoot, "migrations", name), path.join(temporary, "migrations", name), {
    recursive: true
  });
const pnpm = path.join(root, "node_modules/pnpm/bin/pnpm.cjs");
const deploy = (schema) =>
  execFileSync(
    process.execPath,
    [pnpm, "--filter", "@ledgerapp/db", "exec", "prisma", "migrate", "deploy", "--schema", schema],
    { cwd: root, env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" }
  );
async function main() {
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const tables = await db.$queryRawUnsafe(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'"
    );
    assert.equal(tables[0].count, 0, "Upgrade target must be fresh; no overwrite");
    deploy(path.join(temporary, "schema.prisma"));
    // Do not use the newest generated client's default projections on an older
    // schema. Seed real prior-schema rows and compare every original column.
    const user = randomUUID(),
      org = randomUUID(),
      fiscal = randomUUID(),
      period = randomUUID(),
      series = randomUUID(),
      bank = randomUUID(),
      equity = randomUUID(),
      revenue = randomUUID(),
      project = randomUUID(),
      center = randomUUID(),
      entry = randomUUID();
    await db.$executeRaw`INSERT INTO users(id,email,display_name,updated_at) VALUES (${user}::uuid,'upgrade@example.test','Upgrade preserved',now())`;
    await db.$executeRaw`INSERT INTO organizations(id,name,slug,updated_at) VALUES (${org}::uuid,'Upgrade preserved','upgrade-2529',now())`;
    await db.$executeRaw`INSERT INTO organization_members(id,organization_id,user_id,role,updated_at) VALUES (${randomUUID()}::uuid,${org}::uuid,${user}::uuid,'OWNER',now())`;
    await db.$executeRaw`INSERT INTO fiscal_years(id,organization_id,name,start_date,end_date,updated_at) VALUES (${fiscal}::uuid,${org}::uuid,'2026','2026-01-01','2026-12-31',now())`;
    await db.$executeRaw`INSERT INTO accounting_periods(id,organization_id,fiscal_year_id,period_number,start_date,end_date,updated_at) VALUES (${period}::uuid,${org}::uuid,${fiscal}::uuid,1,'2026-01-01','2026-12-31',now())`;
    await db.$executeRaw`INSERT INTO voucher_series(id,organization_id,fiscal_year_id,code,name,updated_at) VALUES (${series}::uuid,${org}::uuid,${fiscal}::uuid,'A','Prior series',now())`;
    for (const [id, number, type, side] of [
      [bank, "1930", "ASSET", "DEBIT"],
      [equity, "2091", "EQUITY", "CREDIT"],
      [revenue, "3000", "REVENUE", "CREDIT"]
    ])
      await db.$executeRaw`INSERT INTO accounts(id,organization_id,account_number,name,type,normal_balance,updated_at) VALUES (${id}::uuid,${org}::uuid,${number},${number},${type}::"AccountType",${side}::"BalanceSide",now())`;
    await db.$executeRaw`INSERT INTO projects(id,organization_id,code,name,updated_at) VALUES (${project}::uuid,${org}::uuid,'P1','Prior project',now())`;
    await db.$executeRaw`INSERT INTO cost_centers(id,organization_id,code,name,updated_at) VALUES (${center}::uuid,${org}::uuid,'K1','Prior center',now())`;
    await db.$executeRaw`INSERT INTO opening_balances(id,organization_id,fiscal_year_id,account_id,debit_amount,credit_amount,updated_at) VALUES (${randomUUID()}::uuid,${org}::uuid,${fiscal}::uuid,${bank}::uuid,1000,0,now()),(${randomUUID()}::uuid,${org}::uuid,${fiscal}::uuid,${equity}::uuid,0,1000,now())`;
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO journal_entries(id,organization_id,fiscal_year_id,accounting_period_id,voucher_series_id,entry_date,description,updated_at) VALUES (${entry}::uuid,${org}::uuid,${fiscal}::uuid,${period}::uuid,${series}::uuid,'2026-01-10','Prior posted voucher',now())`;
      await tx.$executeRaw`INSERT INTO journal_lines(id,organization_id,journal_entry_id,account_id,line_number,debit_amount,credit_amount,project_id,cost_center_id,updated_at) VALUES (${randomUUID()}::uuid,${org}::uuid,${entry}::uuid,${bank}::uuid,1,100,0,${project}::uuid,${center}::uuid,now()),(${randomUUID()}::uuid,${org}::uuid,${entry}::uuid,${revenue}::uuid,2,0,100,${project}::uuid,${center}::uuid,now())`;
      await tx.$executeRaw`UPDATE journal_entries SET status='POSTED',voucher_number=1,posted_at=now() WHERE id=${entry}::uuid`;
    });
    const before = {};
    for (const table of [
      "users",
      "organizations",
      "organization_members",
      "fiscal_years",
      "accounting_periods",
      "voucher_series",
      "accounts",
      "projects",
      "cost_centers",
      "opening_balances",
      "journal_entries",
      "journal_lines",
      "audit_events"
    ]) {
      const columns = (
        await db.$queryRawUnsafe(
          `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' ORDER BY ordinal_position`
        )
      )
        .map((row) => `"${row.column_name}"`)
        .join(",");
      before[table] = {
        columns,
        rows: await db.$queryRawUnsafe(`SELECT ${columns} FROM ${table} ORDER BY id`)
      };
    }
    deploy(path.join(schemaRoot, "schema.prisma"));
    for (const [table, snapshot] of Object.entries(before))
      assert.deepEqual(
        await db.$queryRawUnsafe(`SELECT ${snapshot.columns} FROM ${table} ORDER BY id`),
        snapshot.rows
      );
    assert.equal(
      (await db.journalLine.findFirstOrThrow()).projectSnapshot,
      null,
      "No fabricated historical backfill"
    );
    await assert.rejects(
      db.project.update({ where: { id: project }, data: { name: "Rewrite legacy history" } })
    );
    const applied = await db.$queryRawUnsafe(
      "SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL"
    );
    assert.equal(applied[0].count, migrations.length);
    console.log(
      JSON.stringify({
        migrationUpgrade: "PASS",
        earlierMigrations: 14,
        sequentialRecentMigrations: migrations.length - 14,
        preservedModels: Object.keys(before).length,
        historicalMigrationsEdited: false,
        dbPush: false
      })
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error("Disposable upgrade verification failed (connection details redacted).");
  process.exitCode = 1;
});
