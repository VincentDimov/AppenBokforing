import {
  test,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@ledgerapp/db";
import { goldenAccounting as golden } from "../../../tests/fixtures/accounting-golden";
import { readFile } from "node:fs/promises";
import { parseSie4 } from "@ledgerapp/sie";

type Organization = {
  id: string;
  name: string;
  yearId: string;
  seriesId: string;
  accounts: Record<string, string>;
};
type Entry = {
  version: number;
  id: string;
  status: string;
  voucherNumber: number;
  reversedByEntryId?: string;
  reversesEntryId?: string;
  lines: { accountId: string; debit: string; credit: string }[];
};
let api: APIRequestContext;
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
let db: PrismaClient;
let a: Organization, b: Organization, reports: Organization, locked: Organization;
let goldenOrg: Organization;
const date = new Date().toISOString().slice(0, 10);
const year = date.slice(0, 4);
const password = randomUUID() + "-Aa1!";

test("two browser contexts cannot overwrite or post a stale voucher", async ({ browser }) => {
  const entry = await draft(a);
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    for (const context of contexts) await context.addCookies(cookies);
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    for (const page of pages) await open(page, a, "bookkeeping/vouchers/" + entry.id);
    for (const [index, page] of pages.entries()) {
      await page.getByLabel("Debet rad 1").fill(index === 0 ? "5000" : "9000");
      await page.getByLabel("Kredit rad 2").fill(index === 0 ? "5000" : "9000");
    }
    const saved = pages[0]!.waitForResponse(
      (r) => r.url().endsWith(entry.id) && r.request().method() === "PATCH"
    );
    await pages[0]!.getByRole("button", { name: "Spara utkast" }).click();
    expect((await saved).status()).toBe(200);
    await pages[1]!.getByRole("button", { name: "Bokför verifikation" }).click();
    await expect(
      pages[1]!.getByText("Verifikationen har ändrats av en annan användare.")
    ).toBeVisible();
    await expect(pages[1]!.getByLabel("Debet rad 1")).toHaveValue("9000");
    expect(await db.journalEntry.findUnique({ where: { id: entry.id } })).toMatchObject({
      status: "DRAFT",
      version: 2
    });
    await pages[1]!
      .getByRole("button", { name: "Ladda senaste och kasta lokala ändringar" })
      .click();
    await expect(pages[1]!.getByLabel("Debet rad 1")).toHaveValue("5000.00");
    const posted = pages[1]!.waitForResponse((r) =>
      r.url().endsWith(`/journal-entries/${entry.id}/post`)
    );
    await pages[1]!.getByRole("button", { name: "Bokför verifikation" }).click();
    expect((await posted).status()).toBe(201);
    expect(
      (
        await db.journalLine.findFirstOrThrow({
          where: { journalEntryId: entry.id, lineNumber: 1 }
        })
      ).debitAmount.toFixed(2)
    ).toBe("5000.00");
  } finally {
    for (const context of contexts) await context.close();
  }
});
test("browser downloads real PC8 SIE and roundtrips Golden opening balances", async ({ page }) => {
  await page.goto("/app");
  const downloadEvent = page.waitForEvent("download");
  await page.evaluate((href) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = "ledgerapp.sie";
    document.body.append(a);
    a.click();
    a.remove();
  }, `/api/exports/sie?organizationId=${goldenOrg.id}&fiscalYear=${goldenOrg.yearId}`);
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("ledgerapp.sie");
  const bytes = await readFile((await download.path())!);
  const parsed = parseSie4(bytes);
  expect(parsed.errors).toEqual([]);
  expect(parsed.openingBalances.find((b) => b.account === "1930")?.amount).toBe("10000.00");
  const target = await provision("Browser SIE destination");
  const input = {
    organizationId: target.id,
    fiscalYearId: target.yearId,
    contentBase64: bytes.toString("base64")
  };
  // Provision creates matching bank with a destination-specific name. Accounting
  // import intentionally keeps existing chart metadata; amounts/identity must match.
  const preview = await api.post("/api/imports/sie", { data: input });
  expect(preview.status()).toBe(201);
  const result = await api.post("/api/imports/sie", {
    data: { ...input, confirm: true, previewToken: (await preview.json()).previewToken }
  });
  expect(result.status()).toBe(201);
  const tb = await api.get(
    `/api/reports/trial-balance?organizationId=${target.id}&fiscalYear=${target.yearId}&fromDate=${year}-01-01&toDate=${year}-12-31`
  );
  expect(tb.status()).toBe(200);
  expect((await tb.json()).totals).toEqual(golden.expected.fullYearTotals);
});

