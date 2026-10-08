/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { execFileSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const path = require("node:path");
const { assertLocalStack } = require("./e2e-safety.cjs");
assertLocalStack(process.env);
const env = {
  ...process.env,
  DATABASE_URL: process.env.E2E_DATABASE_URL,
  E2E_ACCESS_SECRET: randomBytes(48).toString("hex"),
  E2E_REFRESH_SECRET: randomBytes(48).toString("hex")
};
const pnpmBin = path.resolve(__dirname, "../node_modules/pnpm/bin/pnpm.cjs");
function pnpm(args, extraEnv = {}) {
  execFileSync(process.execPath, [pnpmBin, ...args], {
    env: { ...env, ...extraEnv },
    stdio: "inherit"
  });
}
pnpm(["--filter", "@ledgerapp/db", "build"]);
pnpm(["--filter", "@ledgerapp/sie", "build"]);
pnpm(["--filter", "@ledgerapp/api", "build"]);
pnpm(["--filter", "@ledgerapp/web", "build"], {
  API_INTERNAL_URL: process.env.E2E_API_URL || "http://127.0.0.1:4410",
  DATABASE_URL: "",
  E2E_DATABASE_URL: "",
  E2E_ACCESS_SECRET: "",
  E2E_REFRESH_SECRET: "",
  JWT_ACCESS_SECRET: "",
  JWT_REFRESH_SECRET: "",
  S3_ACCESS_KEY_ID: "",
  S3_SECRET_ACCESS_KEY: "",
  PLATFORM_ADMIN_MFA_ENCRYPTION_KEY: "",
  MASTER_ADMIN_BOOTSTRAP_ENABLED: "false",
  MASTER_ADMIN_BOOTSTRAP_PASSWORD: ""
});
pnpm([
  "--filter",
  "@ledgerapp/db",
  "exec",
  "prisma",
  "migrate",
  "deploy",
  "--schema",
  "prisma/schema.prisma"
]);
pnpm([
  "exec",
  "playwright",
  "test",
  "--config",
  "apps/web/playwright.config.ts",
  ...process.argv.slice(2)
]);
