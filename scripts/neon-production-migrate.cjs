/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { spawnSync } = require("node:child_process");
const { createRequire } = require("node:module");
const path = require("node:path");

const TARGET = Object.freeze({
  repository: "VincentDimov/AppenBokforing",
  project: "plain-boat-63257376",
  branch: "br-solitary-scene-baw6obms",
  endpoint: "ep-square-bird-bahcwu9y",
  host: "ep-square-bird-bahcwu9y.c-8.eu-central-1.aws.neon.tech",
  database: "neondb",
  role: "neondb_owner"
});

function validateContext(env) {
  if (
    env.GITHUB_ACTIONS !== "true" ||
    env.GITHUB_EVENT_NAME !== "push" ||
    env.GITHUB_REF !== "refs/heads/master" ||
    env.GITHUB_REPOSITORY !== TARGET.repository ||
    !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || "")
  ) {
    throw new Error("Production migrations require this repository's master push workflow.");
  }
  if (env.NEON_PROJECT_ID !== TARGET.project) {
    throw new Error("NEON_PROJECT_ID is missing or does not match Ledgerapp production.");
  }
  if (!env.NEON_API_KEY || !env.GH_TOKEN) {
    throw new Error("NEON_API_KEY or the workflow GitHub token is missing.");
  }
}

function validateConnection(uri) {
  let connection;
  try {
    connection = new URL(uri);
  } catch {
    throw new Error("Neon returned an invalid connection URI.");
  }
  if (
    !["postgres:", "postgresql:"].includes(connection.protocol) ||
    connection.hostname !== TARGET.host ||
    !["", "5432"].includes(connection.port) ||
    connection.pathname !== `/${TARGET.database}` ||
    connection.username !== TARGET.role ||
    !connection.password ||
    !["require", "verify-full"].includes(connection.searchParams.get("sslmode"))
  ) {
    throw new Error("Neon connection does not match the approved direct production target.");
  }
  return uri;
}

async function getJson(fetchFn, url, token, provider) {
  const response = await fetchFn(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) {
    // Never print response bodies: they can contain credentials or internal connection details.
    throw new Error(`${provider} request failed (HTTP ${response.status}).`);
  }
  return response.json();
}

function resolvePrismaCli(dbDirectory = path.resolve(__dirname, "../packages/db")) {
  const dbRequire = createRequire(path.join(dbDirectory, "package.json"));
  try {
    // The package root export is a types module, not the CLI executable.
    return dbRequire.resolve("prisma/build/index.js");
  } catch {
    throw new Error("Pinned Prisma CLI could not be resolved.");
  }
}

function applyMigrations(uri, env) {
  const dbDirectory = path.resolve(__dirname, "../packages/db");
  const childEnv = { ...env, DATABASE_URL: uri };
  delete childEnv.NEON_API_KEY;
  delete childEnv.GH_TOKEN;
  delete childEnv.GITHUB_TOKEN;
  const result = spawnSync(
    process.execPath,
    [resolvePrismaCli(dbDirectory), "migrate", "deploy", "--schema", "prisma/schema.prisma"],
    { cwd: dbDirectory, env: childEnv, encoding: "utf8", timeout: 8 * 60 * 1000 }
  );
  // Prisma diagnostics can contain connection details. Expose only error codes, not raw output.
  if (result.error || result.status !== 0) {
    const codes = [
      ...new Set(`${result.stdout || ""}\n${result.stderr || ""}`.match(/\bP\d{4}\b/g))
    ];
    throw new Error(`Prisma migration failed${codes.length ? ` (${codes.join(", ")})` : ""}.`);
  }
}

async function migrateProduction({
  env = process.env,
  fetchFn = fetch,
  apply = applyMigrations
} = {}) {
  validateContext(env);
  const head = await getJson(
    fetchFn,
    `https://api.github.com/repos/${TARGET.repository}/git/ref/heads/master`,
    env.GH_TOKEN,
    "GitHub"
  );
  if (!head.object || !/^[a-f0-9]{40}$/.test(head.object.sha || "")) {
    throw new Error("Cannot verify the current master commit.");
  }
  if (head.object.sha !== env.GITHUB_SHA) {
    return "Skipped superseded master commit; the newer push owns the next migration run.";
  }
  const url = new URL(`https://console.neon.tech/api/v2/projects/${TARGET.project}/connection_uri`);
  url.search = new URLSearchParams({
    branch_id: TARGET.branch,
    endpoint_id: TARGET.endpoint,
    database_name: TARGET.database,
    role_name: TARGET.role,
    pooled: "false"
  }).toString();
  const response = await getJson(fetchFn, url.toString(), env.NEON_API_KEY, "Neon");
  const uri = validateConnection(response.uri);
  // The connection remains in process memory only: no .env, workflow output, artifact or CLI arg.
  await apply(uri, env);
  return "Neon production migrations are up to date. No seed, reset or db push was run.";
}

if (require.main === module) {
  migrateProduction().then(
    (message) => console.log(message),
    (error) => {
      // Do not serialize arbitrary errors from fetch/URL/Prisma or print their stack.
      const safeMessages = [
        /^Production migrations require /,
        /^NEON_PROJECT_ID is /,
        /^NEON_API_KEY or /,
        /^Neon returned an invalid /,
        /^Neon connection does not /,
        /^(GitHub|Neon) request failed \(HTTP \d{3}\)\.$/,
        /^Cannot verify the current master commit\.$/,
        /^Pinned Prisma CLI could not be resolved\.$/,
        /^Prisma migration failed(?: \(P\d{4}(?:, P\d{4})*\))?\.$/
      ];
      console.error(
        safeMessages.some((pattern) => pattern.test(error.message || ""))
          ? error.message
          : "Neon production migration failed; credentials and raw diagnostics were withheld."
      );
      process.exitCode = 1;
    }
  );
}

module.exports = {
  TARGET,
  validateContext,
  validateConnection,
  resolvePrismaCli,
  migrateProduction
};
