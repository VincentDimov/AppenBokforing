/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const exceptions = require("../ops/security-audit-allowlist.json");
const result = spawnSync(
  process.execPath,
  [path.resolve(__dirname, "../node_modules/pnpm/bin/pnpm.cjs"), "audit", "--prod", "--json"],
  {
    encoding: "utf8",
    timeout: 60000,
    env: { ...process.env, npm_config_fetch_timeout: "15000", npm_config_fetch_retries: "0" }
  }
);
if (result.error || !result.stdout)
  throw new Error("Dependency advisory service unavailable; audit gate cannot pass.");
const audit = JSON.parse(result.stdout);
if (!audit.advisories || !audit.metadata)
  throw new Error("Invalid audit response; gate cannot pass.");
let blocked = false;
for (const advisory of Object.values(audit.advisories)) {
  const exception = exceptions.find(
    (e) =>
      e.id === advisory.github_advisory_id &&
      e.package === advisory.module_name &&
      new Date(e.expires + "T00:00:00Z") > new Date() &&
      advisory.findings.every((f) => f.version === e.version)
  );
  process.stdout.write(
    JSON.stringify({
      id: advisory.github_advisory_id,
      package: advisory.module_name,
      severity: advisory.severity,
      decision: exception ? "time-bounded-exception" : "blocked"
    }) + "\n"
  );
  if (!exception) blocked = true;
}
process.stdout.write(
  JSON.stringify({
    vulnerabilities: audit.metadata.vulnerabilities,
    gate: blocked ? "FAIL" : "PASS_WITH_DOCUMENTED_EXCEPTIONS"
  }) + "\n"
);
process.exitCode = blocked ? 1 : 0;
