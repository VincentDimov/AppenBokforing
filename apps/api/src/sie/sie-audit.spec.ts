import type { DatabaseService } from "../database/database.service";
import { SieService } from "./sie.service";

describe("SIE processing history", () => {
  const content = "#SIETYP 4\n#RAR 0 20260101 20261231\n";
  it("rejects confirmed import into a closed year before any accounting writes", async () => {
    const create = jest.fn();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ status: "CLOSED" }]),
      account: { create }
    };
    const service = new SieService({
      prisma: {
        fiscalYear: { findFirst: jest.fn().mockResolvedValue({ id: "year" }) },
        $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx)
      }
    } as unknown as DatabaseService);
    const mapping = { fiscalYearId: "year" };
    const preview = await service.import("organization", content, false, undefined, undefined, mapping);
    await expect(service.import("organization", content, true, undefined, undefined, { ...mapping, previewToken: (preview as { previewToken: string }).previewToken })).rejects.toThrow("closed");
    expect(create).not.toHaveBeenCalled();
  });
  it("keeps preview free of all database writes", async () => {
    const transaction = jest.fn();
    const service = new SieService({
      prisma: { $transaction: transaction }
    } as unknown as DatabaseService);
    expect(await service.import("organization", content, false, "actor", "request")).toMatchObject({
      mode: "PREVIEW"
    });
    expect(transaction).not.toHaveBeenCalled();
  });
  it("records a successful confirmed import inside its accounting transaction", async () => {
    const create = jest.fn().mockResolvedValue({});
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ status: "OPEN" }]),
      account: { findMany: jest.fn().mockResolvedValue([]) },
      fiscalYear: { findFirst: jest.fn().mockResolvedValue({ id: "year" }) },
      openingBalance: { findMany: jest.fn().mockResolvedValue([]) },
      accountingPeriod: { findMany: jest.fn().mockResolvedValue([]) },
      auditEvent: { create }
    };
    const transaction = jest.fn(async (callback: (client: typeof tx) => Promise<void>) =>
      callback(tx)
    );
    const service = new SieService({
      prisma: {
        fiscalYear: { findFirst: jest.fn().mockResolvedValue({ id: "year" }) },
        $transaction: transaction
      }
    } as unknown as DatabaseService);
    const mapping = { fiscalYearId: "year" };
    const preview = await service.import("organization", content, false, "actor", "request", mapping);
    await service.import("organization", content, true, "actor", "request", { ...mapping, previewToken: (preview as { previewToken: string }).previewToken });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "organization",
        actorUserId: "actor",
        requestId: "request",
        action: "IMPORT",
        entityType: "SIE_IMPORT",
        metadata: expect.objectContaining({
          fiscalYearId: "year",
          vouchers: 0,
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
        })
      })
    });
  });
});
