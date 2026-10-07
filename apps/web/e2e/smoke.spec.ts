import { test, expect } from "@playwright/test";
for (const route of ["/", "/login", "/register"]) {
  test("public read-only page " + route, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(route);
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveTitle(/LedgerApp/);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error/);
    expect(errors).toEqual([]);
    const headers = response!.headers();
    console.log(
      route,
      Object.fromEntries(
        [
          "content-security-policy",
          "x-content-type-options",
          "x-frame-options",
          "referrer-policy"
        ].map((key) => [key, headers[key] || "ABSENT"])
      )
    );
  });
}
test("public Next rewrite reaches Nest health", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ service: "ledgerapp-api", status: "ok" });
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  console.log(
    "/api/health",
    Object.fromEntries(
      [
        "content-security-policy",
        "x-content-type-options",
        "x-frame-options",
        "referrer-policy",
        "cache-control"
      ].map((key) => [key, response.headers()[key] || "ABSENT"])
    )
  );
});

test("optional explicitly authorized isolated smoke account: HTTPS cookie attributes", async ({
  page,
  context,
  baseURL
}) => {
  test.skip(
    process.env.E2E_SMOKE_AUTH_ALLOWED !== "true" ||
      !process.env.E2E_SMOKE_EMAIL ||
      !process.env.E2E_SMOKE_PASSWORD,
    "No explicitly authorized isolated deployed test account configured."
  );
  expect(new URL(baseURL!).protocol).toBe("https:");
  const login = await page.request.post("/api/auth/login", {
    data: {
      email: process.env.E2E_SMOKE_EMAIL,
      password: process.env.E2E_SMOKE_PASSWORD
    }
  });
  expect(login.status()).toBe(200);
  const authCookies = (await context.cookies()).filter((cookie) =>
    cookie.name.includes("ledgerapp")
  );
  expect(authCookies).toHaveLength(2);
  expect(
    authCookies.every((cookie) => cookie.secure && cookie.httpOnly && cookie.sameSite === "Lax")
  ).toBe(true);
  expect((await page.request.get("/api/auth/me")).status()).toBe(200);
  expect((await page.request.post("/api/auth/logout")).status()).toBe(204);
});
