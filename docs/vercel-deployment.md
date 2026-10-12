# Vercel deployment

## Environment separation and FAS 18 verification

| Environment       | Frontend `API_INTERNAL_URL`                                         | Backend data                                                   |
| ----------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| Production        | Public HTTPS origin of the production NestJS service                | Production DB/storage only on the API host                     |
| Preview           | Separate preview API origin, scoped to Preview/branch               | Isolated preview/test DB/storage; never production bookkeeping |
| Local development | Local API origin, normally `http://localhost:4000`                  | Local development services                                     |
| Local browser E2E | `http://127.0.0.1:4410` by default, set at build time by the runner | Disposable `ledgerapp_e2e` only                                |

Set Production and Preview values separately in Vercel. After changing a value,
rebuild/redeploy the relevant environment: rewrites are part of the Next build
and Turbo includes this variable in the web build cache key. Changing only
runtime configuration of an existing build is insufficient.

Browser fetches stay same-origin `/api/*`. Do not add `NEXT_PUBLIC_DATABASE_URL`,
`NEXT_PUBLIC_JWT_*`, public S3 credentials, or a public-secret workaround.
DB/JWT/storage secrets belong only to NestJS. Never copy a production backend
environment into preview or the disposable E2E runner.

Read-only production smoke was run 2026-10-06: **4 passed, 1 auth check skipped**.
`/`, `/login`, `/register` returned 200 in Chromium without pageerror.
`/api/health` returned the real Nest health JSON with nosniff, CSP,
SAMEORIGIN, no-referrer and no-store. Public HTML lacked CSP/nosniff/frame/
referrer headers; this remains a hardening gap. Secure authentication cookies
were not inspected in production without an explicitly authorized isolated
test account. No production registration or accounting mutation was performed.

Commands, optional credential gating, local isolation and CI limits:
[E2E verification](e2e-verification.md). Smoke success proves neither full
accounting correctness nor regulatory compliance. No deployment was performed
as part of these checks.

LedgerApp deploys the Next.js application to Vercel and keeps the NestJS API as
a separately deployed, long-running Node service. NestJS is not run as a
background process in a Vercel web deployment.

## Vercel project

Set the Vercel project's **Root Directory** to `apps/web`. Next.js is declared
in `apps/web/package.json`; Vercel must use that directory to detect the
framework and its `.next` output. The committed `apps/web/vercel.json` installs
workspace dependencies from the repository root but builds only
`@ledgerapp/web`; it deliberately does not run the NestJS API build in Vercel's
web deployment.

In Vercel Project Settings, clear any manually configured Output Directory such
as `public`. Let the Next.js framework use its standard `.next` output.

Set this production environment variable in Vercel:

| Name               | Value                                                                            |
| ------------------ | -------------------------------------------------------------------------------- |
| `API_INTERNAL_URL` | Public HTTPS origin of the separately hosted Nest API, without a trailing slash. |

The Next rewrite proxies `/api/*` to this origin. Browser requests remain
same-origin to the Vercel site, allowing the API's httpOnly authentication
cookies to be returned through the proxy.

`API_INTERNAL_URL` is evaluated while Next.js builds the rewrite configuration.
Set it for the **Production** deployment environment and redeploy after changing
it. A production web build now fails explicitly when it is absent rather than
silently proxying to `localhost:4000`.

## API service

Deploy `apps/api` to a Node-capable host (for example a container service),
with the repository root as build context. Its build command is:

```sh
corepack pnpm@9.15.4 --filter @ledgerapp/api build
```

On Render, keep `NODE_ENV=production` as a runtime environment variable, but
install build tooling explicitly with `--prod=false`; Prisma and TypeScript are
development dependencies required to compile the API. The repository pins the
Node 22 LTS line in `.node-version` so hosts do not select a newer major version
from a loose engine range.

Render's runtime artifact may omit development dependencies after a successful
build. Keep both the Build Command and Start Command free of privileged database
migrations when the service uses a restricted runtime role. Run migrations
separately with an operator-controlled owner/migrator connection before release;
never give the running API the schema-owner password just to enable migrations.
Use a direct Neon endpoint for migrations and a pooled endpoint for runtime.
The Start Command should only run `API_PORT=$PORT node apps/api/dist/main.js`.

