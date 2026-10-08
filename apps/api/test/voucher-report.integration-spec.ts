import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@ledgerapp/db";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http/app-setup";
describe("voucher account history", () => {
  let app: INestApplication,
    owner: ReturnType<typeof request.agent>,
    foreign: ReturnType<typeof request.agent>,
    org: string,
    bank: string,
    revenue: string,
    series: string,
    entry: string;
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureHttpApp(app);
    await app.init();
    owner = request.agent(app.getHttpServer());
    foreign = request.agent(app.getHttpServer());
    for (const client of [owner, foreign])
      await client
        .post("/auth/register")
        .send({
          email: `${randomUUID()}@example.test`,
          displayName: "Rapport",
          password: "A-long-test-password-2026!"
        })
        .expect(201);
    org = (
      await owner
        .post("/onboarding")
        .send({
          setupKey: randomUUID(),
          name: "Rapportbolag",
          startDate: "2026-01-01",
          endDate: "2026-12-31"
        })
        .expect(201)
    ).body.organization.id;
    bank = (
      await prisma.account.findFirstOrThrow({
        where: { organizationId: org, accountNumber: "1930" }
      })
    ).id;
    revenue = (
      await prisma.account.findFirstOrThrow({
        where: { organizationId: org, accountNumber: "3000" }
      })
    ).id;
    series = (await prisma.voucherSeries.findFirstOrThrow({ where: { organizationId: org } })).id;
    entry = (
      await owner
        .post("/journal-entries")
        .send({
          organizationId: org,
          voucherSeriesId: series,
          transactionDate: "2026-01-10",
          description: "Snapshot",
          lines: [
            { accountId: bank, debit: "123.01", credit: "0" },
            { accountId: revenue, debit: "0", credit: "123.01" }
          ]
        })
        .expect(201)
    ).body.id;
    await owner.post(`/journal-entries/${entry}/post`).send({ expectedVersion: 1 }).expect(201);
  });
  afterAll(async () => {
    await app?.close();
  });
  it("retains posted name after rename, and correction copies original snapshot", async () => {
    const original = (await owner.get(`/journal-entries/${entry}`).expect(200)).body;
    await owner.patch(`/accounts/${bank}`).send({ name: "Nytt banknamn" }).expect(200);
    const report = (await owner.get(`/journal-entries/${entry}`).expect(200)).body;
    expect(report.lines[0].account).toEqual(original.lines[0].account);
    expect(report.lines[0].legacyAccountLabel).toBe(false);
    expect(report.totals.debit).toBe("123.01");
    const correction = (
      await owner
        .post(`/journal-entries/${entry}/reverse`)
        .send({ transactionDate: "2026-01-11", voucherSeriesId: series })
        .expect(201)
    ).body;
    expect(correction.lines[0].account).toEqual(original.lines[0].account);
    expect(correction.lines[0].credit).toBe("123.01");
    expect(correction.reversesEntryId).toBe(entry);
  });
  it("cannot mutate posted snapshot or read a foreign voucher", async () => {
    const line = await prisma.journalLine.findFirstOrThrow({ where: { journalEntryId: entry } });
    await expect(
      prisma.journalLine.update({
        where: { id: line.id },
        data: { accountSnapshot: { name: "forged" } }
      })
    ).rejects.toThrow();
    await foreign.get(`/journal-entries/${entry}`).expect(404);
    await request(app.getHttpServer()).get(`/journal-entries/${entry}`).expect(401);
  });
});
