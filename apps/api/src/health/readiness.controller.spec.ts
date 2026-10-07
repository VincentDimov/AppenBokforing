import { ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { DatabaseService } from "../database/database.service";
import { ReadinessController } from "./readiness.controller";
const send = jest.fn(),
  destroy = jest.fn();
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: (...args: unknown[]) => send(...args),
    destroy: () => destroy()
  })),
  HeadBucketCommand: jest.fn()
}));
describe("bounded public readiness", () => {
  beforeEach(() => {
    send.mockResolvedValue({});
    destroy.mockClear();
  });
  it("requires both dependencies and closes the storage client", async () => {
    const db = { prisma: { $queryRaw: jest.fn().mockResolvedValue([{ ok: 1 }]) } };
    await expect(
      new ReadinessController(db as unknown as DatabaseService, new ConfigService()).ready()
    ).resolves.toEqual({ status: "ready" });
    expect(destroy).toHaveBeenCalledTimes(1);
  });
  it.each(["database", "storage"])(
    "does not disclose %s details on failure",
    async (dependency) => {
      const query = jest.fn().mockResolvedValue([]);
      if (dependency === "database")
        query.mockRejectedValue(new Error("private-database-password"));
      else send.mockRejectedValue(new Error("private-signed-url"));
      const controller = new ReadinessController(
        { prisma: { $queryRaw: query } } as unknown as DatabaseService,
        new ConfigService()
      );
      try {
        await controller.ready();
        throw new Error("Expected unavailable");
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceUnavailableException);
        expect((error as ServiceUnavailableException).getResponse()).toEqual({
          status: "unavailable"
        });
        expect(destroy).toHaveBeenCalledTimes(1);
      }
    }
  );
  it("bounds a hanging dependency and returns only a redacted unavailable response", async () => {
    jest.useFakeTimers();
    try {
      const db = { prisma: { $queryRaw: jest.fn(() => new Promise(() => {})) } };
      const result = new ReadinessController(db as unknown as DatabaseService, new ConfigService())
        .ready()
        .catch((error: ServiceUnavailableException) => error);
      await jest.advanceTimersByTimeAsync(2501);
      const failure = await result;
      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      expect((failure as ServiceUnavailableException).getResponse()).toEqual({
        status: "unavailable"
      });
      expect(destroy).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
