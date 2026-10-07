/* eslint-disable no-undef */
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
function assertLocalStack(env) {
  const database = new URL(env.E2E_DATABASE_URL || "invalid:");
  if (
    !localHosts.has(database.hostname) ||
    database.pathname !== "/ledgerapp_e2e" ||
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    database.searchParams.has("host")
  ) {
    throw new Error("E2E mutations require a loopback PostgreSQL database named ledgerapp_e2e.");
  }
  for (const value of [
    env.E2E_BASE_URL || "http://127.0.0.1:4310",
    env.E2E_API_URL || "http://127.0.0.1:4410"
  ]) {
    const url = new URL(value);
    if (
      !localHosts.has(url.hostname) ||
      url.protocol !== "http:" ||
      url.pathname !== "/" ||
      url.username ||
      url.password
    ) {
      throw new Error(
        "Mutation E2E only supports dedicated local HTTP servers; use test:e2e:smoke for deployed URLs."
      );
    }
  }
}
module.exports = { assertLocalStack };
