/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const path = require("node:path");
const dbRequire = createRequire(path.resolve(__dirname, "../packages/db/package.json"));
const configRequire = createRequire(dbRequire.resolve("prisma/config"));
test("Prisma 6 loads actual trusted TypeScript CLI config with scoped deepmerge 8", async () => {
  const { loadConfigFromFile } = configRequire("@prisma/config");
  const result = await loadConfigFromFile({
    configRoot: path.resolve(__dirname, "../packages/db/test/fixtures")
  });
  assert.equal(result.error, undefined);
  assert.equal(
    result.config.schema,
    path.resolve(__dirname, "../packages/db/prisma/schema.prisma")
  );
  assert.equal(
    result.config.migrations.path,
    path.resolve(__dirname, "../packages/db/prisma/migrations")
  );
});
test("patched merge supports circular graphs instead of exhausting the call stack", () => {
  const { deepmerge } = createRequire(configRequire.resolve("@prisma/config"))("deepmerge-ts");
  const first = { name: "first" },
    second = { name: "second" };
  first.self = first;
  second.self = second;
  const result = deepmerge(first, second);
  assert.equal(result.name, "second");
  assert.equal(result.self, result);
  assert.deepEqual(
    deepmerge(
      { migrations: { path: "before" }, schema: "schema" },
      { migrations: { path: "after" } }
    ),
    { schema: "schema", migrations: { path: "after" } }
  );
});