async function provision(name: string): Promise<Organization> {
  const orgResponse = await api.post("/api/organizations", {
    data: { name, slug: "e2e-" + randomUUID() }
  });
  expect(orgResponse.status()).toBe(201);
  const org = (await orgResponse.json()) as { id: string };
  const fiscalResponse = await api.post("/api/fiscal-years", {
    data: {
      organizationId: org.id,
      name: year,
      startDate: year + "-01-01",
      endDate: year + "-12-31"
    }
  });
  expect(fiscalResponse.status()).toBe(201);
  const fiscal = (await fiscalResponse.json()) as { id: string };
  // No voucher-series write API exists. Test-only metadata is provisioned in the disposable DB.
  const series = await db.voucherSeries.create({
    data: {
      organizationId: org.id,
      fiscalYearId: fiscal.id,
      code: "A",
      name: "E2E"
    }
  });
  const accounts: Record<string, string> = {};
  for (const [number, accountType] of [
    ["1930", "ASSET"],
    ["3000", "REVENUE"],
    ["5000", "EXPENSE"]
  ] as const) {
    const response = await api.post("/api/accounts", {
      data: { organizationId: org.id, number, name: name + "-" + number, accountType }
    });
    expect(response.status()).toBe(201);
    accounts[number] = ((await response.json()) as { id: string }).id;
  }
  return { id: org.id, name, yearId: fiscal.id, seriesId: series.id, accounts };
}
function payload(org: Organization, amount = "1000.00", expense = false) {
  return {
    organizationId: org.id,
    voucherSeriesId: org.seriesId,
    transactionDate: date,
    description: "E2E-" + randomUUID(),
    lines: [
      { accountId: org.accounts[expense ? "5000" : "1930"], debit: amount, credit: "0.00" },
      { accountId: org.accounts[expense ? "1930" : "3000"], debit: "0.00", credit: amount }
    ]
  };
}
async function draft(org: Organization, amount = "1000.00", expense = false) {
  const response = await api.post("/api/journal-entries", { data: payload(org, amount, expense) });
  expect(response.status()).toBe(201);
  return (await response.json()) as Entry;
}
async function posted(org: Organization, amount = "1000.00", expense = false) {
  const entry = await draft(org, amount, expense);
  expect(
    (
      await api.post("/api/journal-entries/" + entry.id + "/post", {
        data: { expectedVersion: entry.version }
      })
    ).status()
  ).toBe(201);
  return entry;
}
async function selectOrg(page: Page, org: Organization) {
  await page.getByRole("combobox", { name: "Aktiv organisation" }).last().click();
  await page.getByRole("option", { name: org.name, exact: true }).click();
}
async function open(page: Page, org: Organization, route: string) {
  await page.goto("/app");
  await selectOrg(page, org);
  await page.goto("/app/" + route);
}
async function fillVoucher(page: Page, amount: string) {
  for (const [index, number] of ["1930", "3000"].entries()) {
    const input = page.getByRole("table").locator('input[role="combobox"]').nth(index);
    await input.fill(number);
    await page.getByRole("option", { name: new RegExp("^" + number) }).click();
  }
  await page.getByRole("textbox", { name: "Beskrivning", exact: true }).fill("Browser regression");
  await page.getByLabel("Debet rad 1").fill(amount);
  await page.getByLabel("Kredit rad 2").fill(amount);
}
async function storedEntry(id: string) {
  return db.journalEntry.findUniqueOrThrow({
    where: { id },
    include: { lines: { orderBy: { lineNumber: "asc" } } }
  });
}

test.beforeAll(async ({ playwright, baseURL }) => {
  // The configuration has already rejected non-local URLs and other database names.
  db = new PrismaClient({ datasources: { db: { url: process.env.E2E_DATABASE_URL! } } });
  api = await playwright.request.newContext({ baseURL });
  const response = await api.post("/api/auth/register", {
    data: {
      displayName: "E2E Owner",
      email: randomUUID() + "@example.test",
      password
    }
  });
  expect(response.status()).toBe(201);
  cookies = (await api.storageState()).cookies;
  a = await provision("E2E A");
  b = await provision("E2E B");
  reports = await provision("E2E Reports");
  locked = await provision("E2E Lock");
  await posted(reports);
  await posted(reports, "200.00", true);
  goldenOrg = await provisionGolden();
});
test.afterAll(async () => {
  await api?.dispose();
  await db?.$disconnect();
});
test.beforeEach(async ({ context }) => {
  await context.addCookies(cookies);
});

