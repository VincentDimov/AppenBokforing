/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// Deliberately not imported by startup, build, seed or migrations.
const { PrismaClient } = require("../packages/db/dist");
const { ConfigService } = require("../apps/api/node_modules/@nestjs/config");
const { AuthSettingsService } = require("../apps/api/dist/auth/auth-settings.service");
const { bootstrapPlatformAdmin } = require("../apps/api/dist/platform-admin/bootstrap");

async function main() {
  const authorized = process.argv.slice(2).length === 1 && process.argv[2] === "--authorize";
  if (!authorized || process.env.MASTER_ADMIN_BOOTSTRAP_ENABLED !== "true")
    throw new Error("Operator authorization and bootstrap flag are required.");
  if (!process.env.DATABASE_URL) throw new Error("Operator DATABASE_URL is required.");
  const policy = new AuthSettingsService(new ConfigService(process.env));
  const db = new PrismaClient();
  try {
    const result = await bootstrapPlatformAdmin(db, process.env, authorized, policy);
    console.log(
      `Platform bootstrap: ${result.status}. Remove bootstrap secrets and disable the flag.`
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  // Database exceptions can contain sensitive values. No raw errors here.
  console.error(
    "Platform bootstrap refused/failed. Check explicit authorization, configuration, existing identities and migration state."
  );
  process.exitCode = 1;
});
