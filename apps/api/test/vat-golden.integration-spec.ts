import { randomUUID } from "node:crypto";
import { AccountType, BalanceSide, prisma, VatCodeType, VatReportingCategory } from "@ledgerapp/db";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http/app-setup";
import { vatGolden } from "../../../tests/fixtures/vat-golden";

jest.setTimeout(60_000);
describe("VAT Golden / real POSTED PostgreSQL vouchers", () => {
  let app: INestApplication,
    owner: ReturnType<typeof request.agent>,
    foreign: ReturnType<typeof request.agent>;
  let organizationId: string,
    fiscalYear: string,
    seriesId: string,
    draftId: string,
    originalId: string,
    reversalId: string;
  const accounts: Record<string, string> = {};
  const codes: Record<string, string> = {};
  const query = (fromDate = "2026-01-01", toDate = "2026-01-31") => ({
    organizationId,
    fiscalYear,
    fromDate,
    toDate
  });
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
          displayName: "VAT",
          email: randomUUID() + "@example.test",
          password: "Long-local-vat-fixture-password-2026!"
        })
        .expect(201);
    organizationId = (
      await owner
        .post("/organizations")
        .send({ name: "VAT Golden", slug: "vat-" + randomUUID() })
        .expect(201)
    ).body.id;
    fiscalYear = (
      await owner
        .post("/fiscal-years")
        .send({ organizationId, ...vatGolden.year })
        .expect(201)
    ).body.id;
    seriesId = (
      await prisma.voucherSeries.create({
        data: { organizationId, fiscalYearId: fiscalYear, code: "A", name: "VAT" }
      })
    ).id;
    for (const c of vatGolden.codes)
      codes[c.code] = (
        await prisma.vatCode.create({
          data: {
            organizationId,
            code: c.code,
            name: c.code,
            rate: c.rate,
            type: c.type as VatCodeType,
            configurationVersion: "SE-DOMESTIC-2026-01",
            reportingCategory:
              c.type === "EXEMPT"
                ? VatReportingCategory.NONE
                : VatReportingCategory.DOMESTIC_STANDARD,
            effectiveFrom: new Date("2026-01-01"),
            effectiveTo: new Date("2026-12-31")
          }
        })
      ).id;
    for (const [number, type] of [
      ["1930", AccountType.ASSET],
      ["3001", AccountType.REVENUE],
      ["2611", AccountType.LIABILITY],
      ["2641", AccountType.ASSET],
      ["5000", AccountType.EXPENSE]
    ] as const)
      accounts[number] = (
        await prisma.account.create({
          data: {
            organizationId,
            accountNumber: number,
            name: number,
            type,
            normalBalance:
              type === AccountType.REVENUE || type === AccountType.LIABILITY
                ? BalanceSide.CREDIT
                : BalanceSide.DEBIT
          }
        })
      ).id;
    for (const [index, c] of vatGolden.cases.entries()) {
      const date = `2026-01-0${index + 1}`;
      if (c.name === "E") {
        reversalId = (
          await owner
            .post(`/journal-entries/${originalId}/reverse`)
            .send({ transactionDate: date, voucherSeriesId: seriesId })
            .expect(201)
        ).body.id;
        continue;
      }
      const draft = await owner
        .post("/journal-entries")
        .send({
          organizationId,
          voucherSeriesId: seriesId,
          transactionDate: date,
          description: c.name,
          lines: c.lines.map((l) => ({
            accountId: accounts[l.account],
            debit: l.debit,
            credit: l.credit,
            vatCode: l.code,
            vatRole: l.role,
            vatGroup: l.group
          }))
        })
        .expect(201);
      await owner.post(`/journal-entries/${draft.body.id}/post`).send({ expectedVersion: 1 }).expect(201);
      if (c.name === "A") originalId = draft.body.id;
    }
    // Huge VAT draft must not contribute; its original code snapshot does not exist yet.
    draftId = (
      await owner
        .post("/journal-entries")
        .send({
          organizationId,
          voucherSeriesId: seriesId,
          transactionDate: "2026-01-15",
          description: "Excluded draft",
          lines: [
            {
              accountId: accounts["2611"],
              debit: "0",
              credit: "999999",
              vatCode: "OUT25",
              vatRole: "TAX"
            },
            { accountId: accounts["1930"], debit: "999999", credit: "0" }
          ]
        })
        .expect(201)
    ).body.id;
    const period = await prisma.accountingPeriod.findFirstOrThrow({
      where: { organizationId, fiscalYearId: fiscalYear, periodNumber: 1 }
    });
    await owner
      .post(`/accounting-periods/${period.id}/lock`)
      .send({ organizationId, confirm: true })
      .expect(201);
  });
  afterAll(async () => {
    await app?.close();
  });
  it.each(vatGolden.cases)("returns literal facit for case $name", async (c) => {
    const index = vatGolden.cases.findIndex((v) => v.name === c.name);
    const date = `2026-01-0${index + 1}`;
    const body = (await owner.get("/reports/vat").query(query(date, date)).expect(200)).body;
    expect(body.totals.inputVat).toBe(c.input);
    expect(body.totals.outputVat).toBe(c.output);
    expect(body.anomalies).toEqual([]);
  });
  it("reconciles base/tax/net and all scoped Swedish boxes, excluding drafts", async () => {
    const body = (await owner.get("/reports/vat").query(query()).expect(200)).body;
    expect(body.totals).toEqual(vatGolden.totals);
    expect(
      Object.fromEntries(
        body.swedishReturn.boxes.map((b: { box: string; amount: string }) => [b.box, b.amount])
      )
    ).toEqual(vatGolden.boxes);
    expect(body.reviewRequired).toBe(true);
    expect(body.anomalies).toEqual([]);
  });
  it("rejects unauthenticated and foreign members", async () => {
    await request(app.getHttpServer()).get("/reports/vat").query(query()).expect(401);
    await foreign.get("/reports/vat").query(query()).expect(404);
  });
  it("does not leak another fiscal year or accept dates outside the year", async () => {
    await owner
      .get("/reports/vat")
      .query({ ...query(), fiscalYear: randomUUID() })
      .expect(404);
    await owner.get("/reports/vat").query(query("2025-12-31")).expect(400);
  });
  it("keeps locked accounting reportable but prevents posting the excluded draft", async () => {
    await owner.post(`/journal-entries/${draftId}/post`).send({ expectedVersion: 1 }).expect(409);
    expect((await owner.get("/reports/vat").query(query()).expect(200)).body.totals).toEqual(
      vatGolden.totals
    );
  });
  it("preserves exact VAT metadata on a real reversal", async () => {
    const original = await prisma.journalLine.findMany({
      where: { journalEntryId: originalId },
      orderBy: { lineNumber: "asc" }
    });
    const correction = await prisma.journalLine.findMany({
      where: { journalEntryId: reversalId },
      orderBy: { lineNumber: "asc" }
    });
    correction.forEach((l, i) => {
      expect(l.vatSnapshot).toEqual(original[i]!.vatSnapshot);
      expect(l.vatRole).toBe(original[i]!.vatRole);
      expect(l.vatGroup).toBe(original[i]!.vatGroup);
    });
  });
  it("freezes historic rates/names and prevents direct SQL mutation of posted VAT fields", async () => {
    await prisma.vatCode.update({
      where: { id: codes.OUT25 },
      data: { rate: "12", name: "Changed", configurationVersion: "future" }
    });
    expect((await owner.get("/reports/vat").query(query()).expect(200)).body.totals).toEqual(
      vatGolden.totals
    );
    await expect(
      prisma.$executeRaw`UPDATE journal_lines SET vat_role = 'TAX' WHERE journal_entry_id = ${originalId}::uuid AND line_number = 1`
    ).rejects.toThrow();
  });
  it("preserves unresolved legacy SQL NULL metadata in reversals without guessing tax", async () => {
    const original = await prisma.journalEntry.findUniqueOrThrow({ where: { id: originalId } });
    const period = await prisma.accountingPeriod.findFirstOrThrow({
      where: { organizationId, fiscalYearId: fiscalYear, periodNumber: 2 }
    });
    const legacy = await prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          organizationId,
          fiscalYearId: fiscalYear,
          accountingPeriodId: period.id,
          createdById: original.createdById,
          voucherSeriesId: seriesId,
          entryDate: new Date("2026-02-01"),
          description: "Legacy unknown VAT",
          lines: {
            create: [
              {
                accountId: accounts["3001"]!,
                lineNumber: 1,
                creditAmount: "1000",
                vatCodeId: codes.OUT25
              },
              {
                accountId: accounts["2611"]!,
                lineNumber: 2,
                creditAmount: "250",
                vatCodeId: codes.OUT25
              },
              { accountId: accounts["1930"]!, lineNumber: 3, debitAmount: "1250" }
            ]
          }
        }
      });
      const series = await tx.voucherSeries.update({
        where: { id: seriesId },
        data: { nextVoucherNumber: { increment: 1 } }
      });
      return tx.journalEntry.update({
        where: { id: entry.id },
        data: {
          status: "POSTED",
          postedAt: new Date(),
          postedById: original.createdById,
          voucherNumber: series.nextVoucherNumber - 1
        }
      });
    });
    const before = (
      await owner.get("/reports/vat").query(query("2026-02-01", "2026-02-01")).expect(200)
    ).body;
    expect(before.totals.outputVat).toBe("0.00"); // neither 1250 nor 250 guessed
    expect(
      before.anomalies.filter((a: { code: string }) => a.code === "MISSING_VAT_SNAPSHOT")
    ).toHaveLength(2);
    const correction = await owner
      .post(`/journal-entries/${legacy.id}/reverse`)
      .send({ transactionDate: "2026-02-02", voucherSeriesId: seriesId })
      .expect(201);
    const nulls = await prisma.$queryRaw<
      { preserved: boolean }[]
    >`SELECT vat_snapshot IS NULL AS preserved FROM journal_lines WHERE journal_entry_id = ${correction.body.id}::uuid`;
    expect(nulls).toHaveLength(3);
    expect(nulls.every((l) => l.preserved)).toBe(true);
  });
});
