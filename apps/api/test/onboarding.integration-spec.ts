import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@ledgerapp/db";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http/app-setup";

describe("atomic onboarding", () => {
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let outsider: ReturnType<typeof request.agent>;
  const payload = {
    setupKey: randomUUID(),
    name: "Min nya arbetsyta",
    organizationNumber: "559999-0001",
    startDate: "2026-01-01",
    endDate: "2026-12-31"
  };
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    configureHttpApp(app);
    await app.init();
    agent = request.agent(app.getHttpServer());
    outsider = request.agent(app.getHttpServer());
    for (const client of [agent, outsider])
      await client
        .post("/auth/register")
        .send({
          email: `${randomUUID()}@example.test`,
          displayName: "Ny användare",
          password: "A-long-test-password-2026!"
        })
        .expect(201);
  });
  afterAll(async () => {
    await app?.close();
  });
  it("requires authentication", async () => {
    await request(app.getHttpServer()).post("/onboarding").send(payload).expect(401);
  });
  it("starts with no organizations", async () => {
    expect((await agent.get("/organizations").expect(200)).body).toEqual([]);
  });
  it("creates owner, complete calendar, own chart and series atomically, including concurrent retries", async () => {
    const results = await Promise.all([
      agent.post("/onboarding").send(payload),
      agent.post("/onboarding").send(payload)
    ]);
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    const id = results[0].body.organization.id;
    expect(results[1].body.organization.id).toBe(id);
    expect(await prisma.account.count({ where: { organizationId: id } })).toBe(6);
    expect(await prisma.accountingPeriod.count({ where: { organizationId: id } })).toBe(12);
    expect(await prisma.voucherSeries.findFirst({ where: { organizationId: id } })).toMatchObject({
      code: "A",
      nextVoucherNumber: 1
    });
    expect((await agent.get("/organizations")).body).toEqual([
      expect.objectContaining({ id, role: "OWNER", organizationNumber: "5599990001" })
    ]);
    await outsider.post("/onboarding").send(payload).expect(404);
    await agent
      .patch(`/organizations/${id}`)
      .send({ address: "Testgatan 1, Stockholm" })
      .expect(200);
    const changed = await prisma.auditEvent.findFirst({
      where: { organizationId: id, entityType: "ORGANIZATION", action: "UPDATE" },
      orderBy: { createdAt: "desc" }
    });
    expect(changed?.afterData).toMatchObject({
      address: "Testgatan 1, Stockholm",
      countryCode: "SE",
      defaultCurrency: "SEK",
      defaultVoucherSeriesCode: "A"
    });
    await outsider.patch(`/organizations/${id}`).send({ address: "Intrång" }).expect(404);
  });
  it("allows independent tenants using the same company number", async () => {
    await outsider
      .post("/onboarding")
      .send({ ...payload, setupKey: randomUUID() })
      .expect(201);
  });
  it("rejects bad dates, currencies and identifiers without partial organization creation", async () => {
    const before = await prisma.organization.count();
    for (const changes of [
      { endDate: "2025-01-01" },
      { organizationNumber: "bad" },
      { defaultCurrency: "EUR" }
    ])
      await agent
        .post("/onboarding")
        .send({ ...payload, setupKey: randomUUID(), ...changes })
        .expect(400);
    expect(await prisma.organization.count()).toBe(before);
  });
});
