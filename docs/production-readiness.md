# FAS 23 — production-readiness evidence, 2026-10-07

This checklist distinguishes implemented controls from operator verification.
Passing tests is not Swedish accounting/tax/legal approval. P1 product work
must not be treated as a production release while the open P0 gates remain.

## Locally demonstrated

- [x] Fourteen forward migrations reproduce schema and accounting guards from empty PostgreSQL.
- [x] Optimistic version checks, tenant isolation and real concurrent posting tests.
- [x] Strict browser Origin / Fetch Metadata checks for mutations. Production
      cookie-authenticated writes require an exact configured HTTPS origin.
- [x] First-party web `/api` proxy: browser cookies stay HttpOnly on the web
      origin; no tokens in localStorage. Do not bypass the proxy with cross-site
      browser calls to Render. Cookie-less server clients may omit Origin; they
      still require authorization. CORS alone is not CSRF protection.
- [x] Production rejects known local/default secret placeholders; independent
      JWT secrets and HTTPS storage/origins are required. Existing Argon2id policy,
      short access tokens and persisted rotating refresh sessions retained.
- [x] Helmet API headers and web CSP/nosniff/frame/referrer headers. CSP allows
      inline Next scripts/styles; this is not a nonce-based strict CSP.
- [x] Validated/generated request IDs, structured HTTP metadata logs; no bodies,
      cookies, query strings, tokens or signed URLs in these logs. Unexpected
      production request errors return generic 500 and log only status/request ID.
- [x] `/health` is liveness; `/ready` checks DB and storage with bounded timeouts
      and generic public failure responses.
- [x] Private-storage architecture: generated keys, SHA-256, tenant permission
      before signing, bounded uploads and signed downloads. Production does not
      auto-create buckets. Configure bucket/policy separately.
- [x] Runtime/migration role template in `ops/database-runtime-role.sql`;
      restored disposable DB runtime role cannot DROP/ALTER/disable triggers,
      TRUNCATE or rewrite audit history. Runtime is not the migration owner.
- [x] Actual disposable **database-only** dump/restore, 13 model counts matched,
      POSTED/locks present, audit and POSTED mutation denied, foreign tenant FK denied.
      Follow-up actual restored-DB checks deny locked-period insert and unbalanced posting.
- [x] Report-only storage reconciliation detects missing/orphan/mismatched or
      unreadable objects. Unit fixtures verify it never issues delete commands.

## Open release gates

- [ ] Remove/resolve HIGH `deepmerge-ts` advisory in Prisma tooling. Exact
      temporary exception expires 2026-11-07; raw audit is **not clean**.
      See [dependency evidence](security-dependencies.md). CI audit fails closed on
      unknown advisories, changed affected versions or expired exception.
- [ ] Full DB **and blob** restore drill. `scripts/restore-drill.cjs` exists but
      upload returned 503: installed AIStor needs a valid license. Official Community
      pulls failed (401/denied) and official binary download returned 410. No license
      bypass, untrusted mirror or change to user development storage was attempted.
      Database-only success does not prove attachment recovery.
- [ ] Actual cloud least-privilege roles, migration ownership and grants after
      each migration. Current scripts do not provision credentials or change cloud.
- [ ] Real production bucket anonymous-read denial, short signed URL expiry,
      TLS and provider server-side encryption/KMS permissions demonstrated.
- [ ] Production deployment HTTPS/HSTS/CSP/CORS headers inspected on both hosts.
- [ ] Rotate secrets previously disclosed in screenshots; never reuse them.
- [ ] Configure multi-replica shared rate-limit store or edge limits. Current
      Nest throttling is process-local: login/register/refresh, imports and uploads
      have targeted limits; do not claim cluster-wide protection. Proxy trust must
      be explicitly constrained before forwarded client IPs are accepted.
- [ ] Qualified review of password/TTL configuration, authorization, SIE subset
      and Swedish VAT mappings; independent SIE reader validation.
- [ ] Malformed/polyglot PDF/image parser validation and malware quarantine.
      Conservative PDF header/object/EOF checks reject truncated files, appended
      payloads and obvious JavaScript/Launch/EmbeddedFile/RichMedia/OpenAction markers.
      These checks deliberately do not claim to parse compressed/obfuscated PDF features.
      Current MIME/extension/magic/size checks are **not** malware scanning and do
      not prove arbitrary active PDF/polyglot files are safe. Never render uploads
      as executable HTML; download via signed URLs with safe content disposition.
- [ ] Production backup schedule, alerts, capacity tests and measured restore
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
