"use strict";
// Explicit operator-only import; never invoked by migration, startup or seed.
const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { createRequire } = require("node:module");
const dbRequire = createRequire(path.resolve(__dirname, "../packages/db/package.json"));
const { PrismaClient } = dbRequire("@prisma/client");
async function main() {
  if (!process.argv.includes("--authorize") || process.env.BAS_CATALOG_IMPORT_ENABLED !== "true")
    throw new Error("Explicit operator authorization required.");
  const filename = process.env.BAS_CATALOG_INPUT_FILE;
  const approved = process.env.BAS_CATALOG_APPROVED_SHA256;
  if (!filename || !/^[a-f0-9]{64}$/.test(approved ?? "") || !process.env.DATABASE_URL)
    throw new Error("Missing protected operator configuration.");
  const stat = fs.statSync(filename);
  if (!stat.isFile() || stat.size > 12 * 1024 * 1024)
    throw new Error("Invalid bounded catalog file.");
  const bytes = fs.readFileSync(filename);
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== approved)
    throw new Error("Input does not match independently reviewed approved SHA-256.");
  const {
    validateAuthorizedCatalog,
    defaultActive
  } = require("../apps/api/dist/accounts/bas/catalog-validation.js");
  const c = validateAuthorizedCatalog(JSON.parse(bytes.toString("utf8")));
  const db = new PrismaClient();
  try {
    const result = await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(37037,1)`;
        const existing = await tx.basCatalogVersion.findUnique({ where: { version: c.version } });
        if (existing) {
          if (existing.contentSha256 !== hash)
            throw new Error("Immutable catalog version already has different content.");
          if (process.argv.includes("--make-default")) {
            await tx.basCatalogVersion.updateMany({
              where: { isDefault: true },
              data: { isDefault: false }
            });
            await tx.basCatalogVersion.update({
              where: { id: existing.id },
              data: { isDefault: true }
            });
          }
          return { status: "ALREADY_IMPORTED", count: existing.rowCount };
        }
        const version = await tx.basCatalogVersion.create({
          data: {
            id: randomUUID(),
            version: c.version,
            sourceVersion: c.sourceVersion,
            sourceReference: c.sourceReference,
            sourceSha256: c.sourceSha256,
            contentSha256: hash,
            licenseReference: c.licenseReference,
            classificationReviewReference: c.classificationReviewReference,
            verificationReport: c.verification,
            rowCount: c.accounts.length,
            isDefault: false
          }
        });
        await tx.basAccountCatalog.createMany({
          data: c.accounts.map((row) => ({
            id: randomUUID(),
            catalogVersionId: version.id,
            accountNumber: row.number,
            officialName: row.officialName,
            accountClass: row.number[0],
            accountGroup: row.number.slice(0, 2),
            className: row.className,
            groupName: row.groupName,
            category: row.category,
            parentAccountNumber: row.parentAccountNumber,
            isK2Restricted: row.isK2Restricted,
            isDefaultActive: defaultActive(row),
            isBookable: row.isBookable,
            type: row.type,
            normalBalance: row.normalBalance,
            classificationReference: row.classificationReference,
            sourcePosition: row.sourcePosition
          }))
        });
        if (process.argv.includes("--make-default")) {
          await tx.basCatalogVersion.updateMany({
            where: { isDefault: true },
            data: { isDefault: false }
          });
          await tx.basCatalogVersion.update({
            where: { id: version.id },
            data: { isDefault: true }
          });
        }
        return {
          status: "IMPORTED",
          count: c.accounts.length,
          defaultSelected: process.argv.includes("--make-default")
        };
      },
      { timeout: 30000 }
    );
    console.log(JSON.stringify(result));
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "BAS catalog import refused. Check authorization, approved data and database prerequisites; no source data or credentials are logged."
  );
  process.exitCode = 1;
});
