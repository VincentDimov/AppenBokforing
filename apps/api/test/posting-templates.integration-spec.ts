import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@ledgerapp/db";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http/app-setup";
describe("posting template tenant and snapshot contract", () => {
  let app: INestApplication,
    owner: ReturnType<typeof request.agent>,
    outsider: ReturnType<typeof request.agent>;
  let org: string,
    foreign: string,
    actor: string,
    series: string,
    accounts: string[],
    template: string;
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureHttpApp(app);
    await app.init();
    owner = request.agent(app.getHttpServer());
    outsider = request.agent(app.getHttpServer());
    for (const client of [owner, outsider]) {
      const user = (
        await client
          .post("/auth/register")
          .send({
            email: `${randomUUID()}@example.test`,
            displayName: "Mallägare",
            password: "A-long-test-password-2026!"
          })
          .expect(201)
      ).body;
      const fixture = (
        await client
          .post("/onboarding")
          .send({
            setupKey: randomUUID(),
            name: "Mallbolag",
            startDate: "2026-01-01",
            endDate: "2026-12-31"
          })
          .expect(201)
      ).body;
      if (client === owner) {
        org = fixture.organization.id;
        actor = user.user.id;
      } else foreign = fixture.organization.id;
    }
    accounts = (
      await prisma.account.findMany({
        where: { organizationId: org, accountNumber: { in: ["1930", "3000"] } },
        orderBy: { accountNumber: "asc" }
      })
    ).map((account) => account.id);
    series = (await prisma.voucherSeries.findFirstOrThrow({ where: { organizationId: org } })).id;
  });
  afterAll(async () => {
    await app?.close();
  });
  const input = () => ({
    code: "BANK",
    name: "Bankmall",
    defaultText: "Återkommande",
    voucherSeriesCode: "A",
    lines: [
      { accountId: accounts[0], side: "DEBIT", amount: "10.01" },
      { accountId: accounts[1], side: "CREDIT", amount: "10.01" }
    ]
  });
  const base = () => `/organizations/${org}/posting-templates`;
  it("requires authentication and denies a foreign organization", async () => {
    await request(app.getHttpServer()).get(base()).expect(401);
    await outsider.get(base()).expect(404);
  });
  it("creates, searches, applies then edits and posts a normal draft", async () => {
    template = (await owner.post(base()).send(input()).expect(201)).body.id;
    expect((await owner.get(`${base()}?search=bank`).expect(200)).body).toHaveLength(1);
    const applied = (await owner.post(`${base()}/${template}/apply`).expect(201)).body;
    expect(applied.lines[0].debit).toBe("10.01");
    const lines = applied.lines.map(
      (line: { account: { id: string }; debit: string; credit: string }) => ({
        accountId: line.account.id,
        debit: line.debit,
        credit: line.credit
      })
    );
    const draft = (
      await owner
        .post("/journal-entries")
        .send({
          organizationId: org,
          voucherSeriesId: series,
          transactionDate: "2026-01-10",
          description: applied.description,
          lines
        })
        .expect(201)
    ).body;
    const changed = (
      await owner
        .patch(`/journal-entries/${draft.id}`)
        .send({ expectedVersion: draft.version, description: "Redigerat förslag" })
        .expect(200)
    ).body;
    const posted = (
      await owner
        .post(`/journal-entries/${draft.id}/post`)
        .send({ expectedVersion: changed.version })
        .expect(201)
    ).body;
    await owner
      .patch(`${base()}/${template}`)
      .send({
        ...input(),
        name: "Ny mall",
        lines: input().lines.map((line) => ({ ...line, amount: "999.99" }))
      })
      .expect(200);
    expect((await owner.get(`/journal-entries/${posted.id}`)).body.lines[0].debit).toBe("10.01");
    expect(
      await prisma.auditEvent.count({
        where: { organizationId: org, entityType: "POSTING_TEMPLATE" }
      })
    ).toBe(2);
  });
  it("blocks foreign and inactive accounts and dimensions", async () => {
    const account = await prisma.account.findFirstOrThrow({ where: { organizationId: foreign } });
    await owner
      .post(base())
      .send({
        ...input(),
        code: "FOREIGN",
        lines: [{ ...input().lines[0], accountId: account.id }, input().lines[1]]
      })
      .expect(409);
    const dimension = await prisma.project.create({
      data: { organizationId: foreign, code: "FOREIGN", name: "Foreign" }
    });
    const center = await prisma.costCenter.create({
      data: { organizationId: foreign, code: "FOREIGN", name: "Foreign" }
    });
    for (const ref of [{ projectId: dimension.id }, { costCenterId: center.id }])
      await owner
        .post(base())
        .send({
          ...input(),
          code: "FOREIGN",
          lines: [{ ...input().lines[0], ...ref }, input().lines[1]]
        })
        .expect(409);
    await prisma.account.update({ where: { id: accounts[0] }, data: { isActive: false } });
    await owner.post(`${base()}/${template}/apply`).expect(409);
    await owner
      .post(base())
      .send({ ...input(), code: "INACTIVE" })
      .expect(409);
    await prisma.account.update({ where: { id: accounts[0] }, data: { isActive: true } });
  });
  it("deactivated selected template cannot be applied; read-only cannot mutate or apply", async () => {
    await owner
      .patch(`${base()}/${template}`)
      .send({ ...input(), isActive: false })
      .expect(200);
    await owner.post(`${base()}/${template}/apply`).expect(409);
    const reader = (await outsider.get("/auth/me")).body.user.id;
    await prisma.organizationMember.create({
      data: { organizationId: org, userId: reader, role: "READ_ONLY" }
    });
    await outsider.get(base()).expect(200);
    await outsider.post(base()).send(input()).expect(403);
    await outsider.post(`${base()}/${template}/apply`).expect(403);
    expect(actor).toBeDefined();
  });
  it("supports amount-free structures and rejects negative or fractional cents", async () => {
    const created = (
      await owner
        .post(base())
        .send({
          ...input(),
          code: "INPUT",
          lines: input().lines.map(({ amount: _amount, ...line }) => line)
        })
        .expect(201)
    ).body;
    expect((await owner.post(`${base()}/${created.id}/apply`)).body.lines[0].debit).toBe("");
    for (const amount of ["-1", "0.001", "1e2"])
      await owner
        .post(base())
        .send({
          ...input(),
          code: "BAD",
          lines: [{ ...input().lines[0], amount }, input().lines[1]]
        })
        .expect(400);
  });
});
