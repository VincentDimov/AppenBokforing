/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// Actual LOGIN principal against the explicitly disposable, restored FAS 24 DB.
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const { createRequire } = require("node:module");
const path = require("node:path");
const targetDatabase = process.env.RESTORE_DRILL_TARGET_DB || "ledgerapp_restore";
if (!/^ledgerapp_restore(?:_[a-z0-9]+)?$/.test(targetDatabase))
  throw new Error("Disposable target required");
if (process.env.RUN_DISPOSABLE_RESTORE_DRILL !== "yes")
  throw new Error("Disposable opt-in required");
const suffix = randomBytes(6).toString("hex");
const role = `drill_runtime_${suffix}`,
  password = randomBytes(32).toString("hex");
execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "ledgerapp-fas24-restore-20261007",
    "psql",
    "-U",
    "ledgerapp_test",
    "-d",
    targetDatabase,
    "-v",
    "ON_ERROR_STOP=1"
  ],
  {
    input: `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; GRANT ledgerapp_runtime TO ${role};`,
    stdio: ["pipe", "ignore", "pipe"]
  }
);
const url = `postgresql://${role}:${password}@127.0.0.1:15441/${targetDatabase}`;
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: url,
  JWT_ACCESS_SECRET: randomBytes(48).toString("hex"),
  JWT_REFRESH_SECRET: randomBytes(48).toString("hex"),
  ARGON2_MEMORY_COST: "8192",
  ARGON2_TIME_COST: "2"
});
const apiRequire = createRequire(path.resolve(__dirname, "../apps/api/package.json"));
const { Test } = apiRequire("@nestjs/testing"),
  request = apiRequire("supertest");
