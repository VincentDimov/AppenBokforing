/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// Unique new databases, never reset/reuse/delete an existing target.
const { execFileSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const path = require("node:path");
const { diagnostics } = require("./safe-diagnostics.cjs");
if (process.env.RUN_DISPOSABLE_RESTORE_DRILL !== "yes")
  throw new Error("Disposable opt-in required");
const container = process.env.RESTORE_DRILL_SOURCE_CONTAINER || "ledgerapp-fas24-pg-20261007";
if (!/^ledgerapp-fas(?:24|36)-(?:pg|tests)-\d{8}$/.test(container))
  throw new Error("Dedicated disposable container required");
const baselines = [14, 18, 19, 23, 24, 25];
try {
  for (const baseline of baselines) {
    const name = "ledgerapp_upgrade_" + baseline + randomBytes(4).toString("hex");
    execFileSync("docker", ["exec", container, "createdb", "-U", "ledgerapp_test", name], {
      stdio: "pipe"
    });
    execFileSync(process.execPath, [path.join(__dirname, "verify-migration-upgrade.cjs")], {
      env: {
        ...process.env,
        UPGRADE_TEST_DATABASE: name,
        UPGRADE_BASE_MIGRATION_COUNT: String(baseline)
      },
      stdio: "inherit"
    });
  }
  console.log(JSON.stringify({ upgradeMatrix: "PASS", baselines, resets: 0, deletedDatabases: 0 }));
} catch (error) {
  console.error(JSON.stringify(diagnostics(error, { gate: "upgrade-matrix" })));
  process.exitCode = 1;
}
