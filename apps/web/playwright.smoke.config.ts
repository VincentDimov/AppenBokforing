import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/smoke.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "https://bokforingsappen.vercel.app",
    browserName: "chromium",
    trace: "off",
    screenshot: "off",
    video: "off"
  }
});
