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
    await prisma.accountingPeriod.update({ where: { id: period.id }, data: { status: "OPEN" } });
    expect(
      await prisma.auditEvent.count({
        where: { organizationId, entityId: period.id, entityType: "ACCOUNTING_PERIOD" }
      })
    ).toBe(2);
  });

  it("audits membership inserts and role changes without reading calendar-only fields", async () => {
    const actor = await prisma.organizationMember.findFirstOrThrow({
      where: { organizationId, role: "OWNER" }
    });
    const user = await prisma.user.create({
      data: { email: `${randomUUID()}@example.test`, displayName: "Membership audit fixture" }
    });
    const requestId = randomUUID();
    const member = await prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT set_config('ledgerapp.actor_user_id', ${actor.userId}, true)`;
      await transaction.$executeRaw`SELECT set_config('ledgerapp.request_id', ${requestId}, true)`;
      const created = await transaction.organizationMember.create({
        data: { organizationId, userId: user.id, role: "READ_ONLY" }
      });
      await transaction.organizationMember.update({
        where: { id: created.id },
        data: { role: "ACCOUNTANT" }
      });
      await transaction.organizationMember.update({
        where: { id: created.id },
        data: { role: "ACCOUNTANT" }
      });
      return created;
    });
    const events = await prisma.auditEvent.findMany({
      where: { organizationId, entityId: member.id, entityType: "ORGANIZATION_MEMBER" }
    });
    expect(events).toHaveLength(2);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "CREATE",
          actorUserId: actor.userId,
          requestId,
          metadata: { userId: user.id, role: "READ_ONLY", event: "USER_ADDED" }
        }),
        expect.objectContaining({
          action: "UPDATE",
          actorUserId: actor.userId,
          requestId,
          metadata: {
            userId: user.id,
            previousRole: "READ_ONLY",
            role: "ACCOUNTANT",
            event: "PERMISSIONS_CHANGED"
          }
        })
      ])
    );
    expect(await prisma.organizationMember.findUniqueOrThrow({ where: { id: member.id } })).toEqual(
      expect.objectContaining({ role: "ACCOUNTANT" })
    );
  });

  it("rolls back the membership write and its audit event together", async () => {
    const user = await prisma.user.create({
      data: { email: `${randomUUID()}@example.test`, displayName: "Rollback audit fixture" }
    });
    const memberId = randomUUID();
    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.organizationMember.create({
          data: { id: memberId, organizationId, userId: user.id, role: "MEMBER" }
        });
        throw new Error("deliberate fixture rollback");
      })
    ).rejects.toThrow("deliberate fixture rollback");
    expect(await prisma.organizationMember.findUnique({ where: { id: memberId } })).toBeNull();
    expect(await prisma.auditEvent.count({ where: { organizationId, entityId: memberId } })).toBe(
      0
    );
  });
});
