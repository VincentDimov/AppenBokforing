import { randomUUID } from "node:crypto";
import { prisma } from "@ledgerapp/db";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http/app-setup";

jest.setTimeout(90_000);
describe("Version / numbering / calendar races (real concurrent PostgreSQL requests)", () => {
  let app: INestApplication, owner: ReturnType<typeof request.agent>;
  let organizationId: string, fiscalYearId: string, seriesId: string;
  let accounts: string[];
  async function draft(date = "2026-01-10", series = seriesId) {
    return (
      await owner
        .post("/journal-entries")
        .send({
          organizationId,
          voucherSeriesId: series,
          transactionDate: date,
          description: "Concurrency",
          lines: [
            { accountId: accounts[0], debit: "10.01", credit: "0" },
            { accountId: accounts[1], debit: "0", credit: "10.01" }
          ]
        })
        .expect(201)
    ).body as { id: string; version: number };
  }
  const post = (entry: { id: string; version: number }) =>
    owner.post(`/journal-entries/${entry.id}/post`).send({ expectedVersion: entry.version });
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureHttpApp(app);
    await app.init();
    owner = request.agent(app.getHttpServer());
    await owner
      .post("/auth/register")
      .send({
        email: randomUUID() + "@example.test",
        displayName: "Race",
        password: "Long-race-test-password-2026!"
      })
      .expect(201);
    const org = await owner
      .post("/organizations")
      .send({ name: "Race", slug: "race-" + randomUUID() })
      .expect(201);
    organizationId = org.body.id as string;
    const year = await owner
      .post("/fiscal-years")
      .send({ organizationId, name: "2026", startDate: "2026-01-01", endDate: "2026-12-31" })
      .expect(201);
    fiscalYearId = year.body.id as string;
    seriesId = (
      await prisma.voucherSeries.create({
        data: { organizationId, fiscalYearId, code: "A", name: "Race" }
      })
    ).id;
    accounts = [];
    for (const [number, type] of [
      ["1930", "ASSET"],
      ["3010", "REVENUE"]
    ]) {
      const account = await owner
        .post("/accounts")
        .send({ organizationId, number, name: number, accountType: type })
        .expect(201);
      accounts.push(account.body.id as string);
    }
  });
  afterAll(async () => app?.close());
  it("requires a version and rejects stale PATCH / POST without writes", async () => {
    const entry = await draft();
    await owner
      .patch(`/journal-entries/${entry.id}`)
      .send({ description: "Missing version" })
      .expect(400);
    await owner.post(`/journal-entries/${entry.id}/post`).expect(400);
    const saved = await owner
      .patch(`/journal-entries/${entry.id}`)
      .send({ expectedVersion: 1, description: "A reviewed" })
      .expect(200);
    expect(saved.body.version).toBe(2);
    const stale = await owner
      .patch(`/journal-entries/${entry.id}`)
      .send({ expectedVersion: 1, description: "B stale" })
      .expect(409);
    expect(stale.body.code).toBe("JOURNAL_ENTRY_VERSION_CONFLICT");
    await post(entry).expect(409);
    expect(await prisma.journalEntry.findUnique({ where: { id: entry.id } })).toMatchObject({
      version: 2,
      description: "A reviewed",
      status: "DRAFT"
    });
    await post({ ...entry, version: 2 }).expect(201);
  });
  it("two saves have exactly one winner and one committed UPDATE audit", async () => {
    const entry = await draft();
    const results = await Promise.all(
      ["A", "B"].map((description) =>
        owner.patch(`/journal-entries/${entry.id}`).send({ expectedVersion: 1, description })
      )
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await prisma.auditEvent.count({
        where: { organizationId, entityId: entry.id, action: "UPDATE" }
      })
    ).toBe(1);
  });
  it("save versus post never posts unreviewed replacement values", async () => {
    const entry = await draft();
    const [save, posting] = await Promise.all([
      owner
        .patch(`/journal-entries/${entry.id}`)
        .send({ expectedVersion: 1, description: "New review needed" }),
      post(entry)
    ]);
    expect([
      [200, 409],
      [409, 201]
    ]).toContainEqual([save.status, posting.status]);
    const stored = await prisma.journalEntry.findUniqueOrThrow({ where: { id: entry.id } });
    if (stored.status === "POSTED") expect(stored.description).toBe("Concurrency");
    else expect(stored).toMatchObject({ version: 2, description: "New review needed" });
  });
  it("two posts consume one voucher number and one POST audit", async () => {
    const entry = await draft();
    const before = await prisma.voucherSeries.findUniqueOrThrow({ where: { id: seriesId } });
    const results = await Promise.all([post(entry), post(entry)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      (await prisma.voucherSeries.findUniqueOrThrow({ where: { id: seriesId } })).nextVoucherNumber
    ).toBe(before.nextVoucherNumber + 1);
    expect(await prisma.auditEvent.count({ where: { entityId: entry.id, action: "POST" } })).toBe(
      1
    );
  });
  it("20 simultaneous drafts post with unique monotonically allocated identities", async () => {
    const entries = [];
    for (let i = 0; i < 20; i++) entries.push(await draft());
    const before = (await prisma.voucherSeries.findUniqueOrThrow({ where: { id: seriesId } }))
      .nextVoucherNumber;
    const results = await Promise.all(entries.map(post));
    expect(results.map((r) => r.status)).toEqual(Array(20).fill(201));
    const numbers = results.map((r) => r.body.voucherNumber as number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => before + i));
    expect(new Set(numbers).size).toBe(20);
  });
  it("independent series allocate independently", async () => {
    const second = await prisma.voucherSeries.create({
      data: { organizationId, fiscalYearId, code: "B", name: "Independent" }
    });
    const entries = [await draft("2026-01-10", seriesId), await draft("2026-01-10", second.id)];
    const results = await Promise.all(entries.map(post));
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results[1]!.body.voucherNumber).toBe(1);
  });
  it("two corrections create one immutable inverse and one reversal audit", async () => {
    const entry = await draft();
    await post(entry).expect(201);
    const results = await Promise.all(
      [1, 2].map(() =>
        owner
          .post(`/journal-entries/${entry.id}/reverse`)
          .send({ voucherSeriesId: seriesId, transactionDate: "2026-02-01" })
      )
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await prisma.journalEntry.count({ where: { organizationId, reversesEntryId: entry.id } })
    ).toBe(1);
    expect(
      await prisma.auditEvent.count({ where: { entityId: entry.id, action: "REVERSE" } })
    ).toBe(1);
  });
  it("period lock versus posting has a serializable business outcome", async () => {
    const entry = await draft("2026-03-10");
    const period = await prisma.accountingPeriod.findFirstOrThrow({
      where: { organizationId, fiscalYearId, periodNumber: 3 }
    });
    const [posting, locking] = await Promise.all([
      post(entry),
      owner.post(`/accounting-periods/${period.id}/lock`).send({ organizationId, confirm: true })
    ]);
    expect(locking.status).toBe(201);
    expect([201, 409]).toContain(posting.status);
    const stored = await prisma.journalEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(stored.status).toBe(posting.status === 201 ? "POSTED" : "DRAFT");
    await post(await draft("2026-04-10")).expect(201);
  });
  it("SIE import versus posting preserves a maximum counter without collisions", async () => {
    const entry = await draft("2026-04-10");
    const content =
      '#SIETYP 4\n#RAR 0 20260101 20261231\n#VER "A" 500 20260411 "Imported"\n{\n#TRANS 1930 {} 0.01\n#TRANS 3010 {} -0.01\n}\n';
    const payload = { organizationId, fiscalYearId, content };
    const preview = await owner.post("/imports/sie").send(payload).expect(201);
    const [imported, posted] = await Promise.all([
      owner
        .post("/imports/sie")
        .send({ ...payload, confirm: true, previewToken: preview.body.previewToken }),
      post(entry)
    ]);
    expect([imported.status, posted.status]).toEqual([201, 201]);
    const counter = (await prisma.voucherSeries.findUniqueOrThrow({ where: { id: seriesId } }))
      .nextVoucherNumber;
    expect(counter).toBeGreaterThanOrEqual(501);
    const next = await post(await draft("2026-04-12")).expect(201);
    expect(next.body.voucherNumber).toBe(counter);
  });
});
