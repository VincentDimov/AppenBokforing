# FAS 24 — final P0 disposition, 2026-10-07

Decision: **GO FOR P1 WITH EXPLICIT P0 BLOCKERS**. P1 may proceed in parallel
on isolated development data. Do not deploy these findings as approval for real
bookkeeping. No P1 feature, production mutation, commit, push or deployment was
performed. New changes must receive a complete remote CI run before merging.

## Remote evidence, not inferred from local tests

HEAD/master: `4188ca6b6c506f6206abb73e075e0e9155713ba2`.
[GitHub run 37665799633](https://github.com/VincentDimov/AppenBokforing/actions/runs/37665799633):
verify SUCCESS; browser-e2e CANCELLED. Job 112944566150 exhausted its 20-minute
budget in `playwright install --with-deps chromium`: Ubuntu/Azure apt mirrors
stalled. Browser safety/test steps were skipped, not passed. The earlier type
error is fixed: this HEAD's verify typecheck succeeded remotely.

Local correction pins browser runner Ubuntu 24.04, uses canonical HTTPS Ubuntu
archives, bounds apt requests and separates OS dependency/browser installation.
No continue-on-error, exclusions or bypass. Added hard-failing recovery job
executes fresh migration, DB/blob restore, runtime LOGIN, real storage races
and older-schema upgrade. **Neither new workflow path has run remotely yet.**

Vercel deployment `dpl_3qZswQ2MQhx5gRCSUXdfmgSR6VXX` is READY, target production,
same master SHA. Alias: https://bokforingsappen.vercel.app . Four read-only
browser smoke checks passed: /, /login, /register and /api/health. Authenticated
smoke was intentionally skipped: no explicitly approved isolated account.
Public CSP/nosniff/frame/referrer/HSTS asserted; health proxy no-store observed.
First health request took about 52 seconds; subsequent request 284 ms. Cold-start
latency remains an operational concern, not an application readiness guarantee.

## Every P0 item

| Item  | Status                                    | Evidence                                                                                                  | Remaining risk / release blocker                                                                                                                                        |
| ----- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-01 | COMPLETE within implemented boundary      | Actual PC8 transport, injection/disposition/nosniff tests retained                                        | Not general document malware safety or SIE certification                                                                                                                |
| P0-02 | COMPLETE locally                          | Raw audit zero; scoped config override; real CLI loader/cycle tests, migrations/build                     | New lockfile/security gate still needs remote execution                                                                                                                 |
| P0-03 | PARTIAL                                   | Bounded production cookies; secret before revocation; 9 auth PG cases; Origin/headers/readiness/redaction | Rotate exposed values; deployed auth/log review; shared limiter/proxy policy; upload safety                                                                             |
| P0-04 | COMPLETE within reviewed workflow         | Visible-value save/post, version conflicts, 13 browser tests                                              | No guarantee for unimplemented workflows                                                                                                                                |
| P0-05 | COMPLETE within reviewed views            | Browser org switches/pending response reset, tenant API tests                                             | New P1 views must maintain same tenant contract                                                                                                                         |
| P0-06 | COMPLETE within Golden contract           | IB/trial/GL/income/BS literal fixtures and clean-org SIE equivalence                                      | Dimension-unallocated IB intentionally fails closed; qualified review remains                                                                                           |
| P0-07 | PARTIAL                                   | VAT snapshots frozen; account metadata audit retained                                                     | General account number/type/normal-balance/name history not frozen/versioned; historical reports can change with account edits. Must fix before real accounting release |
| P0-08 | COMPLETE within explicit BASE/TAX model   | Manual VAT fixtures, snapshots and browser flow                                                           | Supported Swedish mapping only; external VAT review, not declaration compliance                                                                                         |
| P0-09 | COMPLETE within documented limited subset | Preview fingerprint/explicit confirm; IB/objects/date/counter conflicts and atomic PG tests               | Unsupported variants rejected/warned; external import review needed                                                                                                     |
| P0-10 | PARTIAL; independent subset gate PASS     | 4 independent byte tests + Golden export/import/report PG case                                            | Separate reader is deliberately limited, no official validator/certification or external product interoperability proof                                                 |
| P0-11 | PARTIAL                                   | 12 concurrent PG cases and 3 real-S3 upload races                                                         | Fiscal close combinations, simultaneous cross-org numbering and forced transient retry fixtures still missing                                                           |
| P0-12 | PARTIAL / remote BLOCKED                  | Existing remote verify SUCCESS; local lint/typecheck/tests/build/E2E                                      | Remote browser cancelled; new recovery job and hotfix require clean GitHub run                                                                                          |
| P0-13 | PARTIAL; local recovery PASS              | Full fresh DB/blob, complete rows, signed restored bytes, 4 negative buckets, actual runtime LOGIN        | Real cloud grants/encryption/backup/retention/alerts/RPO-RTO not established; complete restricted-role SIE/upload and new-target balance-bypass proof remain            |

## Dependency remediation

Before FAS 24: one HIGH GHSA-ggr8-5vv4-36mx, deepmerge-ts 7.1.5, no other
production advisories. Transitive path: API → workspace DB → Prisma client /
Prisma 6.17.1 → @prisma/config → deepmerge-ts. Prisma config merges trusted
static CLI configuration, not HTTP objects. This is an exposure assessment,
not an exploitability exemption. Circular graph recursion was patched in 8.0.0:
[advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx),
[maintainer release](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0).

Override is scoped `@prisma/config@6.17.1>deepmerge-ts: 8.0.0`, not a blanket
framework/Prisma upgrade. Prisma uses exported deepmerge with ordinary config
objects; v8's Map/deepmergeInto changes are not used there. Two tests verify
actual TS configuration loading and circular/deep ordinary-object merging.
Generator, all migrations, typecheck and production build pass. The exact HIGH
exception is removed, not extended. Raw audit and custom gate now show zero
info/low/moderate/high/critical. Future unknown/unavailable audit still fails.

## Authentication and request contract

Host-only `__Host-` cookies in production: HttpOnly, Secure, SameSite=Lax,
path /, no Domain; max access 900 s, rolling refresh 7 days, absolute 30 days.
Random refresh secret must match before any session/family revocation. Wrong
secret/known UUID cannot log out another session. Correct old rotated-token
reuse revokes its family, not separate logins. Concurrent refresh has one winner;
replay detection revokes that family. Logout after rotation invalidates access
and refresh. Browser uses first-party Next /api; cookie-authenticated writes
require exact configured Origin and reject foreign/null/cross-site metadata.
Cookie-less nonbrowser callers can omit Origin but cannot omit authorization.
No generic CSRF middleware or weaker CORS added. Every Nest response no-store.

Rate limits remain process-local. Multiple replicas require a reviewed shared
store or edge limiter; proxy trust must be narrowly configured for real client
IPs. Tests do not prove actual production secret rotation or deployed login.

## Independent SIE boundary

`tests/sie-independent.cjs` imports no production parser, encoder or money helper.
Own token/record/date validation and BigInt cents; #FORMAT/#SIETYP/#RAR,
account/type, IB/UB/RES, dimension/object, voucher/line signs and dates.
Original manual CC0 spec-derived fixture is not generated by LedgerApp; provenance
and ASCII literal PC8 byte representation documented alongside it. Independent
reader intentionally accepts only ASCII and the six tested Swedish CP437 letters;
it is not a full alternative SIE product. Actual export asserts literal bytes
8F 8E 99 / 86 84 94 and absence of their UTF8 sequences. Incorrect balance and
UTF8 declared-PC8 fixtures fail. Golden export passes the reader, imports into
empty accounting state, then matches IB, trial/GL/income/BS financial fields.
Physical IDs/provenance are intentionally not accounting equivalence criteria.

## Restore, storage and least privilege

Official maintained RustFS 1.0.1 (Apache-2.0) is pinned by digest; see
[official Docker instructions](https://docs.rustfs.com/en/installation/container/docker/).
Disposable HTTP storage is not production TLS evidence. Private bucket denies
anonymous GET and altered/expired signatures; valid signed bytes preserve hash.

Final complete fixture has user/member/org, accounts/IB/calendar lock, posted
original + opposite correction, VAT snapshots, project/cost-center, SIE export
job/audit and PNG attachment. pg_dump/pg_restore uses completely fresh target;
full rows (18 models), not merely counts, are compared. Blob restored to fresh
bucket; signed download identical bytes/size/SHA. Correct reconciliation has
zero missing/mismatched/unknown/orphans. Separate negative buckets prove missing,
orphan, same-size checksum corruption and size mismatch; no orphan is deleted.

Actual disposable runtime LOGIN is nonsuperuser, member only of runtime group,
not migrator. Eight direct DDL/audit/migration operations denied; posted mutation
and tenant FK denied. Actual HTTP auth/register/refresh/logout, org/account/FY,
draft save/post/reversal/report and locked-post failure work through that login.
No actual cloud role provisioning is claimed. Full runtime SIE/upload coverage
and a new-target independent unbalanced direct-post attempt remain explicit gaps.

Real PUT/PG upload races against posting, period lock and draft calendar move
all return 409 after state wins, leave zero attachment/audit rows and clean the
new generated object. Barrier delays real PUT completion; no in-memory storage
or fake DB race. Foreign user/new signing denied; logged-out signing denied.
Already-issued signed URL remains a bearer capability until expiry, even after
logout; immediate revocation is not claimed.

## Exact verification counts (overlaps identified)

| Category                             | Final executed count                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Ordinary unit/contract via pnpm test | 166: API 91, web 51, DB 11, SIE 13                                                                  |
| PostgreSQL integration               | 94 across 11 suites                                                                                 |
| Local Chromium E2E                   | 13 passed                                                                                           |
| Public production read-only smoke    | 4 passed, 1 authenticated check deliberately skipped                                                |
| Security-contract selected rerun     | 17 passed, subset of API's 91 (not additive)                                                        |
| Independent SIE                      | 4 subset of SIE's 13; 1 Golden case subset of PG's 94                                               |
| Concurrency                          | 12 subset of PG's 94; plus 3 real storage scenarios in standalone drill                             |
| Reconciliation unit                  | 1 separately executed Node contract                                                                 |
| Real complete restore                | 1 final complete DB/blob scenario + 4 negative bucket fixtures; earlier reduced restore also passed |
| Actual runtime LOGIN                 | 1 scenario; 8 explicit DDL/audit/migration denials, normal flows and guards                         |
| Older schema upgrade                 | 1 scenario, 11 older + 3 recent migrations, 3 preserved models                                      |
| Dependency compatibility             | 2 separate Node tests                                                                               |
| E2E safety guards                    | 7 separate Node tests                                                                               |

Frozen install, Prisma generate, all fresh migrations, lint, typecheck,
pnpm test, test:integration, test:e2e, raw audit/custom gate and
`API_INTERNAL_URL=https://ledgerapp-api.example.invalid pnpm build` actually ran
with pnpm 9.15.4. Initial integration invocation lacked TEST_DATABASE_URL and
ran zero tests; corrected isolated invocation passed. This setup failure is
not counted as test evidence. Upgrade retains simple identity data, not a
full historical accounting corpus. No db push or historical migration edits.

## External release requirements and next step

Close P0-07 historical account metadata, remaining P0-11 races/retries,
P0-12 complete remote jobs, P0-03 operator controls, and P0-13 actual cloud
recovery/least privilege/backup controls before real accounting release.
Obtain qualified review of Swedish VAT mappings, corrections, calendar closing,
accounting retention/legal holds, GDPR interaction and supported SIE semantics.
No Bokföringslagen/VAT/SIE/production compliance or certification is claimed.

Recommended next step: review/commit/push these scoped FAS 24 changes and obtain
complete GitHub evidence, then schedule the explicit residual P0 closure work
alongside isolated P1 planning. This phase stops here, without P1 implementation.

The three newly created FAS 24 disposable containers were stopped after testing,
not removed. Databases, buckets and backup artifacts remain available for
inspection after restarting those containers. Existing user services were left
running and untouched.
