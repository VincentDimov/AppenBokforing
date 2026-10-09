/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// Explicit, backed-up forward migration of the existing local development DB only.
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("../packages/db/dist");
if (process.env.RUN_LOCAL_BAS_UPGRADE !== "yes")
  throw new Error("Explicit local upgrade opt-in required.");
const url = new URL(process.env.DATABASE_URL || "invalid:");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
assert.equal(url.port, "5433");
assert.equal(url.pathname, "/ledgerapp");
assert.ok(
  ["", "?schema=public"].includes(url.search),
  "Only the public schema is permitted, without alternate host overrides."
);
const db = new PrismaClient({ datasourceUrl: url.href });
const digest = (data) => createHash("sha256").update(data).digest("hex");
const quote = (identifier) => '"' + identifier.replaceAll('"', '""') + '"';
async function snapshot(tables) {
  const hashes = {};
  for (const { table, columns } of tables) {
    const rows = await db.$queryRawUnsafe(`SELECT row_to_json(record)::text AS value FROM
      (SELECT ${columns.map(quote).join(",")} FROM public.${quote(table)}) record
      ORDER BY row_to_json(record)::text`);
    hashes[table] = { rows: rows.length, sha256: digest(JSON.stringify(rows)) };
  }
  return hashes;
}
async function main() {
  const migrations = await db.$queryRawUnsafe(
    "SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL"
  );
  assert.equal(
    migrations[0].count,
    24,
    "This reviewed upgrade only supports the pre-FAS37 local schema."
  );
  const columns = await db.$queryRawUnsafe(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name <> '_prisma_migrations' ORDER BY table_name, ordinal_position"
  );
  const byTable = new Map();
  for (const column of columns)
    byTable.set(column.table_name, [...(byTable.get(column.table_name) || []), column.column_name]);
  const tables = [...byTable].map(([table, columnNames]) => ({ table, columns: columnNames }));
  const before = await snapshot(tables);
  const dump = execFileSync(
    "docker",
    ["exec", "ledgerapp-postgres-1", "pg_dump", "-U", "ledgerapp", "-d", "ledgerapp", "-Fc"],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  execFileSync("docker", ["exec", "-i", "ledgerapp-postgres-1", "pg_restore", "--list"], {
    input: dump,
    stdio: ["pipe", "ignore", "pipe"]
  });
  const directory = path.resolve(__dirname, "../../LedgerApp-Backups");
  fs.mkdirSync(directory, { recursive: true });
  const artifact = path.join(directory, "ledgerapp-before-fas37-" + randomUUID() + ".dump");
  fs.writeFileSync(artifact, dump, { flag: "wx" });
  assert.equal(digest(fs.readFileSync(artifact)), digest(dump));
  // Fail closed if any migration beyond the one reviewed here appears.
  const folders = fs
    .readdirSync(path.resolve(__dirname, "../packages/db/prisma/migrations"))
    .filter((entry) => /^\d/.test(entry));
  assert.equal(folders.length, 25);
  assert.equal(folders.sort().at(-1), "20261009010000_bas_catalog");
  execFileSync(
    process.execPath,
    [
      path.resolve(__dirname, "../node_modules/pnpm/bin/pnpm.cjs"),
      "--filter",
      "@ledgerapp/db",
      "exec",
      "prisma",
      "migrate",
      "deploy",
      "--schema",
      "prisma/schema.prisma"
    ],
    { cwd: path.resolve(__dirname, ".."), stdio: "inherit" }
  );
  const after = await snapshot(tables);
  assert.deepEqual(after, before, "Every original column and row must remain identical.");
  assert.equal(await db.basAccountCatalog.count(), 0, "No source data may be imported implicitly.");
  console.log(
    JSON.stringify({
      gate: "PASS",
      migration: "24 -> 25",
      originalTablesPreserved: tables.length,
      fullOriginalRowsAndColumnsUnchanged: true,
      backup: artifact,
      backupSha256: digest(dump),
      distributedBasRecords: 0
    })
  );
}
main()
  .catch((error) => {
    console.error(
      "Local BAS upgrade failed (credentials redacted): " +
        String(error.message).replace(/postgresql:\/\/\S+/g, "[redacted]")
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
