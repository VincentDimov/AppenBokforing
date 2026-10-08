import { defineConfig } from "@playwright/test";
import path from "node:path";
import { randomBytes } from "node:crypto";
// Shared fail-closed guard also runs when Playwright is invoked directly.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { assertLocalStack } = require("../../scripts/e2e-safety.cjs") as {
  assertLocalStack: (env: NodeJS.ProcessEnv) => void;
};
assertLocalStack(process.env);
const root = path.resolve(__dirname, "../..");
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:4310";
const apiURL = process.env.E2E_API_URL || "http://127.0.0.1:4410";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/local.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: "node apps/api/dist/main.js",
      cwd: root,
      url: apiURL + "/health",
      reuseExistingServer: false,
      env: {
        NODE_ENV: "test",
        DATABASE_URL: process.env.E2E_DATABASE_URL!,
        API_HOST: new URL(apiURL).hostname,
        API_PORT: new URL(apiURL).port,
        JWT_ACCESS_SECRET: process.env.E2E_ACCESS_SECRET || randomBytes(48).toString("hex"),
        JWT_REFRESH_SECRET: process.env.E2E_REFRESH_SECRET || randomBytes(48).toString("hex"),
        ARGON2_MEMORY_COST: "8192",
        ARGON2_TIME_COST: "2",
        CORS_ORIGIN: baseURL
      }
    },
    {
      command:
        "corepack pnpm@9.15.4 --filter @ledgerapp/web exec next start --hostname " +
        new URL(baseURL).hostname +
        " --port " +
        new URL(baseURL).port,
      cwd: root,
      url: baseURL + "/login",
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: "production",
        API_INTERNAL_URL: apiURL,
        DATABASE_URL: "",
        E2E_DATABASE_URL: "",
        JWT_ACCESS_SECRET: "",
        JWT_REFRESH_SECRET: "",
        E2E_ACCESS_SECRET: "",
        E2E_REFRESH_SECRET: "",
        S3_ACCESS_KEY_ID: "",
        S3_SECRET_ACCESS_KEY: ""
      }
    }
  ]
});