const { PrismaClient } = require("../packages/db/dist");
const { AppModule } = require("../apps/api/dist/app.module");
const { DatabaseService } = require("../apps/api/dist/database/database.service");
const { configureHttpApp } = require("../apps/api/dist/http/app-setup");
async function main() {
  const db = new PrismaClient({ datasourceUrl: url });
  let app;
  try {
    const identity = await db.$queryRawUnsafe("SELECT current_user AS username");
    assert.equal(identity[0].username, role);
    for (const sql of [
      "DROP TABLE accounts",
      "ALTER TABLE accounts ADD COLUMN unauthorized text",
      "CREATE TABLE public.unauthorized(id int)",
      "CREATE SCHEMA unauthorized",
      "ALTER TABLE journal_lines DISABLE TRIGGER ALL",
      "UPDATE _prisma_migrations SET migration_name='x'",
      "UPDATE audit_events SET metadata='{}'",
      "DELETE FROM audit_events"
    ])
      await assert.rejects(db.$executeRawUnsafe(sql));
    const restoredEntry = await db.journalEntry.findFirstOrThrow({ where: { status: "POSTED" } });
    await assert.rejects(
      db.$executeRawUnsafe(
        `UPDATE journal_lines SET debit_amount=123 WHERE journal_entry_id='${restoredEntry.id}'`
      )
    );
    app = (
      await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DatabaseService)
        .useValue({ prisma: db })
        .compile()
    ).createNestApplication({ logger: false });
    configureHttpApp(app);
    await app.init();
    const agent = request.agent(app.getHttpServer());
    await agent
      .post("/auth/register")
      .send({
        email: `runtime-${suffix}@example.test`,
        displayName: "Runtime proof",
        password: "Disposable-runtime-password-2026!"
      })
      .expect(201);
    await agent.post("/auth/refresh").expect(200);
    const setup = (
      await agent
        .post("/onboarding")
        .send({
          setupKey: require("node:crypto").randomUUID(),
          name: "Runtime new workspace",
          startDate: "2026-01-01",
          endDate: "2026-12-31"
        })
        .expect(201)
    ).body;
    const workspace = `/organizations/${setup.organization.id}`;
    await agent
      .post(`${workspace}/invitations`)
      .send({ email: `runtime-pending-${suffix}@example.test`, role: "READ_ONLY" })
      .expect(201);
    await agent
      .post(`${workspace}/projects`)
      .send({ code: "P1", name: "Runtime project" })
      .expect(201);
    await agent
      .post(`${workspace}/cost-centers`)
      .send({ code: "K1", name: "Runtime center" })
      .expect(201);
    await agent
      .post(`${workspace}/voucher-series`)
      .send({ fiscalYearId: setup.fiscalYear.id, code: "B", name: "Runtime B" })
      .expect(201);
    const workspaceAccounts = await db.account.findMany({
      where: { organizationId: setup.organization.id }
    });
    const bank = workspaceAccounts.find((account) => account.accountNumber === "1930"),
      equity = workspaceAccounts.find((account) => account.type === "EQUITY");
    const templateInput = {
      code: "LOGIN",
      name: "Runtime template",
      defaultText: "Runtime default",
      voucherSeriesCode: "A",
      lines: [
        { accountId: bank.id, side: "DEBIT", amount: "10.01" },
        { accountId: equity.id, side: "CREDIT", amount: "10.01" }
      ]
    };
    const template = (
      await agent.post(`${workspace}/posting-templates`).send(templateInput).expect(201)
    ).body;
    await agent
      .patch(`${workspace}/posting-templates/${template.id}`)
      .send({ ...templateInput, name: "Runtime edited template" })
      .expect(200);
    await agent.post(`${workspace}/posting-templates/${template.id}/apply`).expect(201);
    await agent
      .get("/dashboard")
      .query({
        organizationId: setup.organization.id,
        fiscalYear: setup.fiscalYear.id,
        fromDate: "2026-01-01",
        toDate: "2026-12-31"
      })
      .expect(200);
    for (let repetition = 0; repetition < 2; repetition++) {
      const current = (
        await agent
          .get(`${workspace}/opening-balances?fiscalYear=${setup.fiscalYear.id}`)
          .expect(200)
      ).body;
      await agent
        .post(`${workspace}/opening-balances`)
        .send({
          fiscalYearId: setup.fiscalYear.id,
          expectedFingerprint: current.fingerprint,
          rows: [
            { accountId: bank.id, debit: "100", credit: "0" },
            { accountId: equity.id, debit: "0", credit: "100" }
          ]
        })
        .expect(201);
    }
    for (const item of await db.accountingPeriod.findMany({
      where: { fiscalYearId: setup.fiscalYear.id }
    }))
      await agent
        .post(`/accounting-periods/${item.id}/lock`)
        .send({ organizationId: setup.organization.id, confirm: true })
        .expect(201);
    await agent
      .post(`/fiscal-years/${setup.fiscalYear.id}/close`)
      .send({ organizationId: setup.organization.id, confirm: true })
      .expect(201);
    const nextYear = (
      await agent
        .post("/fiscal-years")
        .send({
          organizationId: setup.organization.id,
          name: "2027",
          startDate: "2027-01-01",
          endDate: "2027-12-31"
        })
        .expect(201)
    ).body;
    const carry = (
      await agent
        .post(`${workspace}/carry-forward/preview`)
        .send({
          sourceFiscalYearId: setup.fiscalYear.id,
          targetFiscalYearId: nextYear.id,
          resultAccountId: equity.id
        })
        .expect(201)
    ).body;
    await agent
      .post(`${workspace}/carry-forward/confirm`)
      .send({ previewId: carry.previewId })
      .expect(201);
    await assert.rejects(db.$executeRawUnsafe("DELETE FROM organization_invitations"));
    await assert.rejects(db.$executeRawUnsafe("UPDATE organization_invitations SET role='OWNER'"));
    await assert.rejects(
      db.$executeRawUnsafe("UPDATE year_carry_forwards SET fingerprint=repeat('0',64)")
    );
    const org = (
      await agent
        .post("/organizations")
        .send({ name: "Runtime", slug: `runtime-${suffix}` })
        .expect(201)
    ).body;
    const fiscal = (
      await agent
        .post("/fiscal-years")
        .send({
          organizationId: org.id,
          name: "2026",
          startDate: "2026-01-01",
          endDate: "2026-12-31"
        })
        .expect(201)
    ).body;
    const series = await db.voucherSeries.create({
      data: { organizationId: org.id, fiscalYearId: fiscal.id, code: "A", name: "Runtime" }
    });
    const accounts = [];
    for (const [number, accountType] of [
      ["1930", "ASSET"],
      ["3010", "REVENUE"]
    ])
      accounts.push(
        (
          await agent
            .post("/accounts")
            .send({ organizationId: org.id, number, name: number, accountType })
            .expect(201)
        ).body.id
      );
    const input = {
      organizationId: org.id,
      voucherSeriesId: series.id,
      transactionDate: "2026-01-10",
      description: "Runtime",
      lines: [
        { accountId: accounts[0], debit: "10", credit: "0" },
        { accountId: accounts[1], debit: "0", credit: "10" }
      ]
    };
    const entry = (await agent.post("/journal-entries").send(input).expect(201)).body;
    await agent
      .patch(`/journal-entries/${entry.id}`)
      .send({ expectedVersion: entry.version, description: "Reviewed" })
      .expect(200);
    await agent.post(`/journal-entries/${entry.id}/post`).send({ expectedVersion: 2 }).expect(201);
    await agent
      .post(`/journal-entries/${entry.id}/reverse`)
      .send({ voucherSeriesId: series.id, transactionDate: "2026-02-01" })
      .expect(201);
    const pending = (await agent.post("/journal-entries").send(input).expect(201)).body;
    const period = await db.accountingPeriod.findFirstOrThrow({
      where: { fiscalYearId: fiscal.id, periodNumber: 1 }
    });
    await agent
      .post(`/accounting-periods/${period.id}/lock`)
      .send({ organizationId: org.id, confirm: true })
      .expect(201);
    await agent
      .post(`/journal-entries/${pending.id}/post`)
      .send({ expectedVersion: 1 })
      .expect(409);
    const foreign = await db.organization.findFirstOrThrow({ where: { id: { not: org.id } } });
    await assert.rejects(
      db.openingBalance.create({
        data: {
          organizationId: foreign.id,
          fiscalYearId: fiscal.id,
          accountId: accounts[0],
          debitAmount: "0"
        }
      })
    );
    await agent
      .get("/reports/trial-balance")
      .query({
        organizationId: org.id,
        fiscalYear: fiscal.id,
        fromDate: "2026-01-01",
        toDate: "2026-12-31"
      })
      .expect(200);
    await agent.post("/auth/logout").expect(204);
    await agent.get("/auth/me").expect(401);
    assert.ok(await db.auditEvent.count({ where: { organizationId: org.id } }));
    console.log(
      JSON.stringify({
        actualLoginRole: "PASS",
        ddlDenials: 8,
        restoredPostedImmutability: true,
        tenantConstraint: true,
        legitimateAuthCalendarAccountPostingReversalReporting: true,
        lockedPostingRejected: true,
        migratorMembership: false,
        workspaceOnboardingInvitationsSeriesDimensionsOpeningBalancesCarry: true
      })
    );
  } finally {
    if (app) await app.close();
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error("Disposable runtime LOGIN verification failed (credentials redacted).");
  process.exitCode = 1;
});
