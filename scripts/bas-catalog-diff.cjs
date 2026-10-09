/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// Read-only operator preview. Never upgrades a tenant or guesses a future catalog.
const fs = require("node:fs");
const {
  validateAuthorizedCatalog
} = require("../apps/api/dist/accounts/bas/catalog-validation.js");
const { compareCatalogs } = require("../apps/api/dist/accounts/bas/catalog-diff.js");
function read(filename) {
  if (!filename || fs.statSync(filename).size > 12 * 1024 * 1024)
    throw new Error("Bounded reviewed manifest required.");
  return validateAuthorizedCatalog(JSON.parse(fs.readFileSync(filename, "utf8")));
}
try {
  const before = read(process.argv[2]),
    after = read(process.argv[3]);
  console.log(
    JSON.stringify({
      mode: "PREVIEW_ONLY",
      before: before.version,
      after: after.version,
      ...compareCatalogs(before.accounts, after.accounts)
    })
  );
} catch {
  console.error(
    "Catalog comparison refused: two fully reviewed normalized manifests are required."
  );
  process.exitCode = 1;
}
