import { randomUUID } from "node:crypto";
export type PolicyRequest = {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  header(name: string): string | undefined;
};
export type PolicyResponse = {
  setHeader(name: string, value: string): unknown;
  once(event: string, listener: () => void): unknown;
  statusCode: number;
  status(code: number): { json(body: object): unknown };
};

export function allowedOrigins(): string[] {
  return (
    process.env.CORS_ORIGIN ??
    process.env.WEB_ORIGIN ??
    "http://localhost:3000,http://127.0.0.1:3000"
  )
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}
export function securityPolicy(req: PolicyRequest, res: PolicyResponse, next: () => void) {
  const supplied = req.header("x-request-id");
  const requestId = supplied && /^[A-Za-z0-9_.-]{1,100}$/.test(supplied) ? supplied : randomUUID();
  req.headers["x-request-id"] = requestId;
  res.setHeader("X-Request-Id", requestId);
  if (process.env.NODE_ENV === "production") {
    const started = Date.now();
    res.once("finish", () =>
      process.stdout.write(
        JSON.stringify({
          event: "http",
          requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Date.now() - started
        }) + "\n"
      )
    );
  }
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.header("origin"),
    site = req.header("sec-fetch-site");
  // Cookie-less server/Bearer clients may omit Origin. Browsers and every
  // cookie-authenticated mutation must prove a trusted origin in production.
  const requiresOrigin =
    process.env.NODE_ENV === "production" &&
    (Boolean(req.header("cookie")) ||
      ["same-origin", "same-site", "cross-site"].includes(site ?? ""));
  if (
    (origin && !allowedOrigins().includes(origin)) ||
    origin === "null" ||
    site === "cross-site" ||
    (requiresOrigin && !origin)
  ) {
    res
      .status(403)
      .json({
        code: "UNTRUSTED_ORIGIN",
        message: "A trusted browser origin is required.",
        requestId
      });
    return;
  }
  return next();
}
export function assertProductionSettings(env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV !== "production") return;
  const invalid = (value: string | undefined) =>
    !value ||
    /local[_-]|development|example|placeholder|change[_-]?me|change-before|disposable|^minioadmin$|^password$/i.test(
      value
    );
  for (const key of [
    "DATABASE_URL",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_BUCKET"
  ])
    if (invalid(env[key]))
      throw new Error(`${key} must use non-placeholder production configuration.`);
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET)
    throw new Error("JWT keys must be independent.");
  for (const key of ["S3_ENDPOINT", "S3_PUBLIC_ENDPOINT"]) {
    const value = env[key] ?? (key === "S3_PUBLIC_ENDPOINT" ? env.S3_ENDPOINT : undefined);
    if (!value || new URL(value).protocol !== "https:")
      throw new Error(`${key} requires HTTPS in production.`);
  }
  const origins = (env.CORS_ORIGIN ?? env.WEB_ORIGIN ?? "").split(",");
  if (
    !origins.length ||
    origins.some((o) => {
      try {
        const u = new URL(o.trim());
        return u.protocol !== "https:" || u.origin !== o.trim();
      } catch {
        return true;
      }
    })
  )
    throw new Error("Production requires explicit HTTPS browser origins.");
}
