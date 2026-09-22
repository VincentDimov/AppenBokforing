import { randomUUID } from "node:crypto";

import { AccountType, BalanceSide, JournalEntryStatus, prisma } from "@ledgerapp/db";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http/app-setup";

const runId = randomUUID();
const suffix = runId.slice(0, 10);
const password = "A-long-integration-test-password-2026!";

jest.setTimeout(30_000);

describe("general ledger report", () => {
  let app: INestApplication;
  let ownerAgent: ReturnType<typeof request.agent>;
  let foreignAgent: ReturnType<typeof request.agent>;
  let organizationId: string;
  let foreignOrganizationId: string;
  let fiscalYearId: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureHttpApp(app);
    await app.init();
    ownerAgent = request.agent(app.getHttpServer());
    foreignAgent = request.agent(app.getHttpServer());
    await register(ownerAgent, "ledger-owner");
    await register(foreignAgent, "ledger-foreign");
    organizationId = await createOrganization(ownerAgent, "ledger-owner");
    foreignOrganizationId = await createOrganization(foreignAgent, "ledger-foreign");
    fiscalYearId = await createLedgerFixture(ownerAgent, organizationId);
  });

  afterAll(async () => app?.close());

  it("returns known posted fixtures with opening, movements, running and closing balances", async () => {
    const response = await ownerAgent
      .get("/reports/general-ledger")
      .query({
        organizationId,
        fiscalYear: fiscalYearId,
        fromDate: "2026-02-01",
        toDate: "2026-02-28"
      })
      .expect(200);

    const bank = response.body.accounts.find(
      (account: { account: { number: string } }) => account.account.number === "1930"
    );
    const revenue = response.body.accounts.find(
      (account: { account: { number: string } }) => account.account.number === "3001"
    );
    expect(bank).toMatchObject({ openingBalance: "60.00", closingBalance: "90.00" });
    expect(bank.transactions).toContainEqual(
      expect.objectContaining({
        date: "2026-02-10",
        debit: "50.00",
        credit: "0.00",
        runningBalance: "110.00",
        voucher: "A2"
      })
    );
    expect(revenue).toMatchObject({ openingBalance: "-100.00", closingBalance: "-150.00" });
    expect(revenue.transactions).toEqual([
      expect.objectContaining({
        date: "2026-02-10",
        debit: "0.00",
        credit: "50.00",
        runningBalance: "-150.00"
      })
    ]);
  });

  it("applies account, project and cost center filters to the same known fixtures", async () => {
    const response = await ownerAgent
      .get("/reports/general-ledger")
      .query({
        organizationId,
        fiscalYear: fiscalYearId,
        fromDate: "2026-01-01",
        toDate: "2026-02-28",
        accountFrom: "1930",
        accountTo: "1930",
        project: "P1",
        costCenter: "CC1"
      })
      .expect(200);

    expect(response.body.accounts).toHaveLength(1);
    expect(response.body.accounts[0]).toMatchObject({
      account: { number: "1930" },
      openingBalance: "0.00",
      closingBalance: "50.00"
    });
    expect(response.body.accounts[0].transactions).toHaveLength(1);
  });

  it("returns manually defined income-statement period and accumulated totals", async () => {
    const response = await ownerAgent
      .get("/reports/income-statement")
      .query({
        organizationId,
        fiscalYear: fiscalYearId,
        fromDate: "2026-02-01",
        toDate: "2026-02-28"
      })
      .expect(200);

    expect(response.body.groups).toEqual([
      expect.objectContaining({
        label: "Intäkter",
        periodTotal: "50.00",
        yearToDateTotal: "150.00"
      }),
      expect.objectContaining({
        label: "Kostnader",
        periodTotal: "20.00",
        yearToDateTotal: "60.00"
      })
    ]);
    expect(response.body.totals).toEqual({ periodResult: "30.00", yearToDateResult: "90.00" });
  });

  it("excludes drafts and rejects unauthenticated or cross-organization reads", async () => {
    await request(app.getHttpServer())
      .get("/reports/general-ledger")
      .query({
        organizationId,
        fiscalYear: fiscalYearId,
        fromDate: "2026-01-01",
        toDate: "2026-02-28"
      })
      .expect(401);
    await foreignAgent
      .get("/reports/general-ledger")
      .query({
        organizationId,
        fiscalYear: fiscalYearId,
        fromDate: "2026-01-01",
        toDate: "2026-02-28"
      })
      .expect(404);
    await ownerAgent
      .get("/reports/general-ledger")
      .query({
        organizationId: foreignOrganizationId,
        fiscalYear: fiscalYearId,
        fromDate: "2026-01-01",
        toDate: "2026-02-28"
      })
      .expect(404);
  });
});

async function register(agent: ReturnType<typeof request.agent>, label: string) {
  await agent
    .post("/auth/register")
    .send({ displayName: label, email: `${label}-${runId}@example.test`, password })
    .expect(201);
}

