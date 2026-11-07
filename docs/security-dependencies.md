# Dependency security triage

## Security refresh — 2026-11-07

The production audit reproduced five blocked advisories: one critical, three
high and one moderate. Remediation updates the affected packages, not the
audit policy. `scripts/security-audit.cjs` is unchanged and the exception
allowlist remains empty.

| Dependency  | Before  | Patched target | Advisory                                                                                                                                           |
| ----------- | ------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js     | 15.5.27 | 15.5.28        | [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) |
| body-parser | 2.3.0   | 2.4.0          | [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828)                                                                           |
| multer      | 2.4.0   | 2.5.0          | [GHSA-q7qp-rjg7-q26m](https://github.com/advisories/GHSA-q7qp-rjg7-q26m)                                                                           |
| qs          | 6.16.0  | 6.16.1         | [GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw)                                                                           |

Next's ESLint plugin is aligned to 15.5.28. Next stays on the 15.5 release
line; Nest, Express, React, Prisma and pnpm are not upgraded. The existing
multer override is updated. body-parser and qs overrides target only their
previously resolved vulnerable versions; they do not force unrelated major
versions into the dependency graph. The lockfile includes the corresponding
Next platform compiler packages and all affected production dependency paths.
The existing sharp 0.35.5 mitigation is retained.

CI now checks the installed dependency paths and the audit gate's fail-closed
behavior before running the live production audit. Synthetic advisories prove
that low, moderate, high and critical findings still fail without a matching
exception, unavailable/malformed advisory responses fail, and exception
matching remains restricted by advisory, package, version and expiration.
No severity is hidden and no `continue-on-error`, audit disabling or new
exception is introduced.

The live audit after lockfile regeneration reports zero advisories and
`gate: PASS`. This is a dated result, not a guarantee against future security
reports or proof that every application deployment is unexploitable.
Previously failed GitHub runs retain their historical failure status; a new
run against the updated commit must pass the gate.

### Verification

- Frozen-lockfile installation passed both in the main checkout and in a
  fresh isolated source copy without private environment files.
- Lint, typecheck and production builds passed for the active workspaces.
- All 340 workspace unit tests and 44 script/safety contracts passed.
  The eight new security contracts were also rerun in the main checkout,
  including the qs comma-encoding regression with a non-callable toString.
- The production audit reports zero advisories and `gate: PASS`.
- Local database integration and browser E2E were not run: Docker was not
  running. Their existing GitHub CI jobs remain enabled and unchanged.
- Remote CI results are pending at commit time; no earlier phase's green
  result is reused as evidence for this update.

## FAS 24 remediation — historical (2026-10-07)

Before this phase: 1 HIGH, deepmerge-ts 7.1.5. After: 0 advisories in raw
production audit and fail-closed gate. Scoped @prisma/config@6.17.1 override
uses deepmerge-ts 8.0.0. Actual trusted TS config and cyclic-graph regression,
generator, migrations and build pass; no Prisma/framework major upgrade.
Exact expiring HIGH exception removed, not extended. [Path/reachability/
compatibility evidence](fas24-release-gate.md#dependency-remediation).
The triage table and residual-exception paragraph below are historical FAS 23
findings; the exception is no longer active and P0-02 is locally COMPLETE.

`pnpm audit --prod --json` before: 15 advisories, 1 low / 4 moderate /
9 high / 1 critical. All paths below are transitive production-install paths.
After compatible overrides: **1 high, 0 critical, 0 moderate, 0 low**.
No `audit fix --force`, framework major or Prisma major change.

| Advisory                     | Path/module before → after                   | Reachability decision                                                                |
| ---------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| GHSA-38f7-945m-qr2g HIGH     | Prisma → config → effect 3.16.12 → 3.20.0    | Likely non-reachable HTTP; CLI scheduler updated anyway                              |
| GHSA-qx2v-qp2m-jg93 MODERATE | Next → postcss 8.4.31 → 8.5.23               | Likely build-only; trusted source CSS                                                |
| GHSA-6g55-p6wh-862q HIGH     | Next → postcss                               | Likely build-only; updated                                                           |
| GHSA-fxqj-rqcc-2cmp MODERATE | Next → postcss                               | Likely build-only; updated                                                           |
| GHSA-r28c-9q8g-f849 HIGH     | Next → postcss                               | Likely build-only; updated                                                           |
| GHSA-ggr8-5vv4-36mx HIGH     | Prisma 6.17.1 → config → deepmerge-ts 7.1.5  | Remaining; likely non-reachable HTTP, CLI reads trusted static config only           |
| GHSA-wc9g-mqfw-jrwm HIGH     | Nest platform-express → multer 2.2.0 → 2.4.0 | Reachable authenticated multipart uploads                                            |
| GHSA-qfvm-cv95-jqjf HIGH     | Nest → multer                                | Reachable; updated                                                                   |
| GHSA-qvfw-j98x-7q72 LOW      | Nest → multer                                | Reachable; updated                                                                   |
| GHSA-535w-7cp7-47q4 HIGH     | Nest → multer                                | Reachable; updated                                                                   |
| GHSA-3pph-fpjx-jg34 MODERATE | Nest → multer                                | Reachable; updated                                                                   |
| GHSA-r3ph-w7gj-g6xm MODERATE | Swagger → js-yaml 5.3.0 → 5.4.1              | Likely non-reachable untrusted YAML; no user YAML input; production Swagger disabled |
| GHSA-68fv-2mgg-jv7q HIGH     | Next → postcss → source-map-js 1.2.1 → 1.2.2 | Likely build-only; no source map uploads                                             |
| GHSA-jqcg-44mw-7w3h CRITICAL | Nest → Express → proxy-addr 2.0.7 → 2.0.8    | Request/IP boundary; no broad trust-proxy enabled, updated anyway                    |
| GHSA-wq5f-xc86-pv6w HIGH     | Next → sharp 0.35.4 → 0.35.5                 | Image optimizer runtime potential; updated                                           |

Each ID resolves to `https://github.com/advisories/<ID>`; authoritative
maintainer advisories and release notes were consulted. These are reachability
assessments, not exploit proofs. CI is configured to build on Linux; no actual
remote CI run or Linux image-optimizer runtime is claimed verified here.

Residual exception is exact package/version/advisory, expires 2026-11-07.
`node scripts/security-audit.cjs` fails on new advisories, a changed vulnerable
version, an expired exception or an unavailable registry; it never suppresses
all HIGHs. Follow-up P0-02: review supported Prisma 6 upgrade or vetted config
patch for deepmerge-ts 8 compatibility, then remove the exception. Do not merge
attacker-controlled objects into Prisma CLI config. P0-02 remains PARTIAL.