test("explicit VAT roles → browser posting → frozen DB → base/tax report", async ({ page }) => {
  const org = await provision("VAT E2E");
  await db.vatCode.create({
    data: {
      organizationId: org.id,
      code: "VAT25",
      name: "VAT25",
      rate: "25",
      type: "OUTPUT",
      configurationVersion: "SE-DOMESTIC-2026-01",
      reportingCategory: "DOMESTIC_STANDARD",
      effectiveFrom: new Date("2026-01-01"),
      effectiveTo: new Date("2026-12-31")
    }
  });
  const account = await api.post("/api/accounts", {
    data: { organizationId: org.id, number: "2611", name: "VAT tax", accountType: "LIABILITY" }
  });
  expect(account.status()).toBe(201);
  const taxId = ((await account.json()) as { id: string }).id;
  const response = await api.post("/api/journal-entries", {
    data: {
      organizationId: org.id,
      voucherSeriesId: org.seriesId,
      transactionDate: "2026-01-15",
      description: "VAT browser",
      lines: [
        { accountId: org.accounts["3000"], debit: "0", credit: "1000", vatCode: "VAT25" },
        { accountId: taxId, debit: "0", credit: "250", vatCode: "VAT25" },
        { accountId: org.accounts["1930"], debit: "1250", credit: "0" }
      ]
    }
  });
  expect(response.status()).toBe(201);
  const id = ((await response.json()) as { id: string }).id;
  await open(page, org, "bookkeeping/vouchers/" + id);
  await page.getByLabel("Momsroll rad 1").selectOption("BASE");
  await page.getByLabel("Momsroll rad 2").selectOption("TAX");
  const posting = page.waitForResponse((r) => r.url().endsWith(`/journal-entries/${id}/post`));
  await page.getByRole("button", { name: "Bokför verifikation", exact: true }).click();
  expect((await posting).status()).toBe(201);
  const stored = await storedEntry(id);
  expect(stored.lines[0]!.vatRole).toBe("BASE");
  expect(stored.lines[1]!.vatRole).toBe("TAX");
  expect(stored.lines[1]!.vatSnapshot).toMatchObject({
    rate: "25.00",
    configurationVersion: "SE-DOMESTIC-2026-01"
  });
  await page.goto("/app/reports/vat");
  await page.getByLabel("Räkenskapsår", { exact: true }).fill(org.yearId);
  await page.getByLabel("Från datum").fill("2026-01-01");
  await page.getByLabel("Till datum").fill("2026-01-31");
  const report = page.waitForResponse((r) => r.url().includes("/api/reports/vat?"));
  await page.getByRole("button", { name: "Visa rapport", exact: true }).click();
  const reportResponse = await report;
  expect(reportResponse.status()).toBe(200);
  expect(((await reportResponse.json()) as { totals: unknown }).totals).toMatchObject({
    outputBase: "1000.00",
    outputVat: "250.00",
    inputVat: "0.00",
    vatPosition: "250.00"
  });
  await expect(page.getByRole("row").filter({ hasText: "VAT25" })).toContainText("1000.00");
  await expect(page.getByRole("row").filter({ hasText: "VAT25" })).toContainText("250.00");
  await expect(page.getByText(/Granskning krävs; ingen deklarationsfil/)).toBeVisible();
});