The database package now runs `prisma generate` as part of its own build. This
is required in every clean CI environment before TypeScript can import Prisma
enums and generated query types.

Set `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, S3/MinIO
settings and `CORS_ORIGIN` (the Vercel HTTPS origin) on the API host. Run Prisma
migrations as a release step before promoting the web deployment:

```sh
corepack pnpm@9.15.4 db:deploy
```

Do not put database credentials or JWT secrets in Vercel's web environment.

## Connected production targets (2026-10-12)

- Vercel `jobapplication/bokforingsappen`: Root Directory `apps/web`, framework
  `nextjs`, Node `22.x`, no Output Directory override. Production-only
  `API_INTERNAL_URL=https://appenbokforing.onrender.com`.
- Render `My Workspace/AppenBokforing`: repository-root build context;
  `corepack pnpm@9.15.4 install --frozen-lockfile --prod=false && corepack pnpm@9.15.4 -r --filter "@ledgerapp/api..." build`.
- Neon `Ledgerapp`: production branch `br-solitary-scene-baw6obms`, database
  `neondb`. All 25 committed Prisma migrations verified current through the
  direct production endpoint. Runtime connects as `ledgerapp_api`, inheriting
  the reviewed `ledgerapp_runtime` grants from `ops/database-runtime-role.sql`.
  Verified: no schema CREATE, no audit UPDATE/DELETE, no migrator membership.
  At connection verification the database contained zero users and vouchers.
- Cloudflare R2: private bucket `ledgerapp` (lowercase is required), region
  `auto`, endpoint `https://b8c61047fd035c79034decefc3646bd3.r2.cloudflarestorage.com`.
  `S3_PUBLIC_ENDPOINT` is the same authenticated S3 endpoint, not an enabled
  public bucket URL. Managed public access is disabled; no custom public domain.
  WEUR is a location hint, not an EU-jurisdiction residency guarantee.

R2 credentials must be bucket-scoped Object Read & Write credentials, stored
only as `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` in Render. Do not copy the
Cloudflare management API token into those variables. Existing backend secrets
were preserved when updating the non-secret storage settings and runtime DB URL.
Local environment files were not changed; Preview has not been wired to the
production API or database.

An isolated migration-validation branch (`br-super-thunder-ba117rqd`) was
created for this operation and deleted after explicit user approval. The
production branch was not deleted, reset, or replaced.

Production smoke on 2026-10-12: both directly on Render and through Vercel,
`/health` 200, `/ready` 200 (database and storage readiness), and `/auth/me` 401
without authentication. Both services deployed the existing master commit
`cc68bcf48c260654a0187f5a887bf585a93bea82`; the separate FAS 37.1 draft PR was
not merged or silently substituted for master.

With an explicitly approved, clearly marked verification account/organization:

- Registration 201, login/profile 200, logout 204 and logged-out profile 401.
- Host-only access/refresh cookies retained HttpOnly, Secure and SameSite=Lax;
  refresh returned a different token.
- Onboarding 201, owner membership, account register and series A verified.
- One DRAFT created; no POSTED/REVERSED entry created. Its CREATE audit record,
  organization/member/fiscal-year audit records and attachment audit record exist.
- Passive 51-byte PDF fixture uploaded to private R2; stored SHA-256 and signed
  download bytes matched the original. Unsigned S3 request was rejected with HTTP
  400 (not the verifier's initially assumed 403); the bucket has no public domain.
- Browser login showed the real dashboard with one draft and zero posted
  vouchers; the draft page displayed the PDF. Logga ut navigated to `/`, not
  `/login`.

The test organization and unposted evidence are retained as marked verification
data; accounting/audit records were not casually deleted. The temporary verifier
password was replaced with an unshared random value, all verifier sessions were
revoked, and a subsequent profile request returned 401. Temporary local operator
helpers were removed; credentials were never written into repository/env files.
These bounded tests
verify connectivity and this user story, not all accounting features, a complete
BAS catalog, regulatory compliance, or disaster recovery.
