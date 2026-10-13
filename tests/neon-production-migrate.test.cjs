/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const {
  TARGET,
  validateContext,
  validateConnection,
  resolvePrismaCli,
  migrateProduction
} = require("../scripts/neon-production-migrate.cjs");

const env = {
  GITHUB_ACTIONS: "true",
  GITHUB_EVENT_NAME: "push",
  GITHUB_REF: "refs/heads/master",
  GITHUB_REPOSITORY: TARGET.repository,
  GITHUB_SHA: "a".repeat(40),
  NEON_PROJECT_ID: TARGET.project,
  NEON_API_KEY: "synthetic-key-not-real",
  GH_TOKEN: "synthetic-github-token"
};
const uri = `postgresql://${TARGET.role}:synthetic-password@${TARGET.host}/neondb?sslmode=require`;

test("resolves and executes the real pinned Prisma CLI rather than its package-root types export", () => {
  const cli = resolvePrismaCli();
  assert.ok(fs.existsSync(cli));
  assert.match(cli, /[\\/]prisma[\\/]build[\\/]index\.js$/);
  const version = execFileSync(process.execPath, [cli, "--version"], {
    cwd: os.tmpdir(),
    env: { ...process.env, DATABASE_URL: "", NEON_API_KEY: "", GH_TOKEN: "" },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
    encoding: "utf8"
  });
  assert.match(version, /prisma\s*:\s*6\.17\.1/);
  assert.throws(() => resolvePrismaCli(os.tmpdir()), /Pinned Prisma CLI could not be resolved/);
});

test("local runs, PRs, other repositories and branches cannot access production", () => {
  for (const overrides of [
    { GITHUB_ACTIONS: undefined },
    { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_REF: "refs/heads/feature" },
    { GITHUB_REPOSITORY: "someone/fork" },
    { GITHUB_SHA: "not-a-commit" },
    { NEON_PROJECT_ID: "different-project" },
    { NEON_API_KEY: "" },
    { GH_TOKEN: "" }
  ]) {
    assert.throws(() => validateContext({ ...env, ...overrides }));
  }
  assert.doesNotThrow(() => validateContext(env));
});

test("only the approved direct owner connection with TLS is accepted", () => {
  assert.equal(validateConnection(uri), uri);
  for (const candidate of [
    undefined,
    "not-a-uri",
    uri.replace(TARGET.host, "attacker.example"),
    uri.replace(".c-8", "-pooler.c-8"),
    uri.replace("/neondb", "/wrong_database"),
    uri.replace(TARGET.role, "ledgerapp_api"),
    uri.replace("sslmode=require", "sslmode=disable"),
    uri.replace("synthetic-password", ""),
    uri.replace("postgresql:", "https:")
  ]) {
    assert.throws(() => validateConnection(candidate));
  }
});

test("latest master fetches an explicit branch and applies exactly once without returning secrets", async () => {
  const calls = [];
  let applied = 0;
  const result = await migrateProduction({
    env,
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => (calls.length === 1 ? { object: { sha: env.GITHUB_SHA } } : { uri })
      };
    },
    apply: async (connection) => {
      assert.equal(connection, uri);
      applied++;
    }
  });
  assert.equal(applied, 1);
  const request = new URL(calls[1].url);
  assert.equal(request.searchParams.get("branch_id"), TARGET.branch);
  assert.equal(request.searchParams.get("endpoint_id"), TARGET.endpoint);
  assert.equal(request.searchParams.get("pooled"), "false");
  assert.equal(calls[1].options.redirect, "error");
  assert.ok(!result.includes("synthetic-password"));
  assert.ok(!calls[1].url.includes(env.NEON_API_KEY));
});

test("superseded master commits do not even request a Neon connection", async () => {
  let calls = 0;
  const result = await migrateProduction({
    env,
    fetchFn: async () => {
      calls++;
      return { ok: true, json: async () => ({ object: { sha: "b".repeat(40) } }) };
    },
    apply: () => assert.fail("must not migrate superseded commits")
  });
  assert.equal(calls, 1);
  assert.match(result, /Skipped/);
});

test("API errors and invalid targets fail closed without exposing response secrets", async () => {
  for (const response of [
    { ok: false, status: 403, json: async () => ({ password: "secret" }) },
    { ok: true, json: async () => ({ uri: uri.replace(TARGET.host, "wrong.example") }) }
  ]) {
    let calls = 0;
    await assert.rejects(
      migrateProduction({
        env,
        fetchFn: async () =>
          ++calls === 1
            ? { ok: true, json: async () => ({ object: { sha: env.GITHUB_SHA } }) }
            : response,
        apply: () => assert.fail("must not migrate after API/target failure")
      }),
      (error) => !error.message.includes("secret") && !error.message.includes("synthetic-password")
    );
  }
});

test("migration failures propagate instead of reporting success", async () => {
  let calls = 0;
  await assert.rejects(
    migrateProduction({
      env,
      fetchFn: async () => ({
        ok: true,
        json: async () => (++calls === 1 ? { object: { sha: env.GITHUB_SHA } } : { uri })
      }),
      apply: () => {
        throw new Error("migration rejected");
      }
    }),
    /migration rejected/
  );
});

test("workflow gates production on all CI jobs and serializes without cancellation", () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, "../.github/workflows/ci.yml"), "utf8");
  const production = workflow.split("\n  migrate-neon-production:")[1];
  assert.ok(production);
  assert.match(production, /needs: \[verify, browser-e2e, recovery-runtime-gate\]/);
  assert.match(production, /github.event_name == 'push'/);
  assert.match(production, /github.ref == 'refs\/heads\/master'/);
  assert.match(production, /cancel-in-progress: false/);
  assert.match(production, /persist-credentials: false/);
  assert.match(production, /--frozen-lockfile --prod=false/);
  assert.ok(production.indexOf("NEON_API_KEY:") > production.indexOf("pnpm install"));
  assert.ok(!/pull_request_target|db:push|db:seed|migrate reset/.test(production));
});
