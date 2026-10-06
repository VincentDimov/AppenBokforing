import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

const setup = readFileSync(resolve(process.cwd(), "test/integration-env.cjs"), "utf8");
function run(url?: string) {
  const env: Record<string, string | undefined> = {
    TEST_DATABASE_URL: url,
    DATABASE_URL: "postgresql://do-not-use/production"
  };
  runInNewContext(setup, { process: { env }, URL });
  return env;
}
describe("isolated integration database safety", () => {
  it.each([
    undefined,
    "invalid",
    "https://localhost/ledgerapp_test",
    "postgresql://localhost/ledgerapp",
    "postgresql://localhost/production",
    "postgresql://db.example.com/ledgerapp_test"
  ])("fails closed for %s", (url) => {
    expect(() => run(url)).toThrow(/TEST_DATABASE_URL|Integration tests/);
  });
  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "accepts only local ledgerapp_test on %s",
    (host) => {
      const url = `postgresql://test:test@${host}:15432/ledgerapp_test?schema=public`;
      expect(run(url)).toMatchObject({ DATABASE_URL: url, NODE_ENV: "test" });
    }
  );
});
