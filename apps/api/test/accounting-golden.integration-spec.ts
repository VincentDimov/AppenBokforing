import { randomUUID } from "node:crypto";
import { AccountType, prisma } from "@ledgerapp/db";
import { normalBalanceForAccountType } from "../src/accounts/account-normal-balance";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http/app-setup";
import { goldenAccounting as golden } from "../../../tests/fixtures/accounting-golden";
import { validateIndependent } from "../../../tests/sie-independent.cjs";

jest.setTimeout(60_000);
type Agent = ReturnType<typeof request.agent>;
type Fixture = {
  organizationId: string;
  fiscalYear: string;
  seriesId: string;
  accounts: Record<string, string>;
};
type TrialAccount = { number: string; closingDebit: string; closingCredit: string };
describe("Golden accounting truth (real PostgreSQL / HTTP)", () => {
  let app: INestApplication, owner: Agent, foreign: Agent, fixture: Fixture, empty: Fixture;
  async function provision(agent: Agent, opening: boolean): Promise<Fixture> {
    const organization = await agent
      .post("/organizations")
      .send({ name: "Golden", slug: "golden-" + randomUUID() })
      .expect(201);
    const organizationId = organization.body.id as string;
    const year = await agent
      .post("/fiscal-years")
      .send({ organizationId, ...golden.year })
      .expect(201);
    const fiscalYear = year.body.id as string;
    const series = await prisma.voucherSeries.create({
      data: { organizationId, fiscalYearId: fiscalYear, code: "A", name: "Golden" }
    });
    const accounts: Record<string, string> = {};
    for (const account of golden.accounts) {
      const type = account.type as AccountType;
      const created = await prisma.account.create({
        data: {
          organizationId,
          accountNumber: account.number,
          name: account.name,
          type,
          normalBalance: normalBalanceForAccountType(type)
        }
      });
      accounts[account.number] = created.id;
    }
    if (opening)
      await prisma.openingBalance.createMany({
        data: golden.accounts
          .filter((a) => a.openingDebit !== "0.00" || a.openingCredit !== "0.00")
          .map((a) => ({
            organizationId,
            fiscalYearId: fiscalYear,
            accountId: accounts[a.number]!,
            debitAmount: a.openingDebit,
            creditAmount: a.openingCredit
          }))
      });
    return { organizationId, fiscalYear, seriesId: series.id, accounts };
  }
  async function entry(
    f: Fixture,
    v: { date: string; text: string; debit: string; credit: string; amount: string },
    post = true
  ) {
    const draft = await owner
      .post("/journal-entries")
      .send({
        organizationId: f.organizationId,
        voucherSeriesId: f.seriesId,
        transactionDate: v.date,
        description: v.text,
        lines: [
          { accountId: f.accounts[v.debit], debit: v.amount, credit: "0.00" },
          { accountId: f.accounts[v.credit], debit: "0.00", credit: v.amount }
        ]
      })
      .expect(201);
    if (post)
      await owner
        .post("/journal-entries/" + draft.body.id + "/post")
        .send({ expectedVersion: 1 })
        .expect(201);
    return draft.body.id as string;
  }
  const interval = (
    f: Fixture,
    fromDate: string = golden.year.startDate,
    toDate: string = golden.year.endDate
  ) => ({ organizationId: f.organizationId, fiscalYear: f.fiscalYear, fromDate, toDate });
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureHttpApp(app);
    await app.init();
    owner = request.agent(app.getHttpServer());
    foreign = request.agent(app.getHttpServer());
    for (const agent of [owner, foreign])
      await agent
        .post("/auth/register")
        .send({
          displayName: "Golden",
          email: randomUUID() + "@example.test",
          password: "Fixed-golden-test-password-2026!"
        })
        .expect(201);
    fixture = await provision(owner, true);
    empty = await provision(owner, false);
    await provision(foreign, true); // same account numbers and IB must never bleed into owner reports
    const ids = [];
    for (const voucher of golden.vouchers) ids.push(await entry(fixture, voucher));
    await owner
      .post("/journal-entries/" + ids[golden.reversal.originalIndex] + "/reverse")
      .send({
        voucherSeriesId: fixture.seriesId,
        transactionDate: golden.reversal.date,
        description: golden.reversal.description
      })
      .expect(201);
    await entry(fixture, golden.finalVoucher);
    await entry(fixture, golden.draft, false);
    await entry(empty, golden.draft, false);
  });
  afterAll(async () => {
    await app?.close();
  });

  it("independently validates exported Golden bytes then reconciles imported IB and all four reports", async () => {
    const exported = await owner
      .get("/exports/sie")
      .query({ organizationId: fixture.organizationId, fiscalYear: fixture.fiscalYear })
      .expect(200);
    const bytes = Buffer.from(exported.body);
    const independent = validateIndependent(bytes);
    expect(independent.opening.get("1930")).toBe(1000000n);
    expect(independent.closing.get("1930")).toBe(1100000n);
    const target = await provision(owner, false);
    const input = {
      organizationId: target.organizationId,
      fiscalYearId: target.fiscalYear,
      contentBase64: bytes.toString("base64")
    };
    const preview = await owner.post("/imports/sie").send(input).expect(201);
    await owner
      .post("/imports/sie")
      .send({ ...input, confirm: true, previewToken: preview.body.previewToken })
      .expect(201);
    const openings = async (f: Fixture) =>
      (
        await prisma.openingBalance.findMany({
          where: { organizationId: f.organizationId },
          include: { account: true },
          orderBy: { account: { accountNumber: "asc" } }
        })
      ).map((row) => [
        row.account.accountNumber,
        row.debitAmount.toFixed(2),
        row.creditAmount.toFixed(2)
      ]);
    expect(await openings(target)).toEqual(await openings(fixture));
    // Physical IDs and import provenance differ; financial fields must not.
    const financial = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(financial);
      if (value && typeof value === "object")
        return Object.fromEntries(
          Object.entries(value)
            .filter(
              ([key]) =>
                !/(^id$|Id$|^organization$|^fiscalYear$|^generatedAt$|^reversesEntry|^reversedByEntry)/.test(
                  key
                )
            )
            .map(([key, item]) => [key, financial(item)])
        );
      return value;
    };
    for (const endpoint of [
      "trial-balance",
      "general-ledger",
      "income-statement",
      "balance-sheet"
    ]) {
      const query = (f: Fixture) =>
        endpoint === "balance-sheet"
          ? {
              organizationId: f.organizationId,
              fiscalYear: f.fiscalYear,
              reportDate: golden.year.endDate
            }
          : interval(f);
      const original = (
        await owner
          .get("/reports/" + endpoint)
          .query(query(fixture))
          .expect(200)
      ).body;
      const imported = (
        await owner
          .get("/reports/" + endpoint)
          .query(query(target))
          .expect(200)
      ).body;
      expect(financial(imported)).toEqual(financial(original));
    }
  });

  it("reconciles all six account rows and every total across GL / trial / BS / income", async () => {
    const tb = (await owner.get("/reports/trial-balance").query(interval(fixture)).expect(200))
      .body;
    expect(tb.accounts).toEqual(
      golden.expected.accounts.map((row) => expect.objectContaining(row))
    );
    expect(tb.totals).toEqual(golden.expected.fullYearTotals);
    expect(tb.fiscalYearOpeningTotals).toEqual(golden.expected.openingTotals);
    const gl = (await owner.get("/reports/general-ledger").query(interval(fixture)).expect(200))
      .body;
    expect(gl.fiscalYearOpeningTotals).toEqual(tb.fiscalYearOpeningTotals);
    for (const account of gl.accounts) {
      const trial = tb.accounts.find((row: TrialAccount) => row.number === account.account.number);
      const expected = golden.expected.accounts.find(
        (row) => row.number === account.account.number
      )!;
      // Facit is literal, not recomputed through production helpers.
      const raw = (
        {
          "1510": "0.00",
          "1930": "11000.00",
          "2080": "-9000.00",
          "2440": "0.00",
          "3010": "-4500.00",
          "5000": "2500.00"
        } as Record<string, string>
      )[account.account.number];
      expect(account.closingBalance).toBe(raw);
      expect(trial).toMatchObject({
        closingDebit: expected.closingDebit,
        closingCredit: expected.closingCredit
      });
      if (account.account.number === "1930")
        expect(account.closingBalance).toBe(trial.closingDebit);
    }
    const bs = (
      await owner
        .get("/reports/balance-sheet")
        .query({
          ...interval(fixture),
          fromDate: undefined,
          toDate: undefined,
          reportDate: golden.year.endDate,
          comparisonDate: "2026-06-30"
        })
        .expect(200)
    ).body;
    expect(bs.fiscalYearOpeningTotals).toEqual(tb.fiscalYearOpeningTotals);
    expect(bs.totals).toMatchObject({
      assets: "11000.00",
      equityAndLiabilities: "11000.00",
      difference: "0.00",
      comparisonAssets: "13500.00",
      comparisonEquityAndLiabilities: "13500.00",
      comparisonDifference: "0.00"
    });
    expect(bs.groups.map((g: { total: string }) => g.total)).toEqual([
      "11000.00",
      "11000.00",
      "0.00"
    ]);
    expect(bs.groups[0].accounts.find((a: { number: string }) => a.number === "1930").amount).toBe(
      tb.accounts.find((a: TrialAccount) => a.number === "1930").closingDebit
    );
    expect(bs.groups.map((g: { comparisonTotal: string }) => g.comparisonTotal)).toEqual([
      "13500.00",
      "12000.00",
      "1500.00"
    ]);
    const income = (
      await owner.get("/reports/income-statement").query(interval(fixture)).expect(200)
    ).body;
    expect(income.groups.map((g: { periodTotal: string }) => g.periodTotal)).toEqual([
      "4500.00",
      "2500.00"
    ]);
    expect(income.totals).toEqual({ periodResult: "2000.00", yearToDateResult: "2000.00" });
    expect(
      bs.groups[1].accounts.find((a: { number: string }) => a.number === "ÅRETS_RESULTAT").amount
    ).toBe(income.totals.yearToDateResult);
  });

  it("rolls fiscal IB plus pre-interval postings into the mid-year opening", async () => {
    const query = interval(fixture, "2026-07-01", "2026-12-31");
    const tb = (await owner.get("/reports/trial-balance").query(query).expect(200)).body;
    expect(tb.totals).toEqual(golden.expected.midYearTotals);
    const gl = (await owner.get("/reports/general-ledger").query(query).expect(200)).body;
    expect(
      gl.accounts.find((a: { account: { number: string } }) => a.account.number === "1930")
    ).toMatchObject({
      fiscalYearOpeningBalance: "10000.00",
      beforePeriodNet: "3500.00",
      openingBalance: "13500.00",
      closingBalance: "11000.00"
    });
    const income = (await owner.get("/reports/income-statement").query(query).expect(200)).body;
    expect(income.totals).toEqual({ periodResult: "-1000.00", yearToDateResult: "2000.00" });
  });

  it("includes the fiscal-year first day but no future postings at that report date", async () => {
    const gl = (
      await owner
        .get("/reports/general-ledger")
        .query(interval(fixture, "2026-01-01", "2026-01-01"))
        .expect(200)
    ).body;
    expect(
      gl.accounts.find((a: { account: { number: string } }) => a.account.number === "1930")
    ).toMatchObject({ openingBalance: "10000.00", closingBalance: "12000.00" });
    const bs = (
      await owner
        .get("/reports/balance-sheet")
        .query({
          organizationId: fixture.organizationId,
          fiscalYear: fixture.fiscalYear,
          reportDate: "2026-01-01"
        })
        .expect(200)
    ).body;
    expect(bs.totals).toMatchObject({
      assets: "12000.00",
      equityAndLiabilities: "12000.00",
      comparisonAssets: "0.00"
    });
  });

  it("returns zero for no IB / draft-only data and retains zero accounts", async () => {
    const tb = (await owner.get("/reports/trial-balance").query(interval(empty)).expect(200)).body;
    expect(tb.accounts).toHaveLength(6);
    expect(Object.values(tb.totals)).toEqual(Array(6).fill("0.00"));
    const gl = (await owner.get("/reports/general-ledger").query(interval(empty)).expect(200)).body;
    expect(
      gl.accounts.every(
        (a: { closingBalance: string; transactions: unknown[] }) =>
          a.closingBalance === "0.00" && a.transactions.length === 0
      )
    ).toBe(true);
    const bs = (
      await owner
        .get("/reports/balance-sheet")
        .query({
          organizationId: empty.organizationId,
          fiscalYear: empty.fiscalYear,
          reportDate: "2026-12-31"
        })
        .expect(200)
    ).body;
    expect(bs.totals.assets).toBe("0.00");
  });

  it("preserves credit assets and debit liabilities rather than changing their signs", async () => {
    const f = await provision(owner, false);
    await entry(f, {
      date: "2026-12-31",
      text: "Omvända saldon",
      debit: "2440",
      credit: "1930",
      amount: "12000.00"
    });
    const tb = (await owner.get("/reports/trial-balance").query(interval(f)).expect(200)).body;
    expect(tb.accounts.find((a: TrialAccount) => a.number === "1930")).toMatchObject({
      closingDebit: "0.00",
      closingCredit: "12000.00"
    });
    expect(tb.accounts.find((a: TrialAccount) => a.number === "2440")).toMatchObject({
      closingDebit: "12000.00",
      closingCredit: "0.00"
    });
    const bs = (
      await owner
        .get("/reports/balance-sheet")
        .query({
          organizationId: f.organizationId,
          fiscalYear: f.fiscalYear,
          reportDate: "2026-12-31"
        })
        .expect(200)
    ).body;
    expect(bs.totals).toMatchObject({
      assets: "-12000.00",
      equityAndLiabilities: "-12000.00",
      difference: "0.00"
    });
  });

  it("fails closed on unbalanced IB even if its account lies outside the GL account filter", async () => {
    const f = await provision(owner, false);
    await prisma.openingBalance.create({
      data: {
        organizationId: f.organizationId,
        fiscalYearId: f.fiscalYear,
        accountId: f.accounts["1510"]!,
        debitAmount: "100.00"
      }
    });
    for (const endpoint of ["general-ledger", "trial-balance"]) {
      const response = await owner
        .get("/reports/" + endpoint)
        .query({
          ...interval(f),
          ...(endpoint === "general-ledger" ? { accountFrom: "1930", accountTo: "1930" } : {})
        })
        .expect(422);
      expect(response.body.code).toBe("UNBALANCED_OPENING_BALANCE");
    }
    await owner
      .get("/reports/balance-sheet")
      .query({
        organizationId: f.organizationId,
        fiscalYear: f.fiscalYear,
        reportDate: "2026-12-31"
      })
      .expect(422);
  });

  it("rejects income-account IB, negative/simultaneous sides and foreign account references", async () => {
    const f = await provision(owner, false);
    const base = { organizationId: f.organizationId, fiscalYearId: f.fiscalYear };
    for (const amounts of [
      { debitAmount: "-1.00", creditAmount: "0.00" },
      { debitAmount: "1.00", creditAmount: "1.00" }
    ])
      await expect(
        prisma.openingBalance.create({
          data: { ...base, accountId: f.accounts["1930"]!, ...amounts }
        })
      ).rejects.toThrow();
    await expect(
      prisma.openingBalance.create({
        data: { ...base, accountId: fixture.accounts["1930"]!, debitAmount: "1.00" }
      })
    ).rejects.toThrow();
    await prisma.openingBalance.createMany({
      data: [
        { ...base, accountId: f.accounts["1930"]!, debitAmount: "100.00" },
        { ...base, accountId: f.accounts["3010"]!, creditAmount: "100.00" }
      ]
    });
    expect(
      (await owner.get("/reports/trial-balance").query(interval(f)).expect(422)).body.code
    ).toBe("INVALID_OPENING_BALANCE");
  });

  it("supports dimension-filtered pre-interval movements when no IB exists", async () => {
    const f = await provision(owner, false);
    await prisma.project.create({
      data: { organizationId: f.organizationId, code: "P1", name: "Projekt" }
    });
    await prisma.costCenter.create({
      data: { organizationId: f.organizationId, code: "CC1", name: "Kostnadsställe" }
    });
    const draft = await owner
      .post("/journal-entries")
      .send({
        organizationId: f.organizationId,
        voucherSeriesId: f.seriesId,
        transactionDate: "2026-01-01",
        description: "Dimension fixture",
        lines: [
          {
            accountId: f.accounts["1930"],
            debit: "50.00",
            credit: "0.00",
            projectCode: "P1",
            costCenterCode: "CC1"
          },
          {
            accountId: f.accounts["3010"],
            debit: "0.00",
            credit: "50.00",
            projectCode: "P1",
            costCenterCode: "CC1"
          }
        ]
      })
      .expect(201);
    await owner
      .post("/journal-entries/" + draft.body.id + "/post")
      .send({ expectedVersion: 1 })
      .expect(201);
    const gl = (
      await owner
        .get("/reports/general-ledger")
        .query({
          ...interval(f, "2026-02-01", "2026-02-28"),
          project: "P1",
          costCenter: "CC1",
          accountFrom: "1930",
          accountTo: "1930"
        })
        .expect(200)
    ).body;
    expect(gl.accounts).toHaveLength(1);
    expect(gl.accounts[0]).toMatchObject({
      fiscalYearOpeningBalance: "0.00",
      beforePeriodNet: "50.00",
      openingBalance: "50.00",
      closingBalance: "50.00",
      transactions: []
    });
  });

  it("rejects unauthenticated/foreign users, foreign years, invalid dates and ambiguous IB dimensions", async () => {
    await request(app.getHttpServer())
      .get("/reports/trial-balance")
      .query(interval(fixture))
      .expect(401);
    await foreign.get("/reports/trial-balance").query(interval(fixture)).expect(404);
    await owner
      .get("/reports/trial-balance")
      .query({ ...interval(empty), fiscalYear: fixture.fiscalYear })
      .expect(404);
    for (const [fromDate, toDate] of [
      ["2025-12-31", "2026-12-31"],
      ["2026-12-31", "2026-01-01"],
      ["2026-02-30", "2026-12-31"]
    ])
      await owner
        .get("/reports/trial-balance")
        .query({ ...interval(fixture), fromDate, toDate })
        .expect(400);
    expect(
      (
        await owner
          .get("/reports/general-ledger")
          .query({ ...interval(fixture), project: "P1" })
          .expect(422)
      ).body.code
    ).toBe("UNALLOCATED_OPENING_BALANCE");
    await owner
      .get("/reports/trial-balance")
      .query({ ...interval(fixture), project: "P1" })
      .expect(400);
    const foreignUser = (await foreign.get("/auth/me").expect(200)).body.user.id as string;
    await prisma.organizationMember.create({
      data: { organizationId: fixture.organizationId, userId: foreignUser, role: "READ_ONLY" }
    });
    expect(
      (await foreign.get("/reports/trial-balance").query(interval(fixture)).expect(200)).body.totals
    ).toEqual(golden.expected.fullYearTotals);
  });
});
