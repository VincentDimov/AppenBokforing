import { assertProductionSettings, securityPolicy } from "./security-policy";
import type { PolicyRequest, PolicyResponse } from "./security-policy";
describe("production configuration / browser origin policy", () => {
  it("requires Origin for production cookie writes and keeps error logs free of cookies", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const req = {
        method: "POST",
        path: "/journal-entries",
        headers: { cookie: "sensitive-cookie" },
        header: (key: string) => (key === "cookie" ? "sensitive-cookie" : undefined)
      } as PolicyRequest;
      const json = jest.fn(),
        next = jest.fn();
      const res = {
        once: jest.fn(),
        setHeader: jest.fn(),
        status: jest.fn().mockReturnValue({ json })
      } as unknown as PolicyResponse;
      securityPolicy(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(JSON.stringify(json.mock.calls)).not.toContain("sensitive-cookie");
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
  it("rejects known deployment placeholders without disclosing their values", () => {
    expect(() =>
      assertProductionSettings({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://local-development"
      })
    ).toThrow("DATABASE_URL");
    expect(() => assertProductionSettings({ NODE_ENV: "development" })).not.toThrow();
  });
  it.each([
    [{ origin: "https://evil.example", cookie: "session=hidden" }, false],
    [{ origin: "null" }, false],
    [{ origin: "http://localhost:3000", "sec-fetch-site": "cross-site" }, false],
    [{ origin: "http://localhost:3000" }, true],
    [{}, true]
  ])("validates exact origins and fetch metadata before writes: %j", (headers, allowed) => {
    const req = {
      method: "POST",
      headers: { ...headers },
      header: (key: string) => (headers as Record<string, string>)[key]
    } as PolicyRequest;
    const json = jest.fn();
    const next = jest.fn();
    const res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnValue({ json })
    } as unknown as PolicyResponse;
    securityPolicy(req, res, next);
    expect(next).toHaveBeenCalledTimes(allowed ? 1 : 0);
    expect(json).toHaveBeenCalledTimes(allowed ? 0 : 1);
  });
});
