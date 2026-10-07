import { ConfigService } from "@nestjs/config";
import { AuthSettingsService } from "./auth-settings.service";

const values = {
  NODE_ENV: "production",
  JWT_ACCESS_SECRET: "a".repeat(64),
  JWT_REFRESH_SECRET: "b".repeat(64)
};
describe("production cookie and lifetime contract", () => {
  it("uses host-only HttpOnly Secure Lax cookies and bounded defaults", () => {
    const settings = new AuthSettingsService(new ConfigService(values));
    expect(settings.cookieOptions).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/"
    });
    expect(settings.accessCookieName).toBe("__Host-ledgerapp_access");
    expect(settings.refreshCookieName).toBe("__Host-ledgerapp_refresh");
    expect(settings.accessTokenTtlSeconds).toBe(900);
    expect(settings.refreshTokenTtlSeconds).toBe(604800);
    expect(settings.refreshAbsoluteTtlSeconds).toBe(2592000);
  });
  it.each([
    ["JWT_ACCESS_TTL_SECONDS", "901"],
    ["REFRESH_TOKEN_TTL_SECONDS", "604801"],
    ["REFRESH_TOKEN_ABSOLUTE_TTL_SECONDS", "2592001"]
  ])("rejects excessive production lifetime %s", (key, value) => {
    expect(() => new AuthSettingsService(new ConfigService({ ...values, [key]: value }))).toThrow(
      "lifetimes"
    );
  });
  it("retains non-Secure development cookies", () => {
    expect(
      new AuthSettingsService(new ConfigService({ ...values, NODE_ENV: "development" }))
        .cookieOptions.secure
    ).toBe(false);
  });
});
