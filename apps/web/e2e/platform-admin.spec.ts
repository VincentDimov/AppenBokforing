import { test, expect, type APIRequestContext, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { PrismaClient } from "@ledgerapp/db";
const apiRequire = createRequire(path.resolve(__dirname, "../../api/package.json"));
const argon = apiRequire("argon2") as {
  hash: (value: string, options: Record<string, unknown>) => Promise<string>;
  argon2id: number;
};
const { TOTP, Secret } = apiRequire("otpauth") as {
  Secret: { fromBase32: (value: string) => unknown };
  TOTP: new (options: Record<string, unknown>) => { generate: () => string };
};
test.describe.configure({ mode: "serial" });
// Synthetic credentials only, no privileged secrets in screenshots/traces.
test.use({ trace: "off" });
const initial = randomUUID() + "-Aa1!",
  password = randomUUID() + "-Bb2!",
  regularPassword = randomUUID() + "-Cc3!";
const suffix = randomUUID(),
  email = `platform-e2e-${suffix}@example.test`;
let db: PrismaClient,
  adminId: string,
  targetId: string,
  orgId: string,
  ownerId: string,
  ownerEmail: string;
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>, ownerApi: APIRequestContext;
test.beforeAll(async ({ playwright, baseURL }) => {
  db = new PrismaClient({ datasourceUrl: process.env.E2E_DATABASE_URL });
  const user = await db.user.create({
    data: {
      email,
      displayName: "Master E2E",
      passwordHash: await argon.hash(initial, {
        type: argon.argon2id,
        memoryCost: 8192,
        timeCost: 2
      }),
      mustChangePassword: true
    }
  });
  adminId = user.id;
  await db.platformAdministrator.create({
    data: { userId: adminId, role: "SUPER_ADMIN", mustChangePassword: true }
  });
  ownerEmail = `company-e2e-${suffix}@example.test`;
  ownerId = (
    await db.user.create({
      data: {
        email: ownerEmail,
        displayName: "Company E2E",
        passwordHash: await argon.hash(regularPassword, {
          type: argon.argon2id,
          memoryCost: 8192,
          timeCost: 2
        })
      }
    })
  ).id;
  targetId = (
    await db.user.create({
      data: {
        email: `target-e2e-${suffix}@example.test`,
        displayName: `Åsa ${suffix}`,
        passwordHash: await argon.hash(regularPassword, {
          type: argon.argon2id,
          memoryCost: 8192,
          timeCost: 2
        })
      }
    })
  ).id;
  orgId = (
    await db.organization.create({
      data: {
        name: `Åbolag ${suffix}`,
        slug: `platform-${suffix}`,
        address: "Testgatan 36, Sverige",
        members: {
          create: [
            { userId: ownerId, role: "OWNER" },
            { userId: targetId, role: "ADMIN" }
          ]
        }
      }
    })
  ).id;
  ownerApi = await playwright.request.newContext({ baseURL });
  expect(
    (
      await ownerApi.post("/api/auth/login", {
        data: { email: `target-e2e-${suffix}@example.test`, password: regularPassword }
      })
    ).status()
  ).toBe(200);
});
test.afterAll(async () => {
  await ownerApi?.dispose();
  await db?.$disconnect();
});
test("full first login changes password, enrolls MFA and returns to normal platform overview", async ({
  page,
  context
}) => {
  await page.goto("/login");
  await page.getByLabel("E-postadress").fill(email);
  await page.getByLabel("Lösenord", { exact: true }).fill(initial);
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
  await expect(page).toHaveURL(/\/security\/password$/);
  await page.getByLabel("Nuvarande lösenord").fill(initial);
  await page.getByLabel("Nytt lösenord").fill(password);
  await page.getByRole("button", { name: "Byt lösenord och logga in igen" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("E-postadress").fill(email);
  await page.getByLabel("Lösenord", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/security-setup$/);
  const enrollment = page.waitForResponse(
    (response) =>
      response.url().endsWith("/security-setup/enroll") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Skapa MFA-registrering" }).click();
  const secret = (await (await enrollment).json()).secret as string;
  await expect(page.getByLabel("MFA-hemlighet")).toHaveAttribute("type", "password");
  await page.getByLabel("Nuvarande lösenord").fill(password);
  await page.getByLabel("MFA-kod").fill(
    new TOTP({
      secret: Secret.fromBase32(secret),
      algorithm: "SHA1",
      digits: 6,
      period: 30
    }).generate()
  );
  await page.getByRole("button", { name: "Verifiera lösenord och MFA" }).click();
  await expect(page.getByRole("heading", { name: "Spara dina engångskoder säkert" })).toBeVisible();
  await page.getByRole("button", { name: "Jag har sparat koderna – till översikt" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Plattformsöversikt" })).toBeVisible();
  expect(await db.organizationMember.count({ where: { userId: adminId } })).toBe(0);
  cookies = await context.cookies();
});
test.beforeEach(async ({ context }) => {
  if (cookies) await context.addCookies(cookies);
});
test("admin link below overview opens independent workspace and back works", async ({ page }) => {
  await page.goto("/app");
  const nav = page.getByRole("navigation", { name: "Huvudnavigering" }).first();
  await expect(nav.getByRole("link", { name: "Admin", exact: true })).toBeVisible();
  const links = await nav.getByRole("link").allTextContents();
  expect(links[links.indexOf("Översikt") + 1]).toBe("Admin");
  await nav.getByRole("link", { name: "Admin", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Administrationsnavigering" }).first()
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Adminöversikt" })).toBeVisible();
  await page.getByRole("link", { name: "Tillbaka till översikt" }).first().click();
  await expect(page).toHaveURL(/\/app$/);
});
test("real users search, Swedish sorting, profile and edit persist", async ({ page }) => {
  await page.goto("/admin/users");
  await page.getByLabel(/Sök namn/).fill(suffix);
  await expect(page.getByRole("link", { name: `Åsa ${suffix}`, exact: true })).toBeVisible();
  await page.getByLabel("Sortering").selectOption("name_desc");
  await page.getByRole("link", { name: `Åsa ${suffix}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: `Åsa ${suffix}` })).toBeVisible();
  await page.getByRole("button", { name: "Redigera användare", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Redigera användare" });
  await dialog.getByLabel("Namn", { exact: true }).fill(`Ändrad ${suffix}`);
  await dialog.getByLabel("Intern anteckning").fill("Browserverified administration");
  await dialog.getByRole("button", { name: "Spara", exact: true }).click();
  await expect(page.getByRole("heading", { name: `Ändrad ${suffix}` })).toBeVisible();
  expect((await db.user.findUniqueOrThrow({ where: { id: targetId } })).adminNotes).toBe(
    "Browserverified administration"
  );
});
test("company search, address, metadata edit and confirmation are real", async ({ page }) => {
  await page.goto("/admin/organizations");
  await page.getByLabel(/Sök företagsnamn/).fill(suffix);
  const companyRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: `Åbolag ${suffix}`, exact: true }) });
  await expect(
    companyRow.getByRole("cell", { name: "Testgatan 36, Sverige", exact: true })
  ).toBeVisible();
  await page.getByRole("link", { name: `Åbolag ${suffix}`, exact: true }).click();
  await page.getByRole("button", { name: "Redigera företag", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Redigera företag" });
  await dialog.getByLabel("Adress", { exact: true }).fill("Verifierad adress 36");
  await dialog.getByRole("button", { name: "Spara", exact: true }).click();
  await expect(page.getByText("Verifierad adress 36", { exact: true })).toBeVisible();
  expect((await db.organization.findUniqueOrThrow({ where: { id: orgId } })).address).toBe(
    "Verifierad adress 36"
  );
  await page.getByRole("button", { name: "Inaktivera företag", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Inaktivera företag" });
  await expect(confirmation.getByLabel(/Skriv/)).toBeVisible();
  await confirmation.getByRole("button", { name: "Avbryt" }).click();
  expect((await db.organization.findUniqueOrThrow({ where: { id: orgId } })).isActive).toBe(true);
});
test("all monitoring modules render real API responses without placeholders", async ({ page }) => {
  for (const [route, heading] of [
    ["administrators", "Plattformsadministratörer"],
    ["invitations", "Inbjudningar"],
    ["sessions", "Sessioner"],
    ["audit", "Auditlogg"],
    ["security", "Säkerhetscenter"],
    ["system", "Systemstatus"],
    ["usage", "Användning och lagring"],
    ["jobs", "Import och export"]
  ]) {
    const response = page.waitForResponse(
      (r) => r.url().includes(`/api/platform-admin/${route}`) && r.request().method() === "GET"
    );
    await page.goto(`/admin/${route}`);
    expect((await response).status()).toBe(200);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    // Next's global route announcer has role=alert even when empty. Keep the
    // zero-application-error assertion scoped to the rendered administration.
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  }
});
test("company ADMIN sees no Admin link and both UI and proxy deny global access", async ({
  browser,
  baseURL
}) => {
  const context = await browser.newContext({ baseURL });
  try {
    await context.addCookies((await ownerApi.storageState()).cookies);
    const page = await context.newPage();
    await page.goto("/app");
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
    await page.goto("/admin/users");
    await expect(page.getByText(/Åtkomst nekad/)).toBeVisible();
    expect((await context.request.get("/api/platform-admin/users")).status()).toBe(403);
  } finally {
    await context.close();
  }
});
test("unauthenticated Next proxy never exposes global lists", async ({ playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL });
  try {
    expect((await request.get("/api/platform-admin/users")).status()).toBe(401);
    expect((await request.get(`/api/platform-admin/organizations/${orgId}`)).status()).toBe(401);
  } finally {
    await request.dispose();
  }
});
for (const width of [1440, 1024, 768, 390])
  test(`admin accessibility, keyboard focus and responsive navigation at ${width}px`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/admin/users");
    await page.getByLabel(/Sök namn/).fill(suffix);
    await expect(page.getByRole("link", { name: `Ändrad ${suffix}`, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`admin-users-${width}.png`),
      fullPage: true
    });
    if (width < 1024) {
      await page.getByRole("button", { name: "Öppna administrationens navigering" }).click();
      const drawer = page.getByRole("dialog", { name: "Administration", exact: true });
      await expect(drawer).toBeVisible();
      await page.keyboard.press("Tab");
      expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(
        true
      );
      await page.keyboard.press("Escape");
      await expect(drawer).not.toBeVisible();
      await expect(
        page.getByRole("button", { name: "Öppna administrationens navigering" })
      ).toBeFocused();
    }
    await page.getByRole("button", { name: "Skapa användare" }).click();
    const dialog = page.getByRole("dialog", { name: "Skapa användare" });
    await expect(dialog).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Skapa användare" })).toBeFocused();
  });
test("logout from administration returns to the public homepage", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Logga ut", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect((await page.request.get("/api/platform-admin/users")).status()).toBe(401);
});
