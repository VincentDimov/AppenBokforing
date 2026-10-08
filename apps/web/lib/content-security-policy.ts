export function contentSecurityPolicy(environment: string | undefined): string {
  // Next.js development bundles require eval for source maps/debugging.
  // Never enable this exception for production, tests or an unknown environment.
  const developmentScripts = environment === "development" ? " 'unsafe-eval'" : "";

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${developmentScripts}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; ");
}
