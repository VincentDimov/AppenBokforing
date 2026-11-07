/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const auditSource = readFileSync(path.join(root, "scripts/security-audit.cjs"), "utf8");
const webRequire = createRequire(path.join(root, "apps/web/package.json"));
const apiRequire = createRequire(path.join(root, "apps/api/package.json"));
const platformRequire = createRequire(apiRequire.resolve("@nestjs/platform-express/package.json"));
const expressRequire = createRequire(platformRequire.resolve("express/package.json"));
const bodyRequire = createRequire(expressRequire.resolve("body-parser/package.json"));

function atLeast(actual, minimum) {
  assert.match(actual, /^\d+\.\d+\.\d+$/);
  const parts = actual.split(".").map(Number);
  const wanted = minimum.split(".").map(Number);
  for (let i = 0; i < wanted.length; i++) {
    if (parts[i] !== wanted[i]) {
      assert.ok(parts[i] > wanted[i], `${actual} is older than patched ${minimum}`);
      return;
    }
  }
}

test("installed production dependency paths resolve patched versions", () => {
  const next = webRequire("next/package.json").version;
  const manifest = require("../apps/web/package.json");
  assert.equal(next, manifest.dependencies.next);
  assert.match(next, /^15\.5\./, "Review security ranges before changing the Next release line");
  assert.equal(require("../package.json").devDependencies["@next/eslint-plugin-next"], next);
  atLeast(next, "15.5.28");
  atLeast(platformRequire("multer/package.json").version, "2.5.0");
  atLeast(expressRequire("body-parser/package.json").version, "2.4.0");
  atLeast(expressRequire("qs/package.json").version, "6.16.1");
  atLeast(bodyRequire("qs/package.json").version, "6.16.1");
  const qs = expressRequire("qs");
  assert.deepEqual(qs.parse("filter[active]=true&account=1930"), {
    filter: { active: "true" },
    account: "1930"
  });
  assert.equal(qs.stringify({ account: "1930" }), "account=1930");
  // GHSA-6pq8-jhm2-2vcw: an own non-callable toString must not crash comma encoding.
  assert.doesNotThrow(() => qs.stringify({ a: [{ toString: "x" }] }, { arrayFormat: "comma" }));
});

function advisory(severity = "high", version = "1.0.0") {
  return {
    github_advisory_id: "GHSA-test-only",
    module_name: "synthetic-dependency",
    severity,
    findings: [{ version }]
  };
}

function runGate(advisories = [], exceptions = [], resultOverride) {
  let output = "";
  const processStub = {
    execPath: process.execPath,
    env: {},
    stdout: { write: (s) => (output += s) }
  };
  vm.runInNewContext(auditSource, {
    __dirname: path.join(root, "scripts"),
    process: processStub,
    require: (name) => {
      if (name === "node:path") return path;
      if (name === "../ops/security-audit-allowlist.json") return exceptions;
      assert.equal(name, "node:child_process");
      return {
        spawnSync: (_executable, args) => {
          assert.deepEqual(Array.from(args).slice(1), ["audit", "--prod", "--json"]);
          return (
            resultOverride ?? {
              stdout: JSON.stringify({ advisories, metadata: { vulnerabilities: {} } })
            }
          );
        }
      };
    }
  });
  return { exitCode: processStub.exitCode, output };
}

test("audit gate passes a clean advisory response", () => {
  const result = runGate();
  assert.equal(result.exitCode, 0);
  assert.match(result.output, /"gate":"PASS"/);
});

for (const severity of ["low", "moderate", "high", "critical"]) {
  test(`audit gate still blocks unexcepted ${severity} advisories`, () => {
    const result = runGate([advisory(severity)]);
    assert.equal(result.exitCode, 1);
    assert.match(result.output, /"decision":"blocked"/);
    assert.match(result.output, /"gate":"FAIL"/);
  });
}

test("audit gate rejects unavailable or invalid advisory service responses", () => {
  assert.throws(() => runGate([], [], { error: new Error("offline") }), /unavailable/);
  assert.throws(() => runGate([], [], { stdout: "{}" }), /Invalid audit response/);
  assert.throws(() => runGate([], [], { stdout: "not-json" }));
});

test("audit exceptions remain restricted by package, version, advisory and expiration", () => {
  const valid = {
    id: "GHSA-test-only",
    package: "synthetic-dependency",
    version: "1.0.0",
    expires: "2999-01-01"
  };
  assert.equal(runGate([advisory()], [valid]).exitCode, 0);
  for (const changed of [
    { ...valid, id: "GHSA-different" },
    { ...valid, package: "different-dependency" },
    { ...valid, version: "1.0.1" },
    { ...valid, expires: "2000-01-01" }
  ]) {
    assert.equal(runGate([advisory()], [changed]).exitCode, 1);
  }
  assert.equal(runGate([advisory("high", "1.0.1")], [valid]).exitCode, 1);
});
