import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AuditModule } from "./audit.module";
import { DatabaseService } from "../database/database.service";
import { JournalEntriesAccessService } from "../journal-entries/journal-entries-access.service";
import { configureHttpApp } from "../http/app-setup";

describe("audit HTTP read-only surface", () => {
  let app: INestApplication;
  const organizationId = "78a7b8ad-a4c6-4ab3-9f05-366ca03d2b84";
  const eventId = "d0301fba-2f52-42db-918a-db49b025cf30";
  const findMany = jest
    .fn()
    .mockResolvedValue([{ id: eventId, createdAt: new Date(), action: "POST", metadata: {} }]);
  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [AuditModule] })
      .overrideProvider(DatabaseService)
      .useValue({ prisma: { auditEvent: { findMany } } })
      .overrideProvider(JournalEntriesAccessService)
      .useValue({
        requireMembership: jest.fn().mockResolvedValue({ organizationId, role: "OWNER" })
      })
      .compile();
    app = fixture.createNestApplication();
    configureHttpApp(app);
    // Simulate an already authenticated owner; exercise real routes, query
    // validation and organization guard. Full authentication is covered by the
    // PostgreSQL integration suite.
    app.use((req: { auth?: { id: string } }, _res: unknown, next: () => void) => {
      req.auth = { id: eventId };
      next();
    });
    await app.init();
  });
  afterAll(async () => app?.close());
  it("reads accounting history but exposes no mutation routes", async () => {
    const result = await request(app.getHttpServer())
      .get("/audit-events")
      .query({ organizationId })
      .expect(200);
    expect(result.body.events[0].id).toBe(eventId);
    await request(app.getHttpServer()).post("/audit-events").send({ organizationId }).expect(404);
    await request(app.getHttpServer())
      .put(`/audit-events/${eventId}`)
      .send({ metadata: { changed: true } })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/audit-events/${eventId}`)
      .send({ action: "DELETE" })
      .expect(404);
    await request(app.getHttpServer()).delete(`/audit-events/${eventId}`).expect(404);
    const after = await request(app.getHttpServer())
      .get("/audit-events")
      .query({ organizationId })
      .expect(200);
    expect(after.body.events).toEqual(result.body.events);
  });
});
