# Vercel deployment

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
