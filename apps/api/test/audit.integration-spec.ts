import { randomUUID } from "node:crypto";
import { prisma } from "@ledgerapp/db";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http/app-setup";

jest.setTimeout(30000);
describe("immutable organization audit history", () => {
  let app: INestApplication;
  let owner: ReturnType<typeof request.agent>;
  let outsider: ReturnType<typeof request.agent>;
  let organizationId: string;
  let eventId: string;
  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = fixture.createNestApplication();
    configureHttpApp(app);
    await app.init();
    owner = request.agent(app.getHttpServer());
    outsider = request.agent(app.getHttpServer());
    for (const agent of [owner, outsider])
      await agent
        .post("/auth/register")
        .send({
          displayName: "Audit tester",
          email: `${randomUUID()}@example.test`,
          password: "Audit-test-long-password-2026!"
        })
        .expect(201);
    const organization = await owner
      .post("/organizations")
      .send({ name: "Audit organization", slug: `audit-${randomUUID()}` })
      .expect(201);
    organizationId = organization.body.id;
    const event = await prisma.auditEvent.create({
      data: {
        organizationId,
        action: "POST",
        entityType: "JOURNAL_ENTRY",
        entityId: randomUUID(),
        metadata: { fixture: true }
      }
    });
    eventId = event.id;
  });
  afterAll(async () => {
    await app?.close();
  });
  it("requires authentication and organization membership", async () => {
    await request(app.getHttpServer()).get("/audit-events").query({ organizationId }).expect(401);
    await outsider.get("/audit-events").query({ organizationId }).expect(404);
    const result = await owner
      .get("/audit-events")
      .query({ organizationId, action: "POST", entityType: "JOURNAL_ENTRY" })
      .expect(200);
    expect(result.body.events).toContainEqual(
      expect.objectContaining({
        id: eventId,
        timestamp: expect.any(String),
        requestId: expect.any(String)
      })
    );
  });
  it("exposes no application API for inserting, editing or deleting audit events", async () => {
    const before = await prisma.auditEvent.findUniqueOrThrow({ where: { id: eventId } });
    await owner.post("/audit-events").send({ organizationId, action: "DELETE" }).expect(404);
    await owner
      .patch(`/audit-events/${eventId}`)
      .send({ metadata: { altered: true } })
      .expect(404);
    await owner.put(`/audit-events/${eventId}`).send({ action: "DELETE" }).expect(404);
    await owner.delete(`/audit-events/${eventId}`).expect(404);
    expect(await prisma.auditEvent.findUniqueOrThrow({ where: { id: eventId } })).toEqual(before);
  });
  it("also prevents mutation directly at the database boundary", async () => {
    await expect(
      prisma.auditEvent.update({ where: { id: eventId }, data: { metadata: { altered: true } } })
    ).rejects.toThrow();
    await expect(prisma.auditEvent.delete({ where: { id: eventId } })).rejects.toThrow();
  });
  it("records fiscal year and period state changes", async () => {
    const year = await prisma.fiscalYear.create({
      data: {
        organizationId,
        name: "Audit fixture year",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31")
      }
    });
    const period = await prisma.accountingPeriod.create({
      data: {
        organizationId,
        fiscalYearId: year.id,
        periodNumber: 1,
        startDate: year.startDate,
        endDate: year.endDate
      }
    });
    await prisma.accountingPeriod.update({ where: { id: period.id }, data: { status: "LOCKED" } });
    await prisma.accountingPeriod.update({ where: { id: period.id }, data: { status: "OPEN" } });
    expect(
      await prisma.auditEvent.count({
        where: { organizationId, entityId: year.id, action: "CREATE" }
      })
    ).toBe(1);
    expect(
      await prisma.auditEvent.count({
        where: { organizationId, entityId: period.id, action: { in: ["LOCK", "UNLOCK"] } }
      })
    ).toBe(2);
  });
});
