import { randomUUID } from "node:crypto";
import { prisma } from "@ledgerapp/db";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http/app-setup";

jest.setTimeout(30000);
describe("calendar locking across accounting POST endpoints", () => {
  let app: INestApplication;
  let owner: ReturnType<typeof request.agent>;
  let organizationId: string;
  let yearId: string;
  let periodId: string;
  let draftId: string;
  let postedId: string;
  let accountId: string;
  let voucherSeriesId: string;
  let body: Record<string, unknown>;
  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = fixture.createNestApplication();
    configureHttpApp(app);
    await app.init();
    owner = request.agent(app.getHttpServer());
    await owner
      .post("/auth/register")
      .send({
        displayName: "Calendar tester",
        email: `${randomUUID()}@example.test`,
        password: "Calendar-test-long-password-2026!"
      })
      .expect(201);
    organizationId = (
      await owner
        .post("/organizations")
        .send({ name: "Calendar fixture", slug: `calendar-${randomUUID()}` })
        .expect(201)
    ).body.id;
    const year = (
      await owner
        .post("/fiscal-years")
        .send({ organizationId, name: "2026", startDate: "2026-01-01", endDate: "2026-12-31" })
        .expect(201)
    ).body;
    yearId = year.id;
    periodId = year.accountingPeriods[0].id;
    expect(year.accountingPeriods).toHaveLength(12);
    expect(year.organizationId).toBe(organizationId);
    expect(year.accountingPeriods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organizationId,
          fiscalYearId: yearId,
          periodNumber: 1,
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2026-01-31T00:00:00.000Z"
        }),
        expect.objectContaining({
          organizationId,
          fiscalYearId: yearId,
          periodNumber: 12,
          startDate: "2026-12-01T00:00:00.000Z",
          endDate: "2026-12-31T00:00:00.000Z"
        })
      ])
    );
    expect(
      await prisma.accountingPeriod.count({ where: { fiscalYearId: yearId, organizationId } })
    ).toBe(12);
    const series = await prisma.voucherSeries.create({
      data: { organizationId, fiscalYearId: yearId, code: "A", name: "General" }
    });
    const debit = await prisma.account.create({
      data: {
        organizationId,
        accountNumber: "1930",
        name: "Bank",
        type: "ASSET",
        normalBalance: "DEBIT"
      }
    });
    const credit = await prisma.account.create({
      data: {
        organizationId,
        accountNumber: "3000",
        name: "Revenue",
        type: "REVENUE",
        normalBalance: "CREDIT"
      }
    });
    accountId = debit.id;
    voucherSeriesId = series.id;
    body = {
      organizationId,
      voucherSeriesId: series.id,
      transactionDate: "2026-01-15",
      description: "Fixture",
      lines: [
        { accountId: debit.id, debit: "100.00", credit: "0.00" },
        { accountId: credit.id, debit: "0.00", credit: "100.00" }
      ]
    };
    draftId = (await owner.post("/journal-entries").send(body).expect(201)).body.id;
    postedId = (await owner.post("/journal-entries").send(body).expect(201)).body.id;
    await owner.post(`/journal-entries/${postedId}/post`).send({ expectedVersion: 1 }).expect(201);
    await owner
      .post(`/accounting-periods/${periodId}/lock`)
      .set("x-request-id", "calendar-lock-fixture")
      .send({ organizationId, confirm: true })
      .expect(201);
  });
  afterAll(async () => app?.close());
  it("requires authentication for fiscal calendar endpoints", async () => {
    await request(app.getHttpServer()).get("/fiscal-years").query({ organizationId }).expect(401);
    await request(app.getHttpServer())
      .post(`/accounting-periods/${periodId}/unlock`)
      .send({ organizationId, confirm: true })
      .expect(401);
  });
  it("blocks draft creation, posting, editing and moving a locked draft", async () => {
    await owner.post("/journal-entries").send(body).expect(409);
    await owner.post(`/journal-entries/${draftId}/post`).send({ expectedVersion: 1 }).expect(409);
    await owner
      .patch(`/journal-entries/${draftId}`)
      .send({ expectedVersion: 1, description: "Changed" })
      .expect(409);
    await owner
      .patch(`/journal-entries/${draftId}`)
      .send({ expectedVersion: 1, transactionDate: "2026-02-15" })
      .expect(409);
    expect((await prisma.journalEntry.findUniqueOrThrow({ where: { id: draftId } })).status).toBe(
      "DRAFT"
    );
  });
  it("blocks corrections into locked periods but allows an open target", async () => {
    await owner
      .post(`/journal-entries/${postedId}/reverse`)
      .send({ voucherSeriesId, transactionDate: "2026-01-20", description: "Correction" })
      .expect(409);
    await owner
      .post(`/journal-entries/${postedId}/reverse`)
      .send({ voucherSeriesId, transactionDate: "2026-02-20", description: "Correction" })
      .expect(201);
  });
  it("blocks confirmed SIE imports while keeping preview available", async () => {
    const content =
      '#SIETYP 4\n#RAR 0 20260101 20261231\n#KONTO 1930 "Bank"\n#KONTO 3000 "Revenue"\n#VER A 99 20260115 "Locked import"\n{\n#TRANS 1930 {} 100.00\n#TRANS 3000 {} -100.00\n}\n';
    const mapping = { organizationId, content, fiscalYearId: yearId };
    const preview = await owner
      .post("/imports/sie")
      .send({ ...mapping, confirm: false })
      .expect(201);
    await owner
      .post("/imports/sie")
      .send({ ...mapping, previewToken: preview.body.previewToken, confirm: true })
      .expect(409);
    expect(await prisma.journalEntry.count({ where: { organizationId, voucherNumber: 99 } })).toBe(
      0
    );
  });
  it("keeps reads/reports available and records an immutable actor/request audit", async () => {
    await owner.get("/fiscal-years").query({ organizationId }).expect(200);
    await owner.get(`/journal-entries/${postedId}`).expect(200);
    await owner
      .get("/reports/general-ledger")
      .query({
        organizationId,
        fiscalYear: yearId,
        fromDate: "2026-01-01",
        toDate: "2026-01-31"
      })
      .expect(200);
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { organizationId, entityId: periodId, action: "LOCK" }
    });
    expect(audit.actorUserId).not.toBeNull();
    expect(audit.requestId).toBe("calendar-lock-fixture");
    await expect(prisma.auditEvent.delete({ where: { id: audit.id } })).rejects.toThrow();
  });
  it("blocks direct line/opening balance writes, not just HTTP routes", async () => {
    const line = await prisma.journalLine.findFirstOrThrow({ where: { journalEntryId: draftId } });
    await expect(
      prisma.journalLine.update({ where: { id: line.id }, data: { description: "Bypass" } })
    ).rejects.toThrow();
    await expect(
      prisma.openingBalance.create({
        data: {
          organizationId,
          fiscalYearId: yearId,
          accountId,
          debitAmount: "1.00",
          creditAmount: "0.00"
        }
      })
    ).rejects.toThrow();
  });
  it("audits unlock, rejects overlaps and refuses closing while periods are open", async () => {
    await owner
      .post(`/fiscal-years/${yearId}/close`)
      .send({ organizationId, confirm: true })
      .expect(409);
    await owner
      .post("/fiscal-years")
      .send({ organizationId, name: "Overlap", startDate: "2026-04-01", endDate: "2027-03-31" })
      .expect(409);
    await owner
      .post(`/accounting-periods/${periodId}/unlock`)
      .send({ organizationId, confirm: true })
      .expect(201);
    expect(
      await prisma.auditEvent.count({
        where: { organizationId, entityId: periodId, action: "UNLOCK" }
      })
    ).toBe(1);
    await owner.post(`/journal-entries/${draftId}/post`).send({ expectedVersion: 1 }).expect(201);
    const periods = await prisma.accountingPeriod.findMany({
      where: { organizationId, fiscalYearId: yearId }
    });
    for (const period of periods)
      await owner
        .post(`/accounting-periods/${period.id}/lock`)
        .send({ organizationId, confirm: true })
        .expect(201);
    await owner
      .post(`/fiscal-years/${yearId}/close`)
      .send({ organizationId, confirm: true })
      .expect(201);
    await owner
      .post(`/accounting-periods/${periodId}/unlock`)
      .send({ organizationId, confirm: true })
      .expect(409);
    await owner.post("/journal-entries").send(body).expect(409);
    expect(
      await prisma.auditEvent.count({ where: { organizationId, entityId: yearId, action: "LOCK" } })
    ).toBe(1);
  });
});