async function provisionGolden(): Promise<Organization> {
  const response = await api.post("/api/organizations", {
    data: { name: "Golden E2E", slug: "golden-e2e-" + randomUUID() }
  });
  expect(response.status()).toBe(201);
  const org = (await response.json()) as { id: string; name: string };
  const fiscal = await api.post("/api/fiscal-years", {
    data: { organizationId: org.id, ...golden.year }
  });
  expect(fiscal.status()).toBe(201);
  const yearId = ((await fiscal.json()) as { id: string }).id;
  const series = await db.voucherSeries.create({
    data: { organizationId: org.id, fiscalYearId: yearId, code: "A", name: "Golden E2E" }
  });
  const accounts: Record<string, string> = {};
  for (const account of golden.accounts) {
    const created = await api.post("/api/accounts", {
      data: {
        organizationId: org.id,
        number: account.number,
        name: account.name,
        accountType: account.type
      }
    });
    expect(created.status()).toBe(201);
    accounts[account.number] = ((await created.json()) as { id: string }).id;
  }
  await db.openingBalance.createMany({
    data: golden.accounts
      .filter((account) => account.openingDebit !== "0.00" || account.openingCredit !== "0.00")
      .map((account) => ({
        organizationId: org.id,
        fiscalYearId: yearId,
        accountId: accounts[account.number]!,
        debitAmount: account.openingDebit,
        creditAmount: account.openingCredit
      }))
  });
  const create = async (
    voucher: { date: string; text: string; debit: string; credit: string; amount: string },
    post = true
  ) => {
    const draft = await api.post("/api/journal-entries", {
      data: {
        organizationId: org.id,
        voucherSeriesId: series.id,
        transactionDate: voucher.date,
        description: voucher.text,
        lines: [
          { accountId: accounts[voucher.debit], debit: voucher.amount, credit: "0.00" },
          { accountId: accounts[voucher.credit], debit: "0.00", credit: voucher.amount }
        ]
      }
    });
    expect(draft.status()).toBe(201);
    const entry = (await draft.json()) as { id: string };
    if (post)
      expect(
        (
          await api.post("/api/journal-entries/" + entry.id + "/post", {
            data: { expectedVersion: 1 }
          })
        ).status()
      ).toBe(201);
    return entry.id;
  };
  const ids = [];
  for (const voucher of golden.vouchers) ids.push(await create(voucher));
  expect(
    (
      await api.post("/api/journal-entries/" + ids[golden.reversal.originalIndex] + "/reverse", {
        data: {
          voucherSeriesId: series.id,
          transactionDate: golden.reversal.date,
          description: golden.reversal.description
        }
      })
    ).status()
  ).toBe(201);
  await create(golden.finalVoucher);
  await create(golden.draft, false);
  return { id: org.id, name: org.name, yearId, seriesId: series.id, accounts };
}

test("Golden IB → real reports → browser trial-balance sides reconcile", async ({ page }) => {
  await open(page, goldenOrg, "reports/trial-balance");
  await page.getByLabel("Räkenskapsår", { exact: true }).fill(goldenOrg.yearId);
  await page.getByLabel("Från datum").fill(golden.year.startDate);
  await page.getByLabel("Till datum").fill(golden.year.endDate);
  const response = page.waitForResponse(
    (r) => r.url().includes("/api/reports/trial-balance") && r.request().method() === "GET"
  );
  await page.getByRole("button", { name: "Visa rapport", exact: true }).click();
  expect((await response).status()).toBe(200);
  expect((await (await response).json()).totals).toEqual(golden.expected.fullYearTotals);
  await expect(page.getByRole("row", { name: /1930 Bank/ })).toContainText("11000.00");
  await expect(page.getByRole("row", { name: /Totalt/ })).toContainText("13500.00");
  const query = new URLSearchParams({
    organizationId: goldenOrg.id,
    fiscalYear: goldenOrg.yearId,
    fromDate: golden.year.startDate,
    toDate: golden.year.endDate
  });
  const gl = await api.get("/api/reports/general-ledger?" + query);
  expect(gl.status()).toBe(200);
  expect(
    (await gl.json()).accounts.find(
      (account: { account: { number: string } }) => account.account.number === "1930"
    ).closingBalance
  ).toBe("11000.00");
  const bs = await api.get(
    "/api/reports/balance-sheet?" +
      new URLSearchParams({
        organizationId: goldenOrg.id,
        fiscalYear: goldenOrg.yearId,
        reportDate: golden.year.endDate
      })
  );
  expect(bs.status()).toBe(200);
  expect((await bs.json()).totals).toMatchObject({
    assets: "11000.00",
    equityAndLiabilities: "11000.00",
    difference: "0.00"
  });
  const income = await api.get("/api/reports/income-statement?" + query);
  expect(income.status()).toBe(200);
  expect((await income.json()).totals.yearToDateResult).toBe("2000.00");
  expect(
    (
      await db.openingBalance.findUniqueOrThrow({
        where: {
          organizationId_fiscalYearId_accountId: {
            organizationId: goldenOrg.id,
            fiscalYearId: goldenOrg.yearId,
            accountId: goldenOrg.accounts["1930"]!
          }
        }
      })
    ).debitAmount.toFixed(2)
  ).toBe("10000.00");
  await selectOrg(page, b);
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByLabel("Räkenskapsår", { exact: true })).toHaveValue("");
});

