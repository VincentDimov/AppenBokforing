import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@ledgerapp/db";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http/app-setup";
jest.setTimeout(90_000);
describe("managed voucher series", () => {
  let app: INestApplication;
  let owner: ReturnType<typeof request.agent>;
  let org: string;
  let year: string;
  let accounts: string[];
  let series: string;
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
        email: `${randomUUID()}@example.test`,
        displayName: "Serieägare",
        password: "A-long-test-password-2026!"
      })
      .expect(201);
    const created = (
      await owner
        .post("/onboarding")
        .send({
          setupKey: randomUUID(),
          name: "Series",
          startDate: "2026-01-01",
          endDate: "2026-12-31"
        })
        .expect(201)
    ).body;
    org = created.organization.id;
    year = created.fiscalYear.id;
    accounts = (
      await prisma.account.findMany({
        where: { organizationId: org, accountNumber: { in: ["1930", "3000"] } },
        orderBy: { accountNumber: "asc" }
      })
    ).map((account) => account.id);
  });
  afterAll(async () => {
    await app?.close();
  });
  async function draft(seriesId = series) {
    return (
      await owner
        .post("/journal-entries")
        .send({
          organizationId: org,
          voucherSeriesId: seriesId,
          transactionDate: "2026-01-10",
          description: "Managed",
          lines: [
            { accountId: accounts[0], debit: "1.01", credit: "0" },
            { accountId: accounts[1], debit: "0", credit: "1.01" }
          ]
        })
        .expect(201)
    ).body;
  }
  it("creates safe identifiers, rejects duplicates and forged counters", async () => {
    series = (
      await owner
        .post(`/organizations/${org}/voucher-series`)
        .send({ fiscalYearId: year, code: "B_2", name: "Manuell" })
        .expect(201)
    ).body.id;
    await owner
      .post(`/organizations/${org}/voucher-series`)
      .send({ fiscalYearId: year, code: "B_2", name: "Duplicate" })
      .expect(409);
    await owner
      .post(`/organizations/${org}/voucher-series`)
      .send({ fiscalYearId: year, code: 'A"\n#VER', name: "Injection" })
      .expect(400);
    await owner
      .patch(`/organizations/${org}/voucher-series/${series}`)
      .send({ nextVoucherNumber: 100 })
      .expect(400);
  });
  it("default series is used by editor options and numbering remains sequential", async () => {
    await owner
      .patch(`/organizations/${org}`)
      .send({ defaultVoucherSeriesCode: "B_2" })
      .expect(200);
    expect(
      (
        await owner
          .get(`/journal-entries/options?organizationId=${org}&transactionDate=2026-01-10`)
          .expect(200)
      ).body.defaultVoucherSeriesCode
    ).toBe("B_2");
    const entries = [];
    for (let index = 0; index < 20; index++) entries.push(await draft());
    const posted = await Promise.all(
      entries.map((entry) =>
        owner.post(`/journal-entries/${entry.id}/post`).send({ expectedVersion: entry.version })
      )
    );
    expect(posted.every((result) => result.status === 201)).toBe(true);
    expect(posted.map((result) => result.body.voucherNumber).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1)
    );
  });
  it("parallel series and organizations remain independent while another series is created", async () => {
    const localSeries = (
      await owner
        .post(`/organizations/${org}/voucher-series`)
        .send({ fiscalYearId: year, code: "PAR", name: "Parallel" })
        .expect(201)
    ).body.id;
    const foreign = (
      await owner
        .post("/onboarding")
        .send({
          setupKey: randomUUID(),
          name: "Independent numbering",
          startDate: "2026-01-01",
          endDate: "2026-12-31"
        })
        .expect(201)
    ).body;
    const foreignAccounts = await prisma.account.findMany({
      where: { organizationId: foreign.organization.id, accountNumber: { in: ["1930", "3000"] } },
      orderBy: { accountNumber: "asc" }
    });
    const foreignSeries = await prisma.voucherSeries.findFirstOrThrow({
      where: { organizationId: foreign.organization.id }
    });
    const entries = [
      await draft(),
      await draft(),
      await draft(localSeries),
      await draft(localSeries)
    ];
    for (let index = 0; index < 2; index++) {
      entries.push(
        (
          await owner
            .post("/journal-entries")
            .send({
              organizationId: foreign.organization.id,
              voucherSeriesId: foreignSeries.id,
              transactionDate: "2026-01-10",
              description: "Other organization",
              lines: [
                { accountId: foreignAccounts[0].id, debit: "1.01", credit: "0" },
                { accountId: foreignAccounts[1].id, debit: "0", credit: "1.01" }
              ]
            })
            .expect(201)
        ).body
      );
    }
    const results = await Promise.all([
      ...entries.map((entry) =>
        owner.post(`/journal-entries/${entry.id}/post`).send({ expectedVersion: entry.version })
      ),
      owner
        .post(`/organizations/${org}/voucher-series`)
        .send({ fiscalYearId: year, code: "NEW", name: "Created during posting" })
    ]);
    expect(results.map((result) => result.status)).toEqual(Array(7).fill(201));
    for (const [start, numbers] of [
      [0, [21, 22]],
      [2, [1, 2]],
      [4, [1, 2]]
    ] as const)
      expect(
        results
          .slice(start, start + 2)
          .map((result) => result.body.voucherNumber)
          .sort((left, right) => left - right)
      ).toEqual(numbers);
  });
  it("used code cannot change or be deleted, name and active status can change", async () => {
    await owner
      .patch(`/organizations/${org}/voucher-series/${series}`)
      .send({ code: "C" })
      .expect(409);
    await expect(prisma.voucherSeries.delete({ where: { id: series } })).rejects.toThrow();
    await owner
      .patch(`/organizations/${org}/voucher-series/${series}`)
      .send({ name: "Ny presentation" })
      .expect(200);
  });
  it("deactivation vs post either posts before deactivation or rejects without consuming a number", async () => {
    const entry = await draft();
    const before = await prisma.voucherSeries.findUniqueOrThrow({ where: { id: series } });
    const results = await Promise.all([
      owner.post(`/journal-entries/${entry.id}/post`).send({ expectedVersion: entry.version }),
      owner.patch(`/organizations/${org}/voucher-series/${series}`).send({ isActive: false })
    ]);
    expect(results[1].status).toBe(200);
    expect([201, 409]).toContain(results[0].status);
    if (results[0].status === 409) expect(results[0].body.code).toBe("VOUCHER_SERIES_INACTIVE");
    const after = await prisma.voucherSeries.findUniqueOrThrow({ where: { id: series } });
    expect(after.nextVoucherNumber).toBe(
      before.nextVoucherNumber + (results[0].status === 201 ? 1 : 0)
    );
    await owner
      .post(`/journal-entries/${entry.id}/post`)
      .send({ expectedVersion: entry.version })
      .expect(409);
  });
  it("the same series code starts at 1 in a new fiscal year", async () => {
    const nextYear = (
      await owner
        .post("/fiscal-years")
        .send({ organizationId: org, name: "2027", startDate: "2027-01-01", endDate: "2027-12-31" })
        .expect(201)
    ).body;
    expect(
      (
        await owner
          .post(`/organizations/${org}/voucher-series`)
          .send({ fiscalYearId: nextYear.id, code: "B_2", name: "Next year" })
          .expect(201)
      ).body.nextVoucherNumber
    ).toBe(1);
  });
});
