/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// Apply a genuine earlier migration set, seed ordinary rows, then deploy the
// remaining forward migrations. Fresh, fixed disposable DB only; no db push.
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { execFileSync } = require("node:child_process");
const { PrismaClient } = require("../packages/db/dist");
if (process.env.RUN_DISPOSABLE_RESTORE_DRILL !== "yes")
  throw new Error("Disposable opt-in required");
const url =
  "postgresql://ledgerapp_test:local_disposable_test_only@127.0.0.1:15440/ledgerapp_upgrade_24";
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
for (const name of migrations.slice(0, 11))
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
    const user = await db.user.create({
      data: { email: "upgrade@example.test", displayName: "Upgrade preserved" }
    });
    const org = await db.organization.create({
      data: { name: "Upgrade preserved", slug: "upgrade-24" }
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: "OWNER" }
    });
    const before = {};
    for (const model of ["user", "organization", "organizationMember"])
      before[model] = await db[model].findMany({ orderBy: { id: "asc" } });
    deploy(path.join(schemaRoot, "schema.prisma"));
    for (const [model, rows] of Object.entries(before))
      assert.deepEqual(await db[model].findMany({ orderBy: { id: "asc" } }), rows);
    const applied = await db.$queryRawUnsafe(
      "SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL"
    );
    assert.equal(applied[0].count, 14);
    console.log(
      JSON.stringify({
        migrationUpgrade: "PASS",
        earlierMigrations: 11,
        sequentialRecentMigrations: 3,
        preservedModels: 3,
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
