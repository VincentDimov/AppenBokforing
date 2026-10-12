# Automatic Neon migrations on master push

Push to `master` in `VincentDimov/AppenBokforing` automatically runs the
`Migrate Neon production` job after **all three existing CI jobs succeed**.
Pull requests, forks and other branches never run this production job.

The existing Neon GitHub integration supplies `secrets.NEON_API_KEY` and
`vars.NEON_PROJECT_ID` (`plain-boat-63257376`). No new database password needs
to be copied into GitHub, Render or local `.env` files.

The job retrieves an owner connection in memory via the Neon API, explicitly
selecting branch `br-solitary-scene-baw6obms`, endpoint `ep-square-bird-bahcwu9y`,
database `neondb`, and role `neondb_owner`. It checks the exact direct hostname
and TLS mode before invoking the repository's **pinned Prisma 6.17.1** CLI:

```sh
prisma migrate deploy --schema prisma/schema.prisma
```

Only committed, pending migrations in `packages/db/prisma/migrations` are
applied. A push without new migrations is a successful no-op. This does not
automatically generate migrations from `schema.prisma`, import BAS datasets,
seed accounts, reset databases or replace user/accounting data. Schema changes
must include a reviewed forward migration created during development.

Production jobs share a non-cancelling concurrency group. Superseded master
commits are skipped before retrieving a Neon connection. API/connection/migration
failures fail the job; there is no automatic reset, resolve, rollback or bypass.
The normal Render API retains its pooled, restricted `ledgerapp_api` connection.
New objects that require runtime privileges need explicit reviewed grants in
their migration; do not grant runtime schema ownership or audit UPDATE/DELETE.

The management key is only present in the migration step, never dependency
installation, PR tests or the Prisma child process. URLs/passwords are not
written to files, arguments, workflow outputs or artifacts. Prisma failures
expose only error codes, not raw connection diagnostics. Keep the Neon API key
scoped to this project and restrict who can change/push production workflow code.

Render and Vercel currently deploy independently on commit. This job does **not**
make their release lifecycle atomic or delay those deployments until migration
completion. Use backwards-compatible expand/contract migrations; schema-breaking
releases need separate deployment coordination and backup/recovery review.

Verify in GitHub Actions: `Continuous integration` → `Migrate Neon production`.
Failure requires investigation and a reviewed forward fix, not a database reset.
Local safety tests:

```sh
node --test tests/neon-production-migrate.test.cjs
```

References: [Neon connection URI API](https://api-docs.neon.tech/reference/getconnectionuri),
[Neon direct/pooler connections](https://neon.com/docs/connect/connection-pooling).
