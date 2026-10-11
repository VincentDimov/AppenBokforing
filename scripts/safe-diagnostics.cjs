/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
// Diagnostics are allow-listed. Never print SQL parameters, row data or raw errors.
const { createHash } = require("node:crypto");
function redact(value, env = process.env) {
  let text = String(value);
  for (const [key, secret] of Object.entries(env)) {
    if (/secret|password|token|cookie|database_url|access_key/i.test(key) && secret)
      text = text.split(secret).join("[REDACTED]");
  }
  return text
    .replace(/\b(?:postgres(?:ql)?|https?|s3):\/\/[^\s"'<>]+/gi, "[URL REDACTED]")
    .replace(/\b(?:authorization|cookie|set-cookie)\s*[:=][^\r\n]+/gi, "[HEADER REDACTED]")
    .replace(
      /\b(?:password|secret|token|access_key(?:_id)?)\s*[:=]\s*[^\s,;]+/gi,
      "[SECRET REDACTED]"
    )
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[TOKEN REDACTED]");
}
function fingerprint(value) {
  return createHash("sha256")
    .update(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? String(v) : v)))
    .digest("hex");
}
function diagnostics(error, context = {}) {
  const raw = [error?.message, error?.stdout, error?.stderr, error?.meta?.message].join("\n");
  const sqlstate =
    String(error?.meta?.code ?? "").match(/^[0-9A-Z]{5}$/)?.[0] ??
    raw.match(/(?:SQLSTATE|Database error code|Code:)\s*[:=]?\s*[`"']?([0-9A-Z]{5})/)?.[1];
  const migration = raw.match(
    /(?:Migration name:\s*|Applying migration\s+[`'"])(\d{14}_[a-z0-9_]+)/
  )?.[1];
  const constraint = raw.match(/constraint ["']([a-z0-9_]+)["']/i)?.[1];
  return {
    ...context,
    category: error?.name ?? "UnknownError",
    code: /^P\d{4}$|^ERR_[A-Z_]+$|^ENOENT$/.test(error?.code ?? "") ? error.code : undefined,
    sqlstate,
    migration,
    constraint,
    reason: /cached plan must not change result type/i.test(raw)
      ? "CACHED_PLAN_RESULT_TYPE_CHANGED"
      : undefined,
    // Only file/line frames, not the first line or arbitrary exception content.
    frames: redact(error?.stack ?? "")
      .split("\n")
      .filter((line) => /^\s+at /.test(line))
      .slice(0, 6),
    rawErrorOmitted: true
  };
}
module.exports = { redact, fingerprint, diagnostics };
