import { randomUUID } from "node:crypto";
import { prisma } from "@ledgerapp/db";
import { decodeSieBytes, parseSie4, exportSie4Bytes } from "@ledgerapp/sie";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http/app-setup";

jest.setTimeout(60_000);
describe("SIE loss-aware PC8 preview/confirm/export (real PostgreSQL)", () => {
  let app: INestApplication,
    owner: ReturnType<typeof request.agent>,
    organizationId: string,
    fiscalYearId: string;
  const bytes = exportSie4Bytes({
    organization: { name: 'ÅÄÖ "Golden" åäö' },
    fiscalYear: { start: "2026-01-01", end: "2026-12-31" },
    accounts: [
      { number: "1930", name: "Bank", type: "T" },
      { number: "2080", name: "Eget kapital", type: "S" },
      { number: "3010", name: "Intäkt", type: "I" }
    ],
    balances: [
      { account: "1930", opening: "1000.00", closing: "1010.01" },
      { account: "2080", opening: "-1000.00", closing: "-1000.00" },
      { account: "3010", opening: "0.00", closing: "-10.01" }
    ],
    objects: [
      { dimension: "1", id: "K1", name: "Öst" },
      { dimension: "6", id: "P1", name: "Åsen" }
    ],
    vouchers: [
      {
        series: "A",
        number: "9",
        date: "2026-01-10",
        text: 'ÅÄÖ "försäljning"',
        transactions: [
          {
            account: "1930",
            amount: "10.02",
            date: "2026-01-09",
            text: 'En "rad"',
            objects: [
              { dimension: "1", object: "K1" },
              { dimension: "6", object: "P1" }
            ]
          },
          { account: "3010", amount: "-10.02", objects: [] }
        ]
      },
      {
        series: "A",
        number: "2",
        date: "2026-01-11",
        text: "Kredit åäö",
        transactions: [
          { account: "1930", amount: "-0.01", objects: [] },
          { account: "3010", amount: "0.01", objects: [] }
        ]
      }
    ]
  });
  const body = () => ({
    organizationId,
    fiscalYearId,
    contentBase64: Buffer.from(bytes).toString("base64")
  });
  async function provision() {
    const org = await owner
      .post("/organizations")
      .send({ name: 'ÅÄÖ "Golden" åäö', slug: "sie-" + randomUUID() })
      .expect(201);
    const year = await owner
      .post("/fiscal-years")
      .send({
        organizationId: org.body.id,
        name: "2026",
        startDate: "2026-01-01",
        endDate: "2026-12-31"
      })
      .expect(201);
    return { organizationId: org.body.id as string, fiscalYearId: year.body.id as string };
  }
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
        displayName: "SIE",
        password: "Long-safe-SIE-integration-password!"
      })
      .expect(201);
    ({ organizationId, fiscalYearId } = await provision());
  });
  afterAll(async () => app?.close());
  it("preview is accounting-write-free and binds bytes, actor, tenant and year", async () => {
    const before = await prisma.account.count({ where: { organizationId } });
    const preview = await owner.post("/imports/sie").send(body()).expect(201);
    expect(preview.body).toMatchObject({
      openingBalancesFound: 2,
      objectsFound: 2,
      vouchersFound: 2,
      validationErrors: []
    });
    expect(await prisma.account.count({ where: { organizationId } })).toBe(before);
    await owner
      .post("/imports/sie")
      .send({
        ...body(),
        contentBase64: Buffer.from(decodeSieBytes(bytes) + "\r\n").toString("base64"),
        confirm: true,
        previewToken: preview.body.previewToken
      })
      .expect(409);
    const other = await provision();
    await owner
      .post("/imports/sie")
      .send({ ...body(), ...other, confirm: true, previewToken: preview.body.previewToken })
      .expect(409);
    await owner
      .post("/imports/sie")
      .send({ ...body(), confirm: true })
      .expect(409);
    await owner
      .post("/imports/sie")
      .send({ ...body(), confirm: true, previewToken: preview.body.previewToken })
      .expect(201);
  });
  it("persists exact IB, line date, text and dimensions; number counter never regresses", async () => {
    expect(await prisma.voucherSeries.findFirst({ where: { organizationId } })).toMatchObject({
      nextVoucherNumber: 10
    });
    const entry = await prisma.journalEntry.findFirstOrThrow({
      where: { organizationId, voucherNumber: 9 },
      include: {
        lines: { orderBy: { lineNumber: "asc" }, include: { project: true, costCenter: true } }
      }
    });
    expect(entry.lines[0]!.transactionDate?.toISOString().slice(0, 10)).toBe("2026-01-09");
    expect(entry.lines[0]!.debitAmount.toFixed(2)).toBe("10.02");
    expect(entry.lines[0]!.project?.code).toBe("P1");
    expect(entry.lines[0]!.costCenter?.code).toBe("K1");
    const report = await owner
      .get("/reports/trial-balance")
      .query({
        organizationId,
        fiscalYear: fiscalYearId,
        fromDate: "2026-01-01",
        toDate: "2026-12-31"
      })
      .expect(200);
    expect(report.body.fiscalYearOpeningTotals).toEqual({ debit: "1000.00", credit: "1000.00" });
    expect(
      report.body.accounts.find((a: { number: string }) => a.number === "1930").closingDebit
    ).toBe("1010.01");
  });
  it("export bytes roundtrip through preview and confirm into an isolated organization", async () => {
    const download = await owner
      .get("/exports/sie")
      .query({ organizationId, fiscalYear: fiscalYearId })
      .expect(200);
    expect(download.headers["content-type"]).toBe("application/octet-stream");
    const parsed = parseSie4(download.body as Buffer);
    expect(parsed.errors).toEqual([]);
    expect(parsed.organization?.name).toBe('ÅÄÖ "Golden" åäö');
    expect(parsed.openingBalances.find((b) => b.account === "1930")?.amount).toBe("1000.00");
    const destination = await provision();
    const payload = { ...destination, contentBase64: (download.body as Buffer).toString("base64") };
    const preview = await owner.post("/imports/sie").send(payload).expect(201);
    expect(preview.body.validationErrors).toEqual([]);
    await owner
      .post("/imports/sie")
      .send({ ...payload, confirm: true, previewToken: preview.body.previewToken })
      .expect(201);
    const again = await owner
      .get("/exports/sie")
      .query({ organizationId: destination.organizationId, fiscalYear: destination.fiscalYearId })
      .expect(200);
    expect(parseSie4(again.body as Buffer)).toEqual(parsed);
  });
  it("repeated import cannot overwrite IB/history and rolls everything back", async () => {
    const count = await prisma.auditEvent.count({ where: { organizationId } });
    const preview = await owner.post("/imports/sie").send(body()).expect(201);
    await owner
      .post("/imports/sie")
      .send({ ...body(), confirm: true, previewToken: preview.body.previewToken })
      .expect(409);
    expect(await prisma.auditEvent.count({ where: { organizationId } })).toBe(count);
    expect(await prisma.journalEntry.count({ where: { organizationId, status: "POSTED" } })).toBe(
      2
    );
  });
});
