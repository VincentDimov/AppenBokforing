import { AuditService, AuditQueryDto } from "./audit.module";
import type { DatabaseService } from "../database/database.service";

describe("processing history query", () => {
  const findMany = jest.fn();
  const service = new AuditService({
    prisma: { auditEvent: { findMany } }
  } as unknown as DatabaseService);
  beforeEach(() => findMany.mockReset());
  it("scopes filters to the authorized tenant and uses an inclusive end date", async () => {
    findMany.mockResolvedValue([{ id: "event", createdAt: new Date("2026-10-05T12:00:00Z") }]);
    const query = Object.assign(new AuditQueryDto(), {
      organizationId: "untrusted-tenant",
      fromDate: "2026-10-01",
      toDate: "2026-10-05",
      user: "actor",
      action: "POST",
      entityType: "JOURNAL_ENTRY"
    });
    const result = await service.list("authorized-tenant", query);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: "authorized-tenant",
          actorUserId: "actor",
          action: "POST",
          entityType: "JOURNAL_ENTRY",
          createdAt: { gte: new Date("2026-10-01T00:00:00Z"), lt: new Date("2026-10-06T00:00:00Z") }
        },
        take: 51
      })
    );
    expect(result.events[0]).toMatchObject({ timestamp: new Date("2026-10-05T12:00:00Z") });
  });
  it("rejects impossible calendar dates and reversed intervals before database access", async () => {
    await expect(
      service.list("tenant", Object.assign(new AuditQueryDto(), { fromDate: "2026-02-30" }))
    ).rejects.toThrow("Invalid calendar date");
    await expect(
      service.list(
        "tenant",
        Object.assign(new AuditQueryDto(), { fromDate: "2026-10-05", toDate: "2026-10-01" })
      )
    ).rejects.toThrow("fromDate");
    expect(findMany).not.toHaveBeenCalled();
  });
  it("bounds each response to 50 events", async () => {
    findMany.mockResolvedValue(
      Array.from({ length: 51 }, (_, id) => ({ id, createdAt: new Date() }))
    );
    const result = await service.list("tenant", Object.assign(new AuditQueryDto(), { page: 2 }));
    expect(result.events).toHaveLength(50);
    expect(result.hasMore).toBe(true);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 50 }));
  });
});
