# Dependency triage — 2026-10-07

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
