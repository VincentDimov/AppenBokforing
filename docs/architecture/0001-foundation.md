# ADR 0001: Initial platform foundation

**Status:** Accepted  
**Date:** 2026-09-14

## Decision

LedgerApp starts as a pnpm workspace managed by Turborepo. The first delivery
contains separate `web`, `api`, `db`, `shared`, `ui`, and `config` workspaces.
The browser application and REST API remain independently deployable, while
database access is isolated in `@ledgerapp/db`.

The pinned pnpm binary is also a root development dependency. This lets
Turborepo resolve the workspace package manager on Windows when Corepack is
used without administrative rights to create global shims.

PostgreSQL is the system of record and the official MinIO-compatible AIStor
image provides the local S3-compatible development service. Both run through
Docker Compose and persist their data in named Docker volumes.

The Prisma schema intentionally contains only a neutral bootstrap marker in
this phase. The marker verifies the PostgreSQL and migration path without
prematurely committing accounting-domain assumptions. Users, organizations,
vouchers, and all accounting rules will be designed in a dedicated domain
schema phase.

## Consequences

- Applications may not access the database through ad hoc clients; future
  server-side database access goes through `@ledgerapp/db`.
- Runtime secrets stay in `.env` files and are never committed. `.env.example`
  documents the local values required to start the system.
- `pnpm lint`, `pnpm typecheck`, and `pnpm test` are repository-level quality
  gates. Turbo coordinates the corresponding workspace commands.
- The API exposes only operational endpoints at this stage. There is no
  authentication, tenant data, or accounting functionality yet.
