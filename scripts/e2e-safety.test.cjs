/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { assertLocalStack } = require("./e2e-safety.cjs");
const safe = { E2E_DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/ledgerapp_e2e" };
test("allows dedicated loopback stack", () => assert.doesNotThrow(() => assertLocalStack(safe)));
for (const env of [
  {},
  { E2E_DATABASE_URL: "postgresql://test:test@remote.invalid/ledgerapp_e2e" },
  { E2E_DATABASE_URL: "postgresql://test:test@localhost/ledgerapp" },
  { E2E_DATABASE_URL: safe.E2E_DATABASE_URL + "?host=remote.invalid" },
  { ...safe, E2E_BASE_URL: "https://bokforingsappen.vercel.app" },
  { ...safe, E2E_API_URL: "https://remote.invalid" }
])
  test("fails closed for unsafe stack " + JSON.stringify(env), () =>
    assert.throws(() => assertLocalStack(env))
  );