async function createOrganization(agent: ReturnType<typeof request.agent>, label: string) {
  const response = await agent
    .post("/organizations")
    .send({ name: label, slug: `${label}-${suffix}` })
    .expect(201);
  return response.body.id as string;
}

async function createLedgerFixture(
  agent: ReturnType<typeof request.agent>,
  organizationId: string
) {
  const fiscalYear = await prisma.fiscalYear.create({
    data: {
      organizationId,
      name: `Ledger ${suffix}`,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z")
    }
  });
  const period = await prisma.accountingPeriod.create({
    data: {
      organizationId,
      fiscalYearId: fiscalYear.id,
      periodNumber: 1,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z")
    }
  });
  const [bank, revenue, expense, project, costCenter, series] = await Promise.all([
    prisma.account.create({
      data: {
        organizationId,
        accountNumber: "1930",
        name: "Företagskonto",
        type: AccountType.ASSET,
        normalBalance: BalanceSide.DEBIT
      }
    }),
    prisma.account.create({
      data: {
        organizationId,
        accountNumber: "3001",
        name: "Försäljning",
        type: AccountType.REVENUE,
        normalBalance: BalanceSide.CREDIT
      }
    }),
    prisma.account.create({
      data: {
        organizationId,
        accountNumber: "5001",
        name: "Lokalkostnad",
        type: AccountType.EXPENSE,
        normalBalance: BalanceSide.DEBIT
      }
    }),
    prisma.project.create({ data: { organizationId, code: "P1", name: "Projekt 1" } }),
    prisma.costCenter.create({ data: { organizationId, code: "CC1", name: "Kostnadsställe 1" } }),
    prisma.voucherSeries.create({
      data: { organizationId, fiscalYearId: fiscalYear.id, code: "A", name: "Serie A" }
    })
  ]);
  await createEntry(agent, {
    organizationId,
    fiscalYearId: fiscalYear.id,
    periodId: period.id,
    seriesId: series.id,
    voucherNumber: 1,
    date: "2026-01-10",
    bankId: bank.id,
    revenueId: revenue.id,
    amount: 100,
    status: JournalEntryStatus.POSTED
  });
  await createEntry(agent, {
    organizationId,
    fiscalYearId: fiscalYear.id,
    periodId: period.id,
    seriesId: series.id,
    voucherNumber: 2,
    date: "2026-02-10",
    bankId: bank.id,
    revenueId: revenue.id,
    amount: 50,
    projectId: project.id,
    costCenterId: costCenter.id,
    status: JournalEntryStatus.POSTED
  });
  await createEntry(agent, {
    organizationId,
    fiscalYearId: fiscalYear.id,
    periodId: period.id,
    seriesId: series.id,
    voucherNumber: null,
    date: "2026-02-15",
    bankId: bank.id,
    revenueId: revenue.id,
    amount: 999,
    status: JournalEntryStatus.DRAFT
  });
  for (const [date, amount] of [
    ["2026-01-20", "40.00"],
    ["2026-02-20", "20.00"]
  ] as const) {
    const draft = await agent
      .post("/journal-entries")
      .send({
        organizationId,
        voucherSeriesId: series.id,
        transactionDate: date,
        description: "Known expense fixture",
        lines: [
          { accountId: expense.id, debit: amount, credit: "0.00" },
          { accountId: bank.id, debit: "0.00", credit: amount }
        ]
      })
      .expect(201);
    await agent.post(`/journal-entries/${draft.body.id}/post`).expect(201);
  }
  return fiscalYear.id;
}

async function createEntry(
  agent: ReturnType<typeof request.agent>,
  input: {
    organizationId: string;
    fiscalYearId: string;
    periodId: string;
    seriesId: string;
    voucherNumber: number | null;
    date: string;
    bankId: string;
    revenueId: string;
    amount: number;
    status: JournalEntryStatus;
    projectId?: string;
    costCenterId?: string;
  }
) {
  const draft = await agent
    .post("/journal-entries")
    .send({
      organizationId: input.organizationId,
      voucherSeriesId: input.seriesId,
      transactionDate: input.date,
      description: "Known ledger fixture",
      lines: [
        {
          accountId: input.bankId,
          debit: `${input.amount}.00`,
          credit: "0.00",
          projectCode: input.projectId ? "P1" : undefined,
          costCenterCode: input.costCenterId ? "CC1" : undefined
        },
        {
          accountId: input.revenueId,
          debit: "0.00",
          credit: `${input.amount}.00`,
          projectCode: input.projectId ? "P1" : undefined,
          costCenterCode: input.costCenterId ? "CC1" : undefined
        }
      ]
    })
    .expect(201);
  if (input.status === JournalEntryStatus.POSTED)
    await agent.post(`/journal-entries/${draft.body.id}/post`).expect(201);
}
