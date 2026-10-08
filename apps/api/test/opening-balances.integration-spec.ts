import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@ledgerapp/db";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http/app-setup";
import { goldenAccounting as golden } from "../../../tests/fixtures/accounting-golden";
jest.setTimeout(90_000);
describe("IB and year carry-forward Golden contract", () => {
  let app: INestApplication;
  let owner: ReturnType<typeof request.agent>;
  let outsider: ReturnType<typeof request.agent>;
  let org: string;
  let source: string;
  let target: string;
  let series: string;
  const accounts: Record<string, string> = {};
  const base = () => `/organizations/${org}`;
  const getIB = (year = source) => owner.get(`${base()}/opening-balances?fiscalYear=${year}`);
  const goldenRows = () =>
    golden.accounts
      .filter((account) => account.openingDebit !== "0.00" || account.openingCredit !== "0.00")
      .map((account) => ({
        accountId: accounts[account.number],
        debit: account.openingDebit,
        credit: account.openingCredit
      }));
  const carry = () => ({
    sourceFiscalYearId: source,
    targetFiscalYearId: target,
    resultAccountId: accounts["2080"]
  });
  async function close(year: string) {
    const periods = await prisma.accountingPeriod.findMany({
      where: { fiscalYearId: year },
      orderBy: { periodNumber: "asc" }
    });
    for (const period of periods)
      await owner
        .post(`/accounting-periods/${period.id}/lock`)
        .send({ organizationId: org, confirm: true })
        .expect(201);
    await owner
      .post(`/fiscal-years/${year}/close`)
      .send({ organizationId: org, confirm: true })
      .expect(201);
  }
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureHttpApp(app);
    await app.init();
    owner = request.agent(app.getHttpServer());
    outsider = request.agent(app.getHttpServer());
    for (const client of [owner, outsider])
      await client
        .post("/auth/register")
        .send({
          email: `${randomUUID()}@example.test`,
          displayName: "IB",
          password: "A-long-test-password-2026!"
        })
        .expect(201);
    org = (
      await owner
        .post("/organizations")
        .send({ name: "Golden IB", slug: `ib-${randomUUID()}` })
        .expect(201)
    ).body.id;
    source = (
      await owner
        .post("/fiscal-years")
        .send({ organizationId: org, ...golden.year })
        .expect(201)
    ).body.id;
    target = (
      await owner
        .post("/fiscal-years")
        .send({
          organizationId: org,
          name: "Golden 2027",
          startDate: "2027-01-01",
          endDate: "2027-12-31"
        })
        .expect(201)
    ).body.id;
    series = (
      await owner
        .post(`${base()}/voucher-series`)
        .send({ fiscalYearId: source, code: "A", name: "Golden" })
        .expect(201)
    ).body.id;
    for (const account of golden.accounts)
      accounts[account.number] = (
        await owner
          .post("/accounts")
          .send({
            organizationId: org,
            number: account.number,
            name: account.name,
            accountType: account.type
          })
          .expect(201)
      ).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });
  it("saves a whole balanced IB set, excludes zero rows, and rejects unauthenticated/foreign users", async () => {
    await request(app.getHttpServer())
      .get(`${base()}/opening-balances?fiscalYear=${source}`)
      .expect(401);
    await outsider.get(`${base()}/opening-balances?fiscalYear=${source}`).expect(404);
    const current = (await getIB().expect(200)).body;
    await owner
      .post(`${base()}/opening-balances`)
      .send({
        fiscalYearId: source,
        expectedFingerprint: current.fingerprint,
        rows: [...goldenRows(), { accountId: accounts["3010"], debit: "0", credit: "0" }]
      })
      .expect(400);
    const saved = await owner
      .post(`${base()}/opening-balances`)
      .send({ fiscalYearId: source, expectedFingerprint: current.fingerprint, rows: goldenRows() })
      .expect(201);
    expect(saved.body.totals).toEqual(golden.expected.openingTotals);
    expect(
      await prisma.openingBalance.count({ where: { organizationId: org, fiscalYearId: source } })
    ).toBe(4);
  });
  it("rejects unbalanced, two-sided, negative, foreign and income-statement IB without changes", async () => {
    const current = (await getIB()).body;
    const row = { accountId: accounts["1930"], debit: "1", credit: "0" };
    for (const rows of [
      [row],
      [{ ...row, credit: "1" }],
      [{ ...row, debit: "-1" }],
      [{ ...row, accountId: randomUUID() }],
      [{ ...row, accountId: accounts["3010"] }]
    ])
      await owner
        .post(`${base()}/opening-balances`)
        .send({ fiscalYearId: source, expectedFingerprint: current.fingerprint, rows })
        .expect(400);
    expect((await getIB()).body.fingerprint).toBe(current.fingerprint);
  });
  it("concurrent IB saves have one winner, one conflict and no partial set", async () => {
    const current = (await getIB()).body;
    const rows = goldenRows();
    const result = await Promise.all([
      owner
        .post(`${base()}/opening-balances`)
        .send({ fiscalYearId: source, expectedFingerprint: current.fingerprint, rows }),
      owner
        .post(`${base()}/opening-balances`)
        .send({ fiscalYearId: source, expectedFingerprint: current.fingerprint, rows })
    ]);
    expect(result.map((response) => response.status).sort()).toEqual([201, 409]);
    expect((await getIB()).body.totals).toEqual(golden.expected.openingTotals);
  });
  it("posts the shared Golden movements, freezes IB/classification, and requires closed source", async () => {
    const ids: string[] = [];
    for (const voucher of [...golden.vouchers, golden.finalVoucher]) {
      const draft = (
        await owner
          .post("/journal-entries")
          .send({
            organizationId: org,
            voucherSeriesId: series,
            transactionDate: voucher.date,
            description: voucher.text,
            lines: [
              { accountId: accounts[voucher.debit], debit: voucher.amount, credit: "0" },
              { accountId: accounts[voucher.credit], debit: "0", credit: voucher.amount }
            ]
          })
          .expect(201)
      ).body;
      await owner
        .post(`/journal-entries/${draft.id}/post`)
        .send({ expectedVersion: draft.version })
        .expect(201);
      ids.push(draft.id);
    }
    await owner
      .post(`/journal-entries/${ids[golden.reversal.originalIndex]}/reverse`)
      .send({
        voucherSeriesId: series,
        transactionDate: golden.reversal.date,
        description: golden.reversal.description
      })
      .expect(201);
    const current = (await getIB()).body;
    await owner
      .post(`${base()}/opening-balances`)
      .send({ fiscalYearId: source, expectedFingerprint: current.fingerprint, rows: goldenRows() })
      .expect(409);
    await owner.patch(`/accounts/${accounts["1930"]}`).send({ accountType: "EXPENSE" }).expect(409);
    await owner.post(`${base()}/carry-forward/preview`).send(carry()).expect(409);
    await close(source);
  });
  it("preview requires explicit equity destination and detects source metadata changes", async () => {
    await owner
      .post(`${base()}/carry-forward/preview`)
      .send({ ...carry(), resultAccountId: accounts["3010"] })
      .expect(400);
    const preview = (await owner.post(`${base()}/carry-forward/preview`).send(carry()).expect(201))
      .body;
    expect(preview.totals).toEqual({ debit: "11000.00", credit: "11000.00" });
    expect(preview.resultNet).toBe("-2000.00");
    await owner
      .patch(`/accounts/${accounts["1930"]}`)
      .send({ name: "Bank presentation updated" })
      .expect(200);
    const failed = await owner
      .post(`${base()}/carry-forward/confirm`)
      .send({ previewId: preview.previewId })
      .expect(409);
    expect(failed.body.code).toBe("CARRY_FORWARD_SOURCE_CHANGED");
    expect(await prisma.openingBalance.count({ where: { fiscalYearId: target } })).toBe(0);
  });
  it("two confirmations produce one IB; next-year BS and trial balance reconcile with Golden source closing", async () => {
    const preview = (await owner.post(`${base()}/carry-forward/preview`).send(carry()).expect(201))
      .body;
    const confirmations = await Promise.all([
      owner.post(`${base()}/carry-forward/confirm`).send({ previewId: preview.previewId }),
      owner.post(`${base()}/carry-forward/confirm`).send({ previewId: preview.previewId })
    ]);
    expect(confirmations.map((response) => response.status).sort()).toEqual([201, 409]);
    const balances = await prisma.openingBalance.findMany({
      where: { fiscalYearId: target },
      include: { account: true }
    });
    expect(
      balances
        .map((balance) => [
          balance.account.accountNumber,
          balance.debitAmount.toFixed(2),
          balance.creditAmount.toFixed(2)
        ])
        .sort()
    ).toEqual([
      ["1930", "11000.00", "0.00"],
      ["2080", "0.00", "11000.00"]
    ]);
    const interval = {
      organizationId: org,
      fiscalYear: target,
      fromDate: "2027-01-01",
      toDate: "2027-12-31"
    };
    const tb = (await owner.get("/reports/trial-balance").query(interval).expect(200)).body;
    expect(tb.totals).toEqual({
      openingDebit: "11000.00",
      openingCredit: "11000.00",
      periodDebit: "0.00",
      periodCredit: "0.00",
      closingDebit: "11000.00",
      closingCredit: "11000.00"
    });
    const bs = (
      await owner
        .get("/reports/balance-sheet")
        .query({ organizationId: org, fiscalYear: target, reportDate: "2027-12-31" })
        .expect(200)
    ).body;
    expect(bs.totals.assets).toBe(golden.expected.yearEnd.assets);
    expect(bs.totals.equityAndLiabilities).toBe(golden.expected.yearEnd.equity);
    const income = (await owner.get("/reports/income-statement").query(interval).expect(200)).body;
    expect(income.totals.periodResult).toBe("0.00");
  });
  it("target IB editing versus carry-forward cannot overwrite a winning target state", async () => {
    await close(target);
    const next = (
      await owner
        .post("/fiscal-years")
        .send({ organizationId: org, name: "2028", startDate: "2028-01-01", endDate: "2028-12-31" })
        .expect(201)
    ).body.id;
    const preview = (
      await owner
        .post(`${base()}/carry-forward/preview`)
        .send({
          sourceFiscalYearId: target,
          targetFiscalYearId: next,
          resultAccountId: accounts["2080"]
        })
        .expect(201)
    ).body;
    const current = (await getIB(next)).body;
    const result = await Promise.all([
      owner.post(`${base()}/carry-forward/confirm`).send({ previewId: preview.previewId }),
      owner.post(`${base()}/opening-balances`).send({
        fiscalYearId: next,
        expectedFingerprint: current.fingerprint,
        rows: [
          { accountId: accounts["1930"], debit: "10", credit: "0" },
          { accountId: accounts["2080"], debit: "0", credit: "10" }
        ]
      })
    ]);
    expect(result.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(["10.00", "11000.00"]).toContain((await getIB(next)).body.totals.debit);
  });
  it("source close vs preview and forbidden source posting vs confirmation preserve one target state", async () => {
    const created = [];
    for (const year of ["2030", "2031"])
      created.push(
        (
          await owner
            .post("/fiscal-years")
            .send({
              organizationId: org,
              name: year,
              startDate: `${year}-01-01`,
              endDate: `${year}-12-31`
            })
            .expect(201)
        ).body.id
      );
    const sourceYear = created[0],
      targetYear = created[1];
    const sourceVoucherSeries = (
      await owner
        .post(`${base()}/voucher-series`)
        .send({ fiscalYearId: sourceYear, code: "Z", name: "Source 2030" })
        .expect(201)
    ).body;
    for (const period of await prisma.accountingPeriod.findMany({
      where: { fiscalYearId: sourceYear }
    }))
      await owner
        .post(`/accounting-periods/${period.id}/lock`)
        .send({ organizationId: org, confirm: true })
        .expect(201);
    const input = {
      sourceFiscalYearId: sourceYear,
      targetFiscalYearId: targetYear,
      resultAccountId: accounts["2080"]
    };
    const raced = await Promise.all([
      owner.post(`/fiscal-years/${sourceYear}/close`).send({ organizationId: org, confirm: true }),
      owner.post(`${base()}/carry-forward/preview`).send(input)
    ]);
    expect(raced[0]!.status).toBe(201);
    expect([201, 409]).toContain(raced[1]!.status);
    expect(await prisma.openingBalance.count({ where: { fiscalYearId: targetYear } })).toBe(0);
    const preview =
      raced[1]!.status === 201
        ? raced[1]!.body
        : (await owner.post(`${base()}/carry-forward/preview`).send(input).expect(201)).body;
    const sourceSeries = (
      await owner
        .post(`${base()}/voucher-series`)
        .send({ fiscalYearId: sourceYear, code: "Z", name: "Forbidden closed year" })
    ).status;
    expect(sourceSeries).toBe(409);
    // Even a simultaneous attempt to start source accounting cannot reopen the
    // closed calendar or change what the confirmation fingerprints.
    const confirmed = await Promise.all([
      owner.post(`${base()}/carry-forward/confirm`).send({ previewId: preview.previewId }),
      owner.post("/journal-entries").send({
        organizationId: org,
        voucherSeriesId: sourceVoucherSeries.id,
        transactionDate: "2030-01-01",
        description: "Forbidden closed source",
        lines: [
          { accountId: accounts["1930"], debit: "10", credit: "0" },
          { accountId: accounts["2080"], debit: "0", credit: "10" }
        ]
      })
    ]);
    expect(confirmed.map((response) => response.status)).toEqual([201, 409]);
    expect(
      await prisma.yearCarryForward.count({
        where: { targetFiscalYearId: targetYear, confirmedAt: { not: null } }
      })
    ).toBe(1);
  });
});