test("browser registration, persisted cookies, logout home and protected redirect", async ({
  page,
  context
}) => {
  await context.clearCookies();
  await page.goto("/register");
  await page.getByLabel("Namn").fill("Browser user");
  await page.getByLabel("E-postadress").fill(randomUUID() + "@example.test");
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Skapa konto", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  const authCookies = (await context.cookies()).filter((cookie) =>
    cookie.name.includes("ledgerapp")
  );
  expect(authCookies).toHaveLength(2);
  expect(authCookies.every((cookie) => cookie.httpOnly && cookie.sameSite === "Lax")).toBe(true);
  // Local HTTP cannot prove production Secure; the production smoke deliberately doesn't log in.
  await page.reload();
  await expect(page.getByRole("button", { name: "Öppna användarmeny" })).toBeVisible();
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage).filter((key) => key !== "ledgerapp:active-organization"),
      session: Object.keys(sessionStorage)
    }))
  ).toEqual({ local: [], session: [] });
  await page.getByRole("button", { name: "Öppna användarmeny" }).click();
  await page.getByRole("menuitem", { name: "Logga ut" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(
    (await context.cookies()).filter((cookie) => cookie.name.includes("ledgerapp"))
  ).toHaveLength(0);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login\?next=/);
});

test("failed browser login is explicit and stays anonymous", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-postadress").fill("absent@example.test");
  await page.getByLabel("Lösenord", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
  await expect(page.locator('[aria-live="polite"]')).toContainText(
    /Invalid|Fel|ogiltig|credentials/i
  );
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
});

