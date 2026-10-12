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
  assert.match(helper, /path\.resolve\(__dirname, "\.\.\/\.local-artifacts\/backups"\)/);
  assert.ok(!helper.includes("../../LedgerApp-Backups"));
  assert.ok(helper.includes('fs.writeFileSync(artifact, dump, { flag: "wx" })'));
});
