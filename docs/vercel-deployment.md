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
build. Run `prisma migrate deploy` in the Render **Build Command**, where Prisma
is available, rather than in the Start Command. The Start Command should only
run `API_PORT=$PORT node apps/api/dist/main.js`.

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
