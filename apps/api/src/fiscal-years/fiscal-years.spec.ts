import { ConflictException } from "@nestjs/common";
import { Prisma } from "@ledgerapp/db";
import type { DatabaseService } from "../database/database.service";
import { requireOpenCalendar } from "./accounting-calendar";
import { FiscalYearsService, monthlyPeriods } from "./fiscal-years.service";

describe("fiscal calendar rules", () => {
  it("creates calendar months including partial boundaries and leap day", () => {
    const periods = monthlyPeriods("2024-02-15", "2024-04-03");
    expect(
      periods.map((p) => [
        p.periodNumber,
        p.startDate.toISOString().slice(0, 10),
        p.endDate.toISOString().slice(0, 10)
      ])
    ).toEqual([
      [1, "2024-02-15", "2024-02-29"],
      [2, "2024-03-01", "2024-03-31"],
      [3, "2024-04-01", "2024-04-03"]
    ]);
  });
  it("rejects malformed dates, reversed ranges and excessive length", () => {
    for (const range of [
      ["2026-02-30", "2026-12-31"],
      ["2026-12-31", "2026-01-01"],
      ["2026-01-01T00:00:00Z", "2026-12-31"],
      ["2024-01-01", "2026-12-31"]
    ])
      expect(() => monthlyPeriods(range[0]!, range[1]!)).toThrow();
  });
  it("locks the year before the period and rejects locked periods", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ status: "OPEN" }])
      .mockResolvedValueOnce([{ status: "LOCKED" }]);
    await expect(
      requireOpenCalendar(
        { $queryRaw: query } as unknown as Prisma.TransactionClient,
        "org",
        "year",
        "period"
      )
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls[0]![0].join(" ")).toContain("fiscal_years");
    expect(query.mock.calls[1]![0].join(" ")).toContain("accounting_periods");
  });
  it("rejects closed years before acquiring a period or writing", async () => {
    const query = jest.fn().mockResolvedValue([{ status: "CLOSED" }]);
    await expect(
      requireOpenCalendar(
        { $queryRaw: query } as unknown as Prisma.TransactionClient,
        "org",
        "year",
        "period"
      )
    ).rejects.toThrow("closed");
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("requires locked periods and no drafts before closing", async () => {
    const update = jest.fn();
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: "OPEN" }])
        .mockResolvedValueOnce([{ status: "OPEN" }]),
      fiscalYear: { update },
      journalEntry: { count: jest.fn().mockResolvedValue(0) }
    };
    const service = new FiscalYearsService({
      prisma: { $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx) }
    } as unknown as DatabaseService);
    await expect(service.close("org", "year", "actor")).rejects.toThrow("All periods");
    expect(update).not.toHaveBeenCalled();
    tx.$queryRaw
      .mockResolvedValueOnce([{ status: "OPEN" }])
      .mockResolvedValueOnce([{ status: "LOCKED" }]);
    tx.journalEntry.count.mockResolvedValueOnce(1);
    await expect(service.close("org", "year", "actor")).rejects.toThrow("draft");
    expect(update).not.toHaveBeenCalled();
  });
});
