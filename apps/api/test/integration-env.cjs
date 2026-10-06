if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL must point to an isolated PostgreSQL database before integration tests can run."
  );
}

let integrationUrl;
try {
  integrationUrl = new URL(process.env.TEST_DATABASE_URL);
} catch {
  throw new Error("TEST_DATABASE_URL must be a valid isolated PostgreSQL URL.");
}
if (
  !["postgres:", "postgresql:"].includes(integrationUrl.protocol) ||
  !["localhost", "127.0.0.1", "[::1]"].includes(integrationUrl.hostname) ||
  integrationUrl.pathname !== "/ledgerapp_test"
) {
  throw new Error(
    "Integration tests require a loopback PostgreSQL host and database ledgerapp_test; development/production URLs are forbidden."
  );
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = "test";
process.env.ARGON2_MEMORY_COST = "8192";
process.env.ARGON2_TIME_COST = "2";
process.env.JWT_ACCESS_SECRET ??=
  "integration-test-access-secret-with-at-least-thirty-two-characters";
process.env.JWT_REFRESH_SECRET ??=
  "integration-test-refresh-secret-with-at-least-thirty-two-characters";
process.env.WEB_ORIGIN ??= "http://localhost:3000";
