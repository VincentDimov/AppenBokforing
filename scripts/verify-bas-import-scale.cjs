/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// Real CLI / PG with original synthetic data, never an official BAS catalog.
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { spawnSync, spawn } = require("node:child_process");
const { randomUUID, createHash } = require("node:crypto");
const { PrismaClient } = require("../packages/db/dist");
const { syntheticCatalog, databaseRows } = require("./synthetic-bas-catalog.cjs");
const { diagnostics } = require("./safe-diagnostics.cjs");
if (process.env.RUN_DISPOSABLE_BAS_IMPORT !== "yes") throw new Error("Disposable opt-in required");
const url = new URL(process.env.TEST_DATABASE_URL || "invalid:");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
assert.equal(url.pathname, "/ledgerapp_test");
assert.equal(url.search, "");
const filename = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "ledgerapp-synthetic-scale-")),
  "synthetic.json"
);
const manifest = syntheticCatalog(),
  db = new PrismaClient({ datasourceUrl: url.href });
let cases = 0;
function write(value) {
  const bytes = Buffer.from(JSON.stringify(value));
  fs.writeFileSync(filename, bytes);
  return createHash("sha256").update(bytes).digest("hex");
}
function options(hash) {
  return {
    env: {
      ...process.env,
      DATABASE_URL: url.href,
      BAS_CATALOG_IMPORT_ENABLED: "true",
      BAS_CATALOG_INPUT_FILE: filename,
      BAS_CATALOG_APPROVED_SHA256: hash
    },
    encoding: "utf8",
    timeout: 30000
  };
}
function run(hash, flags = ["--authorize"]) {
  cases++;
  return spawnSync(
    process.execPath,
    [path.resolve(__dirname, "bas-catalog-import.cjs"), ...flags],
    options(hash)
  );
}
function concurrent(hash) {
  cases++;
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.resolve(__dirname, "bas-catalog-import.cjs"), "--authorize"],
      options(hash)
    );
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) =>
      status === 0
        ? resolve(JSON.parse(stdout.trim()))
        : reject(new Error("Concurrent synthetic CLI import failed"))
    );
  });
}
async function main() {
  assert.ok(manifest.accounts.length >= 1282);
  const initial = await db.basCatalogVersion.count(),
    hash = write(manifest);
  const good = run(hash, ["--authorize", "--dry-run"]);
  assert.equal(good.status, 0);
  assert.deepEqual(JSON.parse(good.stdout.trim()).blockers, []);
  assert.equal(await db.basCatalogVersion.count(), initial);
  const invalid = {
    ...manifest,
    rightsConfirmed: false,
    verification: {
      allSourceEntriesReviewed: false,
      unresolvedClassifications: 1310,
      unresolvedNames: 2,
      unresolvedDuplicates: 1
    }
  };
  const preview = run(write(invalid), ["--dry-run"]);
  assert.equal(preview.status, 1);
  const report = JSON.parse(preview.stdout.trim());
  assert.equal(report.databaseConnected, false);
  assert.equal(report.mutations, 0);
  for (const code of [
    "RIGHTS_NOT_ESTABLISHED",
    "CLASSIFICATION_REVIEW_REQUIRED",
    "UNRESOLVED_NAMES",
    "UNRESOLVED_DUPLICATES",
    "OPERATOR_AUTHORIZATION_REQUIRED"
  ])
    assert.ok(report.blockers.some((b) => b.code === code));
  assert.equal(await db.basCatalogVersion.count(), initial);
  for (const failure of ["count", "parent", "duplicate", "classification", "name", "bookability"]) {
    const c = structuredClone(manifest);
    c.version = "SYNTHETIC-REFUSED-" + randomUUID();
    if (failure === "count") c.expectedAccounts++;
    if (failure === "parent") c.accounts[1].parentAccountNumber = "1990";
    if (failure === "duplicate") c.accounts.push(c.accounts[0]);
    if (failure === "classification") c.accounts[0].type = "UNKNOWN";
    if (failure === "name") c.accounts[0].officialName = "";
    if (failure === "bookability") delete c.accounts[0].isBookable;
    assert.equal(run(write(c)).status, 1);
    assert.equal(await db.basCatalogVersion.count(), initial);
  }
  write(manifest);
  const imports = await Promise.all([concurrent(hash), concurrent(hash)]);
  assert.deepEqual(imports.map((r) => r.status).sort(), ["ALREADY_IMPORTED", "IMPORTED"]);
  assert.equal(JSON.parse(run(hash).stdout.trim()).status, "ALREADY_IMPORTED");
  assert.equal(run(write({ ...manifest, sourceReference: "changed" })).status, 1);
  const v = await db.basCatalogVersion.findUniqueOrThrow({ where: { version: manifest.version } });
  const rows = await db.basAccountCatalog.findMany({ where: { catalogVersionId: v.id } });
  assert.equal(v.isDefault, false);
  assert.equal(v.contentSha256, hash);
  assert.equal(rows.length, manifest.accounts.length);
  for (const source of manifest.accounts) {
    const actual = rows.find((r) => r.accountNumber === source.number);
    for (const [field, sourceField] of [
      ["officialName", "officialName"],
      ["normalBalance", "normalBalance"],
      ["parentAccountNumber", "parentAccountNumber"],
      ["type", "type"]
    ])
      assert.equal(actual[field], source[sourceField]);
  }
  // Fail the deferred count constraint at real COMMIT after all rows exist.
  const rollback = "SYNTHETIC-ROLLBACK-" + randomUUID();
  await assert.rejects(
    db.$transaction(async (tx) => {
      const bad = await tx.basCatalogVersion.create({
        data: {
          version: rollback,
          sourceVersion: manifest.sourceVersion,
          sourceReference: manifest.sourceReference,
          sourceSha256: manifest.sourceSha256,
          contentSha256: hash,
          licenseReference: manifest.licenseReference,
          classificationReviewReference: manifest.classificationReviewReference,
          verificationReport: manifest.verification,
          rowCount: manifest.accounts.length + 1
        }
      });
      await tx.basAccountCatalog.createMany({ data: databaseRows(manifest, bad.id) });
    })
  );
  cases++;
  assert.equal(await db.basCatalogVersion.count({ where: { version: rollback } }), 0);
  assert.equal(
    await db.basAccountCatalog.count({ where: { catalogVersionId: v.id } }),
    manifest.accounts.length
  );
  console.log(
    JSON.stringify({
      gate: "PASS",
      syntheticOnly: true,
      officialRecordsImported: 0,
      scaleRows: rows.length,
      realImporterCases: cases,
      previewMutations: 0,
      concurrentIdempotency: true,
      commitFailureRolledBack: true,
      exactNamesAndClassificationsPreserved: true
    })
  );
}
main()
  .catch((error) => {
    console.error(JSON.stringify(diagnostics(error, { gate: "disposable-full-size-bas-import" })));
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
