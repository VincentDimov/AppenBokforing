# Vercel deployment

LedgerApp deploys the Next.js application to Vercel and keeps the NestJS API as
a separately deployed, long-running Node service. NestJS is not run as a
background process in a Vercel web deployment.

## Vercel project

The committed root `vercel.json` supports a project whose **Root Directory** is
the repository root (the configuration reflected by existing deployments). It
installs workspace dependencies, builds only `@ledgerapp/web`, and declares
`apps/web/.next` as the deploy output; it deliberately does not run the NestJS
API build in Vercel's web deployment.

In Vercel Project Settings, remove any manually configured Output Directory
such as `public`. The committed `vercel.json` is the source of truth. If the
project is later moved to `apps/web` as Root Directory, remove the root config
and use the existing `apps/web/vercel.json` instead.

Set this production environment variable in Vercel:

| Name               | Value                                                                            |
| ------------------ | -------------------------------------------------------------------------------- |
| `API_INTERNAL_URL` | Public HTTPS origin of the separately hosted Nest API, without a trailing slash. |

The Next rewrite proxies `/api/*` to this origin. Browser requests remain
same-origin to the Vercel site, allowing the API's httpOnly authentication
cookies to be returned through the proxy.

## API service

Deploy `apps/api` to a Node-capable host (for example a container service),
with the repository root as build context. Its build command is:

```sh
corepack pnpm@9.15.4 --filter @ledgerapp/api build
```

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
