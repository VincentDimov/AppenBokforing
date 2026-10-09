/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// Exercise the real CLI with original synthetic data, never official catalog data.
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { spawnSync } = require("node:child_process");
const { randomUUID, createHash } = require("node:crypto");
const { PrismaClient } = require("../packages/db/dist");
if (process.env.RUN_DISPOSABLE_BAS_IMPORT !== "yes")
  throw new Error("Explicit disposable opt-in required.");
const url = new URL(process.env.TEST_DATABASE_URL || "invalid:");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
assert.equal(url.pathname, "/ledgerapp_test");
assert.equal(url.search, "");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ledgerapp-synthetic-bas-import-"));
const filename = path.join(directory, "synthetic.json");
const manifest = {
  version: "SYNTHETIC-IMPORT-" + randomUUID(),
  sourceVersion: "synthetic-only",
  sourceReference: "synthetic://not-bas",
  sourceSha256: "a".repeat(64),
  licenseReference: "Original synthetic data",
  classificationReviewReference: "Synthetic reviewed fixture",
  expectedAccounts: 1,
  rightsConfirmed: true,
  verification: {
    allSourceEntriesReviewed: true,
    unresolvedClassifications: 0,
    unresolvedNames: 0,
    unresolvedDuplicates: 0
  },
  accounts: [
    {
      number: "1110",
      officialName: "Synthetic CLI account",
      className: "Synthetic",
      groupName: "Synthetic",
      category: "MAIN_ACCOUNT",
      parentAccountNumber: null,
      isK2Restricted: false,
      isBookable: true,
      type: "ASSET",
      normalBalance: "DEBIT",
      classificationReference: "Synthetic",
      sourcePosition: "Fixture"
    }
  ]
};
function write(value) {
  const bytes = Buffer.from(JSON.stringify(value));
  fs.writeFileSync(filename, bytes);
  return createHash("sha256").update(bytes).digest("hex");
}
function run(hash, authorized = true) {
  return spawnSync(
    process.execPath,
    [path.resolve(__dirname, "bas-catalog-import.cjs"), ...(authorized ? ["--authorize"] : [])],
    {
      env: {
        ...process.env,
        DATABASE_URL: url.href,
        BAS_CATALOG_IMPORT_ENABLED: "true",
        BAS_CATALOG_INPUT_FILE: filename,
        BAS_CATALOG_APPROVED_SHA256: hash
      },
      encoding: "utf8",
      timeout: 30000
    }
  );
}
const db = new PrismaClient({ datasourceUrl: url.href });
async function main() {
  const hash = write(manifest);
  assert.equal(run(hash, false).status, 1);
  assert.equal(run("0".repeat(64)).status, 1);
  const first = run(hash);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout.trim()).status, "IMPORTED");
  assert.equal(JSON.parse(run(hash).stdout.trim()).status, "ALREADY_IMPORTED");
  assert.equal(run(write({ ...manifest, sourceReference: "changed" })).status, 1);
  assert.equal(
    run(
      write({ ...manifest, version: "SYNTHETIC-REFUSED-" + randomUUID(), rightsConfirmed: false })
    ).status,
    1
  );
  const version = await db.basCatalogVersion.findUniqueOrThrow({
    where: { version: manifest.version }
  });
  assert.equal(version.isDefault, false);
  assert.equal(await db.basAccountCatalog.count({ where: { catalogVersionId: version.id } }), 1);
  console.log(
    JSON.stringify({
      gate: "PASS",
      syntheticOnly: true,
      realImporterCases: 6,
      authorizationAndHashRequired: true,
      idempotent: true,
      immutableVersion: true,
      rightsRequired: true
    })
  );
}
main()
  .catch(() => {
    console.error("Disposable BAS importer verification failed (details redacted).");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
