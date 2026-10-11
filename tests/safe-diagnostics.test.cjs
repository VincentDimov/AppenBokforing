/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { redact, diagnostics, fingerprint } = require("../scripts/safe-diagnostics.cjs");
test("identifies the prepared-plan root cause without exposing SQL", () => {
  const result = diagnostics(
    Object.assign(new Error("cached plan must not change result type; private values"), {
      code: "P2010",
      meta: { code: "0A000" }
    })
  );
  assert.equal(result.reason, "CACHED_PLAN_RESULT_TYPE_CHANGED");
  assert.equal(result.sqlstate, "0A000");
  assert.ok(!JSON.stringify(result).includes("private"));
});
test("redacts URL credentials, env secrets, headers and JWTs", () => {
  const value = redact(
    "postgresql://user:pw@host/db https://x/?token=abc\nCookie: session=private\nAuthorization: Bearer private\nsecret=hidden eyJabc.def.ghi env-private",
    { JWT_ACCESS_SECRET: "env-private" }
  );
  for (const secret of [
    "user",
    "pw@",
    "token=abc",
    "session=private",
    "Bearer private",
    "hidden",
    "eyJabc",
    "env-private"
  ])
    assert.ok(!value.includes(secret));
});
test("diagnostics retain codes and safe context but omit personal rows and params", () => {
  const error = Object.assign(new Error("private@example.test SECRET SQL VALUES ('private')"), {
    code: "P2010",
    meta: { code: "23514", message: 'violates constraint "bas_parent_reference"' }
  });
  const result = diagnostics(error, {
    stage: "seed",
    expectedHash: fingerprint([1]),
    actualHash: fingerprint([2])
  });
  assert.equal(result.sqlstate, "23514");
  assert.equal(result.code, "P2010");
  assert.equal(result.constraint, "bas_parent_reference");
  assert.ok(!JSON.stringify(result).includes("private"));
  assert.notEqual(result.expectedHash, result.actualHash);
});
test("migration subprocess diagnostics identify migration and SQLSTATE without dumping output", () => {
  const result = diagnostics({
    name: "Error",
    stderr:
      "Migration name: 20261009010000_bas_catalog\nDatabase error code: 23514\npassword=private"
  });
  assert.equal(result.migration, "20261009010000_bas_catalog");
  assert.equal(result.sqlstate, "23514");
  assert.ok(!JSON.stringify(result).includes("private"));
});
