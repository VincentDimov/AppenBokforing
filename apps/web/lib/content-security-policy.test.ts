import { contentSecurityPolicy } from "./content-security-policy";

describe("Content Security Policy", () => {
  it("allows Next.js development bundles to hydrate", () => {
    expect(contentSecurityPolicy("development")).toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    );
  });

  it.each(["production", "test", "preview", undefined])(
    "never allows eval outside explicit development (%s)",
    (environment) => {
      expect(contentSecurityPolicy(environment)).not.toContain("'unsafe-eval'");
    }
  );

  it("preserves the existing production policy exactly", () => {
    expect(contentSecurityPolicy("production")).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    );
  });
});
