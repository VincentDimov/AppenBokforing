/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("private backups and source documents stay ignored and future backups use the main folder", () => {
  const root = path.resolve(__dirname, "..");
  const ignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  const helper = fs.readFileSync(path.join(root, "scripts/verify-local-bas-upgrade.cjs"), "utf8");
  assert.match(ignore, /^\.local-artifacts\/$/m);
  assert.match(ignore, /^\.env\.\*$/m);
  assert.match(ignore, /^!\.env\.example$/m);
  const prettierIgnore = fs.readFileSync(path.join(root, ".prettierignore"), "utf8");
  assert.match(prettierIgnore, /^\.local-artifacts\/$/m);
  assert.match(ignore, /^test-results-smoke\/$/m);
  const smoke = fs.readFileSync(path.join(root, "apps/web/playwright.smoke.config.ts"), "utf8");
  assert.match(smoke, /outputDir: "\.\/test-results-smoke"/);
  assert.match(helper, /path\.resolve\(__dirname, "\.\.\/\.local-artifacts\/backups"\)/);
  assert.ok(!helper.includes("../../LedgerApp-Backups"));
  assert.ok(helper.includes('fs.writeFileSync(artifact, dump, { flag: "wx" })'));
});
