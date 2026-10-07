import type { ArgumentsHost } from "@nestjs/common";
import { ProductionExceptionFilter } from "./production-exception.filter";

it("redacts unexpected production database/token errors from response and logs", () => {
  const json = jest.fn();
  const log = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { "x-request-id": "request-123" } }),
      getResponse: () => ({ status: () => ({ json }) })
    })
  } as unknown as ArgumentsHost;
  try {
    new ProductionExceptionFilter().catch(new Error("SQL user=secret token=secret"), host);
    expect(json).toHaveBeenCalledWith({
      message: "Internal server error",
      requestId: "request-123"
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
    expect(JSON.stringify(log.mock.calls)).toContain("request-123");
  } finally {
    log.mockRestore();
  }
});
