# Production-readiness — FAS 30–34 / historiska releasebevis

Se [aktuell lokal releasegate](fas30-34-release-gate.md). Bascommit `441567e`
är FAS 29; FAS 30–34 är ocommittade och ingen ny deployment/remote CI har körts.
Äldre tabeller nedan är uttryckligen historik, inte aktuella master-/cloudbevis.

Nya återställningskritiska fält: mallarnas standardtext/seriepreferens, kontosnapshots
och SIE-jobbens filnamn/SHA-256/summering/proveniens. Full DB/blob-drill jämför
22 modeller och verifierar privat återställd fil samt verklig begränsad runtime LOGIN.
Beräknad dashboard/arkiv behöver ingen materialiserad backup. Behåll befintliga
grants; DELETE behövs enbart för utkastmallrader/IB-ersättning, inte bokförd historik.
Migrationens pg_trgm måste finnas/kunna provisioneras av migrator, inte runtime.

Next.js patchas till 15.5.27 efter två nya advisories; inga undantag eller sänkta
säkerhetsgates. Lokal audit är noll, inte bevis att en gammal deployment är patchad.
[Officiell patchrelease](https://github.com/vercel/next.js/releases/tag/v15.5.27).
Webbens testbuild/server får inte ärva S3-/JWT-/DB-hemligheter från API-fixturen.

P0-03/07/10/11/12/13 kvarstår enligt slutrapporten. Ingen production/legal approval.

## Historik: FAS 25–29 / verifierad FAS 24-baseline

See [FAS 25–29 local gates and remaining blockers](fas25-29-release-gate.md).

New local product work does not constitute a production release. Real invitation
mail is fail-closed; verified-email, delivery outbox/retries and operator policy
are still required. Account/company presentation history, complete SIE coverage,
shared rate limits, malware boundaries, cloud encryption/backup/restore and
qualified Swedish accounting review retain their release blockers.
Runtime grants include only INSERT and consumption/status columns for invitations
and carry records; IB DELETE is narrowly needed for atomic replacement and still
guarded by calendar/posted immutability. Reapply reviewed grants after migration.
FAS 25–29 adds recovery-critical settings, member/invite states, managed series,
carry result and dimension snapshots to the real DB/blob restore fixture.

**GO FOR P1 WITH EXPLICIT P0 BLOCKERS. Not a production/legal release.**
See [all P0 dispositions and evidence](fas24-release-gate.md).
The table below records the corrected FAS 24 baseline; newer local verification
is recorded separately in the FAS 25–29 release report. FAS 23 findings are archived.

| Criterion                                                | Status         | Evidence / remaining gate                                                                                                                                                         |
| -------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current master identity                                  | PASS           | 96f131e8def14831b2f4000666d35584087fe242; FAS 25–29 changes are separately local.                                                                                                 |
| Whole remote FAS 24 CI                                   | PASS           | [Run 37679581119](https://github.com/VincentDimov/AppenBokforing/actions/runs/37679581119): verify, browser-e2e, recovery-runtime-gate all SUCCESS; Vercel READY for same commit. |
| Frozen install / generate / fresh migrations             | PASS           | pnpm 9.15.4; Prisma 6.17.1; all 14 migrations, fresh disposable PG.                                                                                                               |
| Older schema upgrade                                     | PASS           | First 11 migrations then latest 3; full user/org/member rows preserved. More accounting upgrade datasets remain desirable.                                                        |
| Local lint / typecheck / unit / PG / E2E / build         | PASS           | Exact counts and build origin recorded in release gate.                                                                                                                           |
| Raw production audit and scoped dependency compatibility | PASS           | Zero advisories; deepmerge 8 actual config/cyclic regression tests; removed exact exception.                                                                                      |
| Cookie lifetimes and refresh/logout rotation             | PASS           | HttpOnly, host-only, Secure production, Lax, path /; maximum 15m/7d/30d; four new real-PG tests.                                                                                  |
| Browser Origin / CSRF / first-party proxy                | PASS           | Exact origin and Fetch Metadata for mutations; cookie-less server callers still require authorization. CORS unchanged.                                                            |
| Production placeholders / HTTPS guards                   | PASS           | Existing config tests/code reject known dummy/local settings, HTTP S3 and absent HTTPS origins; Argon2 production minimum retained.                                               |
| Actual deployed authenticated security                   | BLOCKED        | No explicitly authorized isolated account; no production mutation/login performed.                                                                                                |
| Exposed production secret rotation                       | BLOCKED        | Earlier screenshot secrets must be rotated by operator; not independently confirmed.                                                                                              |
| Public deployed headers / health                         | PASS           | Four read-only smoke checks; public CSP/nosniff/DENY/referrer/HSTS assertions; health no-store.                                                                                   |
| API and sensitive cache headers                          | PASS           | Helmet and SIE contracts retained; all Nest responses now no-store. Deployed authenticated export unverified.                                                                     |
| Targeted single-instance limiter                         | PASS           | Existing auth/import/upload limits retained.                                                                                                                                      |
| Multi-instance limiter / proxy trust                     | BLOCKED        | Process-local limiter; shared/edge limits and constrained forwarded-IP policy required before scaled production.                                                                  |
| Independent SIE and Golden equivalence                   | PASS           | Independent reader, original CC0 manual PC8 fixture, raw bytes, IB and four reports equal after clean-org import. Limited subset, not certification.                              |
| Complete concurrency threat matrix                       | PARTIAL        | 12 PG cases plus 3 real S3 barrier scenarios; closure/cross-tenant numbering/forced retry evidence still incomplete.                                                              |
| Real private disposable storage                          | PASS           | Official RustFS 1.0.1 pinned digest; anonymous/signature/expiry/bytes/checksum and race cleanup.                                                                                  |
| Signed URL after logout/tenant change                    | PASS           | New signing denied; already-issued bounded bearer URLs remain usable until expiry (not instantly revoked).                                                                        |
| Actual production bucket/TLS/SSE/KMS                     | BLOCKED        | Local HTTP disposable-only; real cloud permissions/encryption unverified.                                                                                                         |
| Complete DB/blob restoration                             | PASS           | Fresh ledgerapp_restore_24b and new bucket; complete rows include inverse/VAT snapshots/dimensions/SIE/audits; signed restored bytes/size/SHA match.                              |
| Correct and negative reconciliation                      | PASS           | Correct snapshot zero discrepancies; 4 separate real buckets detect missing/orphan/checksum/size. Report-only, no orphan deletion.                                                |
| Restored runtime LOGIN / DDL and history denials         | PASS           | Actual nonsuperuser LOGIN; 8 denials plus posted mutation and tenant FK. Normal auth/account/calendar/save/post/reverse/report/logout and locked post verified.                   |
| All runtime operations / actual cloud grants             | PARTIAL        | Full restricted-role SIE and upload flows, actual production migrator ownership/grants not yet demonstrated.                                                                      |
| Independent restored unbalanced-post bypass              | PARTIAL        | New target verifies POSTED immutability and locked posting; dedicated unbalanced-post fixture from historical drill not rerun there.                                              |
| Liveness/readiness/failure/timeout                       | PASS           | Four readiness unit cases; bounded DB/S3 dependency checks with generic failure.                                                                                                  |
| Logs and operational monitoring                          | PARTIAL        | Request-ID/status/path only; database/token error redaction test. Actual deployed failed-request/log review and alerts remain.                                                    |
| Upload malware/polyglot safety                           | BLOCKED        | Conservative validation is not full parsing/scanning/quarantine.                                                                                                                  |
| Scheduled encrypted backups / RPO-RTO / monitoring       | BLOCKED        | Local retained plaintext fixtures are not production backup evidence. See contract below.                                                                                         |
| Qualified Swedish accounting/VAT/legal review            | BLOCKED        | No statutory compliance claim from technical tests.                                                                                                                               |
| Certification / P1 implementation in this phase          | NOT APPLICABLE | No SIE/production certification; no P1 features implemented.                                                                                                                      |

## FAS 24 disposable operation

Source/target containers: ledgerapp-fas24-pg-20261007 on loopback 15440,
ledgerapp-fas24-restore-20261007 on 15441; storage on 19500. User services
on 5433/9000 unchanged. Scripts require RUN_DISPOSABLE_RESTORE_DRILL=yes.
Restore source/target names accept only ledgerapp_drill[_suffix] and
ledgerapp_restore[_suffix]; target must be empty, source organizations empty.
No database reset, old migration edits or reconciliation orphan deletion.

Final full dataset: ledgerapp_drill_24b → ledgerapp_restore_24b.
Buckets: ledgerapp-drill-source-ab82b77e / ledgerapp-drill-restored-ab82b77e.
Retained disposable backup directory: local Temp/ledgerapp-restore-drill-hkl2ch.
Contains session/disposable credential metadata: keep restricted.
Containers, backups and fixture buckets are retained for inspection.

Run restore-drill.cjs, verify-runtime-login.cjs (same restored target),
verify-storage-races.cjs (new isolated organization/bucket) and
verify-restored-guards.cjs and verify-migration-upgrade.cjs (fresh fixed
ledgerapp_upgrade_2529; 14→19 migrations with 13 prior-schema accounting models).
Historical DB-only scripts below still target earlier ports, not this full drill.

## Historical FAS 23 evidence (superseded; not the current checklist)

This checklist distinguishes implemented controls from operator verification.
Passing tests is not Swedish accounting/tax/legal approval. P1 product work
must not be treated as a production release while the open P0 gates remain.

## Locally demonstrated

- PASS (historical): Fourteen forward migrations reproduce schema and accounting guards from empty PostgreSQL.
- PASS (historical): Optimistic version checks, tenant isolation and real concurrent posting tests.
- PASS (historical): Strict browser Origin / Fetch Metadata checks for mutations. Production
  cookie-authenticated writes require an exact configured HTTPS origin.
- PASS (historical): First-party web `/api` proxy: browser cookies stay HttpOnly on the web
  origin; no tokens in localStorage. Do not bypass the proxy with cross-site
  browser calls to Render. Cookie-less server clients may omit Origin; they
  still require authorization. CORS alone is not CSRF protection.
- PASS (historical): Production rejects known local/default secret placeholders; independent
  JWT secrets and HTTPS storage/origins are required. Existing Argon2id policy,
  short access tokens and persisted rotating refresh sessions retained.
- PASS (historical): Helmet API headers and web CSP/nosniff/frame/referrer headers. CSP allows
  inline Next scripts/styles; this is not a nonce-based strict CSP.
- PASS (historical): Validated/generated request IDs, structured HTTP metadata logs; no bodies,
  cookies, query strings, tokens or signed URLs in these logs. Unexpected
  production request errors return generic 500 and log only status/request ID.
- PASS (historical): `/health` is liveness; `/ready` checks DB and storage with bounded timeouts
  and generic public failure responses.
- PASS (historical): Private-storage architecture: generated keys, SHA-256, tenant permission
  before signing, bounded uploads and signed downloads. Production does not
  auto-create buckets. Configure bucket/policy separately.
- PASS (historical): Runtime/migration role template in `ops/database-runtime-role.sql`;
  restored disposable DB runtime role cannot DROP/ALTER/disable triggers,
  TRUNCATE or rewrite audit history. Runtime is not the migration owner.
- PASS (historical): Actual disposable **database-only** dump/restore, 13 model counts matched,
  POSTED/locks present, audit and POSTED mutation denied, foreign tenant FK denied.
  Follow-up actual restored-DB checks deny locked-period insert and unbalanced posting.
- PASS (historical): Report-only storage reconciliation detects missing/orphan/mismatched or
  unreadable objects. Unit fixtures verify it never issues delete commands.

## Open release gates

- PARTIAL (historical): Remove/resolve HIGH `deepmerge-ts` advisory in Prisma tooling. Exact
  temporary exception expires 2026-11-07; raw audit is **not clean**.
  See [dependency evidence](security-dependencies.md). CI audit fails closed on
  unknown advisories, changed affected versions or expired exception.
- PARTIAL (historical): Full DB **and blob** restore drill. `scripts/restore-drill.cjs` exists but
  upload returned 503: installed AIStor needs a valid license. Official Community
  pulls failed (401/denied) and official binary download returned 410. No license
  bypass, untrusted mirror or change to user development storage was attempted.
  Database-only success does not prove attachment recovery.
- PARTIAL (historical): Actual cloud least-privilege roles, migration ownership and grants after
  each migration. Current scripts do not provision credentials or change cloud.
- PARTIAL (historical): Real production bucket anonymous-read denial, short signed URL expiry,
  TLS and provider server-side encryption/KMS permissions demonstrated.
- PARTIAL (historical): Production deployment HTTPS/HSTS/CSP/CORS headers inspected on both hosts.
- PARTIAL (historical): Rotate secrets previously disclosed in screenshots; never reuse them.
- PARTIAL (historical): Configure multi-replica shared rate-limit store or edge limits. Current
  Nest throttling is process-local: login/register/refresh, imports and uploads
  have targeted limits; do not claim cluster-wide protection. Proxy trust must
  be explicitly constrained before forwarded client IPs are accepted.
- PARTIAL (historical): Qualified review of password/TTL configuration, authorization, SIE subset
  and Swedish VAT mappings; independent SIE reader validation.
- PARTIAL (historical): Malformed/polyglot PDF/image parser validation and malware quarantine.
  Conservative PDF header/object/EOF checks reject truncated files, appended
  payloads and obvious JavaScript/Launch/EmbeddedFile/RichMedia/OpenAction markers.
  These checks deliberately do not claim to parse compressed/obfuscated PDF features.
  Current MIME/extension/magic/size checks are **not** malware scanning and do
  not prove arbitrary active PDF/polyglot files are safe. Never render uploads
  as executable HTML; download via signed URLs with safe content disposition.
- PARTIAL (historical): Production backup schedule, alerts, capacity tests and measured restore
  meeting agreed business RPO/RTO, across DB and objects.

## Backup and retention contract

Choose approved RPO/RTO per organization/business risk; fixture restore time is
not a production SLA. Schedule encrypted PostgreSQL full backups plus WAL/PITR,
and versioned object snapshots/replication in a separate account/failure domain.
Backup keys must not be the runtime role's keys. Monitor age, completeness,
restore failures, dependency readiness and capacity; alert a named operator.

Take DB snapshot and an object manifest containing storage key, object version,
SHA-256 and size. Because upload precedes DB metadata commit, preserve both
pre-existing objects and post-snapshot orphans until reconciliation is reviewed.
Retain all object versions needed by DB recovery windows. Restore DB to a fresh
instance and objects to a fresh private bucket, then run reconciliation before
allowing posting. Reconciliation never deletes discrepancies automatically.
Named Docker volumes are persistence, not backup.

Accounting/audit/attachments need coordinated legal retention and legal holds;
do not apply session/temporary-file cleanup policies to them. No casual delete
API is added. GDPR erasure/anonymization must preserve legally required records
under a reviewed accounting/legal design. This document sets no legal retention
duration and makes no regulatory compliance claim.

## Executable local drills

`RUN_DISPOSABLE_RESTORE_DRILL=yes node scripts/restore-drill.cjs` requires the
explicit loopback fixture DBs/containers documented in the script, an empty
source year/database and working S3 on port 19500. It creates new private
fixture buckets and retained backup artifacts; it never resets an existing DB.
`RESTORE_DRILL_SOURCE_DB=ledgerapp_drill_2` selects a fresh allowed fixture DB.

`RUN_DISPOSABLE_RESTORE_DRILL=yes node scripts/restore-database-drill.cjs`
restores the isolated integration DB to empty `ledgerapp_restore`. It proves
only database recovery, not object recovery. Keep writes quiescent during
count comparisons. Targets are fixed local ports 15438/15439; no production URL
is accepted. Re-running requires a new empty disposable target, not dropping data.

`RUN_DISPOSABLE_RESTORE_DRILL=yes node scripts/verify-restored-guards.cjs`
checks the actual restored DB for locked-period insertion and unbalanced-posting
rejection. Both PASS on the restored fixture. Successful DB restore took 2.115 s
for this small synthetic fixture, not a production RTO estimate.

Final local checks: lint (6 tasks), typecheck (9), build (4, 28 web pages),
156 ordinary tests (API 85/web 51/DB 11/SIE 9), 86 PostgreSQL integration tests,
13 Chromium browser tests, one report-only reconciliation contract. Scoped
dependency gate passes with the one documented HIGH exception; raw audit is not
zero. Cloud deployment and remote GitHub CI have not been executed by this work.

`node scripts/reconcile-storage.cjs` uses operator-provided DB/S3 environment.
It reads every object to verify bytes; run under read-only credentials with an
appropriate maintenance window. This initial tool is not a huge-bucket streaming
optimizer. Reports include IDs/keys, so store them as restricted operational data.