test("mandatory unsaved 1000 → 5000 posting, double click, immutable and correction", async ({
  page
}) => {
  const postedBefore = await db.journalEntry.count({
    where: { organizationId: a.id, status: "POSTED" }
  });
  const numberBefore = (await db.voucherSeries.findUniqueOrThrow({ where: { id: a.seriesId } }))
    .nextVoucherNumber;
  await open(page, a, "bookkeeping/vouchers/new");
  await fillVoucher(page, "1000");
  await page.getByRole("button", { name: "Spara utkast", exact: true }).click();
  await expect(page).toHaveURL(/vouchers\/[0-9a-f-]+$/);
  const id = page.url().split("/").at(-1)!;
  expect((await storedEntry(id)).lines[0]!.debitAmount.toFixed(2)).toBe("1000.00");
  await page.getByLabel("Debet rad 1").fill("5000");
  await page.getByLabel("Kredit rad 2").fill("5000");
  // Native two clicks dispatch before React's render; real event handler must deduplicate.
  await page
    .getByRole("button", { name: "Bokför verifikation", exact: true })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  await expect(page.getByText("Bokförda belopp är låsta.", { exact: false })).toBeVisible();
  const original = await storedEntry(id);
  expect(original.status).toBe("POSTED");
  expect(
    original.lines.map((line) => [line.debitAmount.toFixed(2), line.creditAmount.toFixed(2)])
  ).toEqual([
    ["5000.00", "0.00"],
    ["0.00", "5000.00"]
  ]);
  const apiEntry = (await (await api.get("/api/journal-entries/" + id)).json()) as Entry;
  expect(apiEntry.status).toBe("POSTED");
  expect(apiEntry.lines[0]!.debit).toBe("5000.00");
  expect(await db.journalEntry.count({ where: { organizationId: a.id, status: "POSTED" } })).toBe(
    postedBefore + 1
  );
  expect(
    await db.voucherSeries
      .findUniqueOrThrow({ where: { id: a.seriesId } })
      .then((series) => series.nextVoucherNumber)
  ).toBe(numberBefore + 1);
  await expect(page.getByLabel("Debet rad 1")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Spara utkast", exact: true })).toHaveCount(0);
  expect(
    (
      await api.patch("/api/journal-entries/" + id, {
        data: { expectedVersion: 1, lines: payload(a, "1.00").lines }
      })
    ).status()
  ).toBe(409);
  expect((await api.delete("/api/journal-entries/" + id)).status()).toBe(404);
  await page.getByRole("button", { name: "Skapa rättelse", exact: true }).click();
  await page.getByRole("button", { name: "Bekräfta och bokför rättelse" }).click();
  await expect(page).not.toHaveURL(new RegExp(id + "$"));
  const correction = await storedEntry(page.url().split("/").at(-1)!);
  expect(correction.status).toBe("POSTED");
  expect(correction.reversesEntryId).toBe(id);
  expect(
    correction.lines.map((line) => [line.debitAmount.toFixed(2), line.creditAmount.toFixed(2)])
  ).toEqual([
    ["0.00", "5000.00"],
    ["5000.00", "0.00"]
  ]);
  const unchanged = await storedEntry(id);
  expect(unchanged.lines).toEqual(original.lines);
  expect(
    await db.journalEntry.findFirst({ where: { reversesEntryId: id } }).then((entry) => entry?.id)
  ).toBe(correction.id);
});

test("unbalanced / invalid UI rejects posting; keyboard uses visible values", async ({ page }) => {
  await open(page, b, "bookkeeping/vouchers/new");
  await fillVoucher(page, "1000");
  await page.getByLabel("Kredit rad 2").fill("999");
  await expect(
    page.getByRole("button", { name: "Bokför verifikation", exact: true })
  ).toBeDisabled();
  await page.getByLabel("Kredit rad 2").fill("1000");
  await page.getByLabel("Kredit rad 1").fill("1");
  await expect(
    page.getByRole("button", { name: "Bokför verifikation", exact: true })
  ).toBeDisabled();
  await page.getByLabel("Kredit rad 1").fill("0");
  await page.getByRole("button", { name: "Spara utkast", exact: true }).click();
  await expect(page).toHaveURL(/vouchers\/[0-9a-f-]+$/);
  const id = page.url().split("/").at(-1)!;
  await page.getByLabel("Debet rad 1").fill("250");
  await page.getByLabel("Kredit rad 2").fill("250");
  await page.getByLabel("Kredit rad 2").press("Control+Enter");
  await expect(page.getByText("Bokförda belopp är låsta.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Debet rad 1")).toBeDisabled();
  expect((await storedEntry(id)).lines[0]!.debitAmount.toFixed(2)).toBe("250.00");
});

test("organization accounts and vouchers switch without old tenant data", async ({ page }) => {
  await open(page, a, "registers/accounts");
  await expect(page.getByRole("cell", { name: "E2E A-1930", exact: true })).toBeVisible();
  await selectOrg(page, b);
  await expect(page.getByRole("cell", { name: "E2E B-1930", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "E2E A-1930", exact: true })).toHaveCount(0);
  await page.goto("/app/bookkeeping/vouchers");
  await expect(page.getByRole("table")).toContainText("A1");
  await selectOrg(page, reports);
  await expect(page.getByRole("table")).toContainText("A2");
  await expect(page.getByRole("table")).not.toContainText("Browser regression");
});

test("visible general ledger, income statement and balance sheet agree with posted database fixture", async ({
  page
}) => {
  const lines = await db.journalLine.findMany({
    where: { organizationId: reports.id, journalEntry: { status: "POSTED" } }
  });
  expect(lines).toHaveLength(4);
  for (const report of ["general-ledger", "income-statement", "balance-sheet"]) {
    await open(page, reports, "reports/" + report);
    await page.getByLabel("Räkenskapsår", { exact: true }).fill(reports.yearId);
    if (report === "balance-sheet") await page.getByLabel("Rapportdatum").fill(date);
    else {
      await page.getByLabel("Från datum").fill(year + "-01-01");
      await page.getByLabel("Till datum").fill(date);
    }
    await page.getByRole("button", { name: "Visa rapport" }).click();
    if (report === "general-ledger") {
      await expect(page.locator("article").filter({ hasText: "1930 —" })).toContainText(
        "Utgående saldo: 800.00"
      );
      await expect(page.locator("article").filter({ hasText: "3000 —" })).toContainText("-1000.00");
      await expect(page.locator("article").filter({ hasText: "5000 —" })).toContainText("200.00");
    } else if (report === "income-statement") {
      await expect(page.getByText("Periodens resultat: 800.00", { exact: true })).toBeVisible();
      await expect(page.getByText("Ackumulerat resultat: 800.00", { exact: true })).toBeVisible();
    } else {
      await expect(page.getByText("Tillgångar: 800.00", { exact: true })).toBeVisible();
      await expect(page.getByText("Kontrolldifferens: 0.00", { exact: true })).toBeVisible();
    }
    await selectOrg(page, b);
    await expect(page.getByLabel("Räkenskapsår", { exact: true })).toHaveValue("");
    await expect(page.locator("article")).toHaveCount(0);
  }
});

test("late report response cannot overwrite new organization's cleared state", async ({ page }) => {
  await open(page, reports, "reports/income-statement");
  await page.getByLabel("Räkenskapsår", { exact: true }).fill(reports.yearId);
  await page.getByLabel("Från datum").fill(year + "-01-01");
  await page.getByLabel("Till datum").fill(date);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reached!: () => void;
  const started = new Promise<void>((resolve) => {
    reached = resolve;
  });
  await page.route("**/api/reports/income-statement?**", async (route) => {
    const response = await route.fetch();
    reached();
    await gate;
    await route.fulfill({ response }).catch(() => {
      /* the old request was intentionally aborted */
    });
  });
  await page.getByRole("button", { name: "Visa rapport" }).click();
  await started;
  await selectOrg(page, b);
  release();
  await expect(page.getByLabel("Räkenskapsår", { exact: true })).toHaveValue("");
  await expect(page.getByText("Periodens resultat: 800.00", { exact: true })).toHaveCount(0);
});

test("locked period rejects backend posting and displays browser failure", async ({ page }) => {
  await posted(locked);
  const entry = await draft(locked);
  await open(page, locked, "bookkeeping/vouchers/" + entry.id);
  await expect(
    page.getByRole("button", { name: "Bokför verifikation", exact: true })
  ).toBeEnabled();
  const period = await db.accountingPeriod.findFirstOrThrow({
    where: {
      organizationId: locked.id,
      startDate: { lte: new Date(date) },
      endDate: { gte: new Date(date) }
    }
  });
  expect(
    (
      await api.post("/api/accounting-periods/" + period.id + "/lock", {
        data: { organizationId: locked.id, confirm: true }
      })
    ).status()
  ).toBe(201);
  expect(
    (
      await api.post("/api/journal-entries/" + entry.id + "/post", {
        data: { expectedVersion: entry.version }
      })
    ).status()
  ).toBe(409);
  await page.getByRole("button", { name: "Bokför verifikation", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/locked|låst/i);
  expect((await storedEntry(entry.id)).status).toBe("DRAFT");
});

test("real 400 / 403 / 404 boundaries plus explicit injected 500 and network UX", async ({
  page
}) => {
  expect(
    (await api.post("/api/accounts", { data: { organizationId: a.id, number: "bad" } })).status()
  ).toBe(400);
  expect((await api.get("/api/journal-entries/" + randomUUID())).status()).toBe(404);
  const ownerId = ((await (await api.get("/api/auth/me")).json()) as { user: { id: string } }).user
    .id;
  await db.organizationMember.update({
    where: { organizationId_userId: { organizationId: b.id, userId: ownerId } },
    data: { role: "READ_ONLY" }
  });
  expect(
    (
      await api.post("/api/accounts", {
        data: { organizationId: b.id, number: "9999", name: "Forbidden", accountType: "ASSET" }
      })
    ).status()
  ).toBe(403);
  await open(page, b, "bookkeeping/vouchers/new");
  await expect(page.getByText("Du har läsbehörighet.", { exact: false })).toBeVisible();
  await open(page, a, "reports/income-statement");
  await page.getByLabel("Räkenskapsår", { exact: true }).fill(a.yearId);
  await page.getByLabel("Från datum").fill(year + "-01-01");
  await page.getByLabel("Till datum").fill(date);
  await page.route("**/api/reports/income-statement?**", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: '{"message":"Internal server error"}'
    })
  );
  await page.getByRole("button", { name: "Visa rapport" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Internal server error");
  await expect(page.getByRole("main").getByRole("alert")).not.toContainText(
    /at .*\(|PrismaClient|node_modules/
  );
  await page.unroute("**/api/reports/income-statement?**");
  await page.route("**/api/reports/income-statement?**", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Visa rapport" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    /Failed to fetch|kunde inte/i
  );
  await expect(page.locator("article")).toHaveCount(0);
});
