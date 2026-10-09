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
import { validateIndependent } from "../../../tests/sie-independent.cjs";

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
    await pages[1]!.getByRole("button", { name: "Bekräfta bokföring" }).click();
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
    await pages[1]!.getByRole("button", { name: "Bekräfta bokföring" }).click();
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
  const seriesResponse = await api.post(`/api/organizations/${org.id}/voucher-series`, {
    data: {
      fiscalYearId: fiscal.id,
      code: "A",
      name: "E2E"
    }
  });
  expect(seriesResponse.status()).toBe(201);
  const series = await seriesResponse.json();
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
  const selector = page.getByRole("combobox", { name: "Aktiv organisation" }).last();
  if ((await selector.textContent())?.includes(org.name)) return;
  await selector.click();
  await page.getByRole("option", { name: org.name, exact: true }).click();
}
async function open(page: Page, org: Organization, route: string) {
  // Navigate directly: loading a dashboard before every destination creates
  // redundant year requests and can exhaust the real per-IP read limiter.
  // Do not weaken production throttling to accommodate an artificial test storm.
  await page.goto(route ? "/app/" + route : "/app");
  await selectOrg(page, org);
}
async function fillVoucher(page: Page, amount: string, revenueAccount = "3000") {
  for (const [index, number] of ["1930", revenueAccount].entries()) {
    const input = page.getByRole("table").locator('input[id^="voucher-account-"]').nth(index);
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

async function basWorkspace() {
  const catalog = await db.$transaction(async (tx) => {
    const version = await tx.basCatalogVersion.create({
      data: {
        version: "SYNTHETIC-E2E-" + randomUUID(),
        sourceVersion: "Original fixture",
        sourceReference: "synthetic://not-bas",
        sourceSha256: "a".repeat(64),
        contentSha256: "b".repeat(64),
        licenseReference: "Original synthetic test data",
        classificationReviewReference: "Manual fixture classification",
        verificationReport: { synthetic: true },
        rowCount: 3
      }
    });
    await tx.basAccountCatalog.createMany({
      data: [
        {
          id: randomUUID(),
          catalogVersionId: version.id,
          accountNumber: "1110",
          officialName: "Synthetic main",
          accountClass: "1",
          accountGroup: "11",
          className: "Synthetic class",
          groupName: "Synthetic group",
          category: "MAIN_ACCOUNT",
          parentAccountNumber: null,
          isK2Restricted: false,
          isDefaultActive: true,
          isBookable: true,
          type: "ASSET",
          normalBalance: "DEBIT",
          classificationReference: "Synthetic",
          sourcePosition: "Fixture"
        },
        {
          id: randomUUID(),
          catalogVersionId: version.id,
          accountNumber: "1111",
          officialName: "Synthetic optional",
          accountClass: "1",
          accountGroup: "11",
          className: "Synthetic class",
          groupName: "Synthetic group",
          category: "SUBACCOUNT",
          parentAccountNumber: "1110",
          isK2Restricted: false,
          isDefaultActive: false,
          isBookable: true,
          type: "ASSET",
          normalBalance: "DEBIT",
          classificationReference: "Synthetic",
          sourcePosition: "Fixture"
        },
        {
          id: randomUUID(),
          catalogVersionId: version.id,
          accountNumber: "2080",
          officialName: "Synthetic restricted",
          accountClass: "2",
          accountGroup: "20",
          className: "Synthetic class",
          groupName: "Synthetic group",
          category: "MAIN_ACCOUNT",
          parentAccountNumber: null,
          isK2Restricted: true,
          isDefaultActive: false,
          isBookable: true,
          type: "EQUITY",
          normalBalance: "CREDIT",
          classificationReference: "Synthetic",
          sourcePosition: "Fixture"
        }
      ]
    });
    return version;
  });
  let org: Organization;
  await db.basCatalogVersion.update({ where: { id: catalog.id }, data: { isDefault: true } });
  try {
    org = await onboardWorkspace("Synthetic BAS E2E " + randomUUID().slice(0, 8));
  } finally {
    await db.basCatalogVersion.update({ where: { id: catalog.id }, data: { isDefault: false } });
  }
  expect(
    await db.account.count({
      where: { organizationId: org.id, accountNumber: "1110", isActive: true }
    })
  ).toBe(1);
  expect(
    await db.account.count({
      where: { organizationId: org.id, accountNumber: { in: ["1111", "2080"] } }
    })
  ).toBe(0);
  expect(
    (
      await api.post("/api/accounts/catalog/provision", {
        data: { organizationId: org.id, versionId: catalog.id }
      })
    ).status()
  ).toBe(201);
  return { ...org, catalogVersionId: catalog.id };
}

test("BAS optional activation requires a real preview and becomes available in voucher typeahead", async ({
  page
}) => {
  const org = await basWorkspace();
  expect(
    (
      await api.post("/api/accounts/catalog/framework", {
        data: {
          organizationId: org.id,
          framework: "K2",
          confirmation: org.name
        }
      })
    ).status()
  ).toBe(201);
  const restricted = await db.basAccountCatalog.findFirstOrThrow({
    where: { catalogVersionId: org.catalogVersionId, accountNumber: "2080" }
  });
  expect(
    (
      await api.post("/api/accounts/catalog/activate", {
        data: {
          organizationId: org.id,
          catalogAccountIds: [restricted.id]
        }
      })
    ).status()
  ).toBe(400);
  await open(page, org, "registers/accounts");
  await page.getByRole("button", { name: "Tillgängliga BAS-konton" }).click();
  await expect(page.getByRole("checkbox", { name: "Markera konto 2080" })).toBeDisabled();
  await page.getByRole("checkbox", { name: "Markera konto 1111" }).check();
  await page.getByRole("button", { name: "Lägg till markerade (1)" }).click();
  await expect(page.getByRole("dialog", { name: "Bekräfta BAS-aktivering" })).toBeVisible();
  expect(await db.account.count({ where: { organizationId: org.id, accountNumber: "1111" } })).toBe(
    0
  );
  await page.getByRole("button", { name: "Bekräfta aktivering" }).click();
  await expect(page.getByText("1 konton aktiverade.")).toBeVisible();
  await open(page, org, "bookkeeping/vouchers/new");
  const account = page.getByRole("table").locator('input[id^="voucher-account-"]').first();
  await account.fill("1111");
  await expect(page.getByRole("option", { name: /^1111/ })).toBeVisible();
  await account.press("ArrowDown");
  await account.press("Enter");
  await expect(account).toHaveValue(/1111/);
  await account.fill("2080");
  await expect(page.getByText("Inga aktiva konton matchar sökningen.")).toBeVisible();
  expect(await db.account.count({ where: { organizationId: org.id, accountNumber: "2080" } })).toBe(
    0
  );
});

test("BAS K3 activation needs typed framework confirmation and never silently switches K2", async ({
  page
}) => {
  const org = await basWorkspace();
  await open(page, org, "registers/accounts");
  await page.getByRole("button", { name: "Ändra K-regelverk" }).click();
  const dialog = page.getByRole("dialog", { name: "Ändra K-regelverk" });
  await dialog.getByLabel("Regelverk").selectOption("K3");
  await expect(dialog.getByRole("button", { name: "Bekräfta K-regelverk" })).toBeDisabled();
  await dialog.getByLabel("Skriv företagsnamnet " + org.name).fill(org.name);
  await dialog.getByRole("button", { name: "Bekräfta K-regelverk" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Tillgängliga BAS-konton" }).click();
  await expect(page.getByRole("checkbox", { name: "Markera konto 2080" })).toBeEnabled();
  await page.getByRole("checkbox", { name: "Markera konto 2080" }).check();
  await page.getByRole("button", { name: "Lägg till markerade (1)" }).click();
  await page.getByRole("button", { name: "Bekräfta aktivering" }).click();
  await expect(page.getByText("1 konton aktiverade.")).toBeVisible();
  expect(
    await db.account.findFirst({ where: { organizationId: org.id, accountNumber: "2080" } })
  ).toMatchObject({ isActive: true });
  await page.getByRole("button", { name: "Ändra K-regelverk" }).click();
  await dialog.getByLabel("Regelverk").selectOption("K2");
  await dialog.getByLabel("Skriv företagsnamnet " + org.name).fill(org.name);
  await dialog.getByRole("button", { name: "Bekräfta K-regelverk" }).click();
  await expect(dialog.getByRole("alert")).toContainText("avstämning");
  expect(
    (await db.organization.findUniqueOrThrow({ where: { id: org.id } })).accountingFramework
  ).toBe("K3");
});

test("BAS optional activation stays in company A when switching the same catalog to B", async ({
  page
}) => {
  const companyA = await basWorkspace();
  const companyB = await onboardWorkspace("Synthetic BAS B " + randomUUID().slice(0, 8));
  expect(
    (
      await api.post("/api/accounts/catalog/provision", {
        data: {
          organizationId: companyB.id,
          versionId: companyA.catalogVersionId
        }
      })
    ).status()
  ).toBe(201);
  await open(page, companyA, "registers/accounts");
  await page.getByRole("button", { name: "Tillgängliga BAS-konton" }).click();
  await page.getByRole("button", { name: "Lägg till konto 1111", exact: true }).click();
  await page.getByRole("button", { name: "Bekräfta aktivering" }).click();
  await expect(page.getByText("1 konton aktiverade.")).toBeVisible();
  await page.getByRole("button", { name: "Aktiva konton", exact: true }).click();
  await expect(page.getByRole("cell", { name: "1111", exact: true })).toBeVisible();
  await selectOrg(page, companyB);
  await expect(page.getByRole("cell", { name: "1110", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "1111", exact: true })).toHaveCount(0);
  expect(
    await db.account.count({ where: { organizationId: companyB.id, accountNumber: "1111" } })
  ).toBe(0);
  await selectOrg(page, companyA);
  await expect(page.getByRole("cell", { name: "1111", exact: true })).toBeVisible();
});

test("BAS reconciliation and browser deactivation preserve posted lines and snapshots exactly", async ({
  page
}) => {
  const org = await basWorkspace();
  expect(
    (
      await api.post("/api/accounts", {
        data: {
          organizationId: org.id,
          number: "1930",
          name: "Synthetic bank",
          accountType: "ASSET"
        }
      })
    ).status()
  ).toBe(201);
  await open(page, org, "bookkeeping/vouchers/new");
  for (const [index, number] of ["1110", "1930"].entries()) {
    const input = page.getByRole("table").locator('input[id^="voucher-account-"]').nth(index);
    await input.fill(number);
    await page.getByRole("option", { name: new RegExp("^" + number) }).click();
  }
  await page.getByLabel("Debet rad 1").fill("123.45");
  await page.getByLabel("Kredit rad 2").fill("123.45");
  await page.getByLabel("Beskrivning", { exact: true }).fill("Synthetic BAS historical evidence");
  await page.getByRole("button", { name: "Bokför verifikation", exact: true }).click();
  await page.getByRole("button", { name: "Bekräfta bokföring" }).click();
  await expect(page.getByText("Bokförda belopp är låsta.", { exact: false })).toBeVisible();
  const id = page.url().split("/").at(-1)!;
  const original = await storedEntry(id);
  expect(
    original.lines.map((line) => [line.debitAmount.toFixed(2), line.creditAmount.toFixed(2)])
  ).toEqual([
    ["123.45", "0.00"],
    ["0.00", "123.45"]
  ]);
  expect(
    (
      await api.post("/api/accounts/catalog/provision", { data: { organizationId: org.id } })
    ).status()
  ).toBe(201);
  await open(page, org, "registers/accounts");
  await page.getByRole("button", { name: "Redigera konto 1110" }).click();
  await page.getByLabel("Kontot är aktivt").uncheck();
  await expect(page.getByRole("status")).toContainText("Historiska verifikationer");
  await page.getByRole("button", { name: "Spara ändringar" }).click();
  await expect(page.getByRole("cell", { name: "1110", exact: true })).toHaveCount(0);
  expect((await storedEntry(id)).lines).toEqual(original.lines);
  await open(page, org, "bookkeeping/vouchers/" + id);
  await expect(page.getByLabel("Debet rad 1")).toHaveValue("123.45");
  await expect(page.getByLabel("Debet rad 1")).toBeDisabled();
});

test("posting template create → use → change amount → normal posting", async ({ page }) => {
  const org = await onboardWorkspace("E2E template flow");
  await open(page, org, "bookkeeping/posting-templates");
  await page.getByLabel("Mallkod", { exact: true }).fill("RECURRING");
  await page.getByLabel("Mallnamn", { exact: true }).fill("Återkommande bankmall");
  await page.getByLabel("Verifikationstext", { exact: true }).fill("Mallförslag");
  for (const [index, number] of ["1930", "3000"].entries()) {
    const row = page.getByRole("group", { name: `Mallrad ${index + 1}` });
    await row.getByRole("combobox").first().fill(number);
    await page.getByRole("option", { name: new RegExp("^" + number) }).click();
  }
  await page
    .getByRole("group", { name: "Mallrad 2" })
    .getByLabel("Sida", { exact: true })
    .selectOption("CREDIT");
  await page.getByRole("button", { name: "Spara mall", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Konteringsmall sparad.");
  await page.goto("/app/bookkeeping/vouchers/new");
  await page.getByLabel("Mall", { exact: true }).selectOption({ label: "Återkommande bankmall" });
  await page.getByLabel("Ersätt raderna i utkastet").check();
  await page.getByRole("button", { name: "Använd mall", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Beskrivning", exact: true })).toHaveValue(
    "Mallförslag"
  );
  await page.getByLabel("Debet rad 1").fill("123.45");
  await page.getByLabel("Kredit rad 2").fill("123.45");
  await page.getByRole("button", { name: "Spara utkast", exact: true }).click();
  await expect(page).toHaveURL(/vouchers\/[0-9a-f-]+$/);
  const id = page.url().split("/").at(-1)!;
  await page.getByLabel("Debet rad 1").fill("234.56");
  await page.getByLabel("Kredit rad 2").fill("234.56");
  await page.getByRole("button", { name: "Bokför verifikation", exact: true }).click();
  await page.getByRole("button", { name: "Bekräfta bokföring" }).click();
  await expect(page.getByText("Bokförda belopp är låsta.", { exact: false })).toBeVisible();
  expect((await storedEntry(id)).lines[0]!.debitAmount.toFixed(2)).toBe("234.56");
});

test("SIE UI PC8 file → preview warnings → explicit confirm → report → binary export", async ({
  page
}) => {
  const org = await onboardWorkspace("E2E SIE UI");
  const source = await readFile("tests/fixtures/sie-spec-derived.pc8-escaped.txt", "ascii");
  const bytes = Buffer.from(
    source.replace(/\\x([a-f0-9]{2})/gi, (_match, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    ),
    "latin1"
  );
  await open(page, org, "settings/import-export");
  await page.getByLabel("Räkenskapsår för SIE", { exact: true }).selectOption(org.yearId);
  await page
    .getByLabel("SIE-fil", { exact: true })
    .setInputFiles({ name: "Årsfil.sie", mimeType: "application/octet-stream", buffer: bytes });
  await page.getByRole("button", { name: "Förhandsgranska SIE" }).click();
  await expect(page.getByRole("region", { name: "SIE-förhandsgranskning" })).toContainText(
    "Verifikationer: 1"
  );
  await expect(
    page.getByText("Imported VAT roles are unclassified and require manual review.", {
      exact: true
    })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Bekräfta import" })).toBeDisabled();
  expect(await db.journalEntry.count({ where: { organizationId: org.id } })).toBe(0);
  await page.getByLabel("Jag har granskat förhandsvisningen och vill importera filen.").check();
  await page.getByRole("button", { name: "Bekräfta import" }).click();
  await expect(page.getByRole("heading", { name: "Import slutförd" })).toBeVisible();
  expect(await db.sieImport.count({ where: { organizationId: org.id, status: "COMPLETED" } })).toBe(
    1
  );
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ladda ner SIE" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("ledgerapp.sie");
  const exported = validateIndependent(await readFile((await download.path())!));
  expect(exported.closing.get("1930")).toBe(101001n);
  await page.goto("/app/bookkeeping/vouchers");
  await expect(page.getByRole("table")).toContainText("Oberoende");
  await page.goto("/app/reports/trial-balance");
  await page.getByLabel("Räkenskapsår", { exact: true }).selectOption(org.yearId);
  await page.getByLabel("Från datum").fill("2026-01-01");
  await page.getByLabel("Till datum").fill("2026-12-31");
  await page.getByRole("button", { name: "Visa rapport" }).click();
  await expect(page.getByRole("row").filter({ hasText: "1930" })).toContainText("1010.01");
});

test("real draft attachment → posted voucher → global archive search → authorized download", async ({
  page
}) => {
  const org = await onboardWorkspace("E2E archive UI");
  await open(page, org, "bookkeeping/vouchers/new");
  await fillVoucher(page, "10.01");
  await page.getByRole("button", { name: "Spara utkast" }).click();
  await expect(page).toHaveURL(/vouchers\/[0-9a-f-]{36}$/);
  const entryId = page.url().split("/").at(-1)!;
  const bytes = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "Arkivkvitto.pdf", mimeType: "application/pdf", buffer: bytes });
  await expect(page.getByText("Arkivkvitto.pdf", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Bokför verifikation" }).click();
  await page.getByRole("button", { name: "Bekräfta bokföring" }).click();
  await expect(page.getByText("Bokförda belopp är låsta.", { exact: false })).toBeVisible();
  await page.goto("/app/bookkeeping/attachments");
  await page.getByLabel("Filnamn (minst 3 tecken)").fill("Arkivkvitto");
  await page.getByRole("button", { name: "Sök bilagor", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("Arkivkvitto.pdf");
  await expect(page.getByRole("table")).toContainText("Bokförd");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ladda ner Arkivkvitto.pdf" }).click();
  const downloaded = await downloading;
  expect(await readFile((await downloaded.path())!)).toEqual(bytes);
  await page.getByRole("link", { name: /A 1/ }).click();
  await expect(page).toHaveURL(new RegExp(entryId));
  await page.goto("/app/bookkeeping/attachments");
  await selectOrg(page, b);
  await expect(page.getByRole("table")).not.toContainText("Arkivkvitto.pdf");
});

async function onboardWorkspace(name: string): Promise<Organization> {
  const response = await api.post("/api/onboarding", {
    data: { setupKey: randomUUID(), name, startDate: year + "-01-01", endDate: year + "-12-31" }
  });
  expect(response.status()).toBe(201);
  const fixture = await response.json();
  const accounts = Object.fromEntries(
    (await db.account.findMany({ where: { organizationId: fixture.organization.id } })).map(
      (account) => [account.accountNumber, account.id]
    )
  );
  const series = await db.voucherSeries.findFirstOrThrow({
    where: { organizationId: fixture.organization.id }
  });
  return {
    id: fixture.organization.id,
    name,
    yearId: fixture.fiscalYear.id,
    seriesId: series.id,
    accounts
  };
}

test("voucher print report preserves values and correction links", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const org = await onboardWorkspace("E2E voucher report"),
    original = await posted(org, "123.01");
  const correction = await api.post(`/api/journal-entries/${original.id}/reverse`, {
    data: { transactionDate: date, voucherSeriesId: org.seriesId }
  });
  expect(correction.status()).toBe(201);
  await open(page, org, `reports/voucher/${original.id}`);
  await expect(page.getByRole("heading", { name: /Verifikationsrapport/ })).toBeVisible();
  await expect(page.getByRole("table").locator("tfoot")).toContainText("123.01");
  await expect(page.getByRole("link", { name: /Rättelseverifikation/ })).toBeVisible();
  await noPageOverflow(page, "voucher print report");
  await accessible(page);
  await page.screenshot({ path: testInfo.outputPath("voucher-report-mobile.png"), fullPage: true });
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Skriv ut / Spara PDF" })).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("link", { name: /Rättelseverifikation/ }).click();
  await expect(page.getByRole("link", { name: /Ursprunglig verifikation/ })).toBeVisible();
  await noPageOverflow(page, "posted correction detail");
  await page.screenshot({ path: testInfo.outputPath("voucher-detail-mobile.png"), fullPage: true });
});
test("Golden report CSV exports exact accounting totals and filter metadata", async ({ page }) => {
  await open(page, goldenOrg, "reports/trial-balance");
  await page.getByLabel("Räkenskapsår", { exact: true }).selectOption(goldenOrg.yearId);
  await page.getByLabel("Från datum").fill(golden.year.startDate);
  await page.getByLabel("Till datum").fill(golden.year.endDate);
  await page.getByRole("button", { name: "Visa rapport", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("13500.00");
  // Editing a filter without rerunning must not rewrite the export's metadata.
  await page.getByLabel("Till datum").fill("2026-06-30");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportera CSV", exact: true }).click();
  const csv = (await readFile((await (await downloading).path())!)).toString("utf8");
  expect(csv).toContain('"closingDebit";"13500.00"');
  expect(csv).toContain('"closingCredit";"13500.00"');
  expect(csv).toContain('"toDate";"2026-12-31"');
  expect(csv).toContain(goldenOrg.name);
  for (const [kind, exactRow] of [
    ["general-ledger", '"11000.00"'],
    ["income-statement", '"periodResult";"2000.00"'],
    ["balance-sheet", '"assets";"11000.00"'],
    ["vat", '"vatPosition";"0.00"']
  ]) {
    await open(page, goldenOrg, `reports/${kind}`);
    await page.getByLabel("Räkenskapsår", { exact: true }).selectOption(goldenOrg.yearId);
    if (kind === "balance-sheet") {
      await page.getByLabel("Rapportdatum").fill(golden.year.endDate);
      await page.getByLabel("Jämförelsedatum").fill("2026-06-30");
    } else {
      await page.getByLabel("Från datum").fill(golden.year.startDate);
      await page.getByLabel("Till datum").fill(golden.year.endDate);
    }
    await page.getByRole("button", { name: "Visa rapport", exact: true }).click();
    const exportButton = page.getByRole("button", { name: "Exportera CSV", exact: true });
    await expect(exportButton).toBeVisible();
    const fileEvent = page.waitForEvent("download");
    await exportButton.click();
    const bytes = await readFile((await (await fileEvent).path())!);
    const content = bytes.toString("utf8");
    expect(content).toContain(exactRow);
    expect(content).toContain(goldenOrg.name);
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    if (kind === "balance-sheet") expect(content).toContain('"comparisonDate";"2026-06-30"');
    await page.emulateMedia({ media: "print" });
    await expect(exportButton).toBeHidden();
    await expect(page.getByLabel("Räkenskapsår", { exact: true })).toBeHidden();
    await page.emulateMedia({ media: "screen" });
  }
});
test("Golden dashboard shows exact KPI chart period changes and no stale tenant values", async ({
  page
}) => {
  await open(page, goldenOrg, "");
  await expect(page.getByRole("article", { name: "Intäkter", exact: true })).toContainText(
    "4500.00 SEK"
  );
  await expect(page.getByRole("article", { name: "Kostnader", exact: true })).toContainText(
    "2500.00 SEK"
  );
  await expect(page.getByRole("article", { name: "Aktuellt resultat", exact: true })).toContainText(
    "2000.00 SEK"
  );
  await expect(
    page
      .getByRole("table", { name: "Verklig månadsutveckling" })
      .getByRole("row", { name: /2026-07/ })
  ).toContainText("-1500.00");
  await page.getByLabel("Dashboardperiod", { exact: true }).selectOption("custom");
  await page.getByLabel("Dashboard från datum").fill("2026-06-01");
  await page.getByLabel("Dashboard till datum").fill("2026-06-30");
  await expect(page.getByRole("article", { name: "Intäkter", exact: true })).toContainText(
    "-500.00 SEK"
  );
  await expect(page.getByRole("article", { name: "Aktuellt resultat", exact: true })).toContainText(
    "-500.00 SEK"
  );
  const blank = await onboardWorkspace("Dashboard empty company");
  await page.reload(); // reload organization list after server-side fixture creation
  await selectOrg(page, blank);
  await expect(page.getByRole("article", { name: "Intäkter", exact: true })).toContainText(
    "0.00 SEK"
  );
  await expect(
    page.getByText("Inga bokförda transaktioner i urvalet", { exact: true })
  ).toBeVisible();
  await expect(page.getByRole("article", { name: "Intäkter", exact: true })).not.toContainText(
    "4500.00"
  );
});
test("invitation UI → new user's registration → acceptance → read-only boundary", async ({
  page,
  browser
}) => {
  const org = await onboardWorkspace("Browser members");
  const email = randomUUID() + "@example.test";
  await open(page, org, "settings/members");
  await page.getByLabel("E-post", { exact: true }).fill(email);
  await page.getByLabel("Roll", { exact: true }).selectOption("READ_ONLY");
  await page.getByRole("button", { name: "Bjud in", exact: true }).click();
  const link = page.getByLabel("Endast utveckling/test: inbjudningslänk");
  await expect(link).toHaveValue(/#.{43}$/);
  const invitationPath = new URL(await link.inputValue());
  const context = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    viewport: { width: 390, height: 844 }
  });
  try {
    const recipient = await context.newPage();
    await recipient.goto(invitationPath.pathname + invitationPath.hash);
    await recipient.getByRole("link", { name: "Registrera dig" }).click();
    await recipient.getByLabel("Namn", { exact: true }).fill("Invited browser user");
    await recipient.getByLabel("E-postadress").fill(email);
    await recipient.locator('input[type="password"]').fill(password);
    await recipient.getByRole("button", { name: "Skapa konto", exact: true }).click();
    await expect(
      recipient.getByRole("button", { name: "Acceptera inbjudan", exact: true })
    ).toBeVisible();
    await noPageOverflow(recipient, "invitation acceptance");
    await accessible(recipient);
    await recipient.getByRole("button", { name: "Acceptera inbjudan", exact: true }).click();
    await expect(recipient).toHaveURL(/\/app$/);
    await recipient.goto("/settings/members");
    await expect(recipient.getByRole("table")).toContainText(email);
    await expect(recipient.getByRole("button", { name: "Bjud in", exact: true })).toHaveCount(0);
    const denied = await context.request.post(`/api/organizations/${org.id}/projects`, {
      data: { code: "DENIED", name: "Denied" }
    });
    expect(denied.status()).toBe(403);
    await page.reload();
    await expect(page.getByRole("table")).toContainText(email);
  } finally {
    await context.close();
  }
});
test("managed series UI → new voucher → sequential B1", async ({ page }) => {
  const org = await onboardWorkspace("Browser series");
  await open(page, org, "settings/voucher-series");
  await page.getByLabel("Seriekod").fill("B");
  await page.getByLabel("Serienamn").fill("Browser manual B");
  await page.getByRole("button", { name: "Spara serie", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("Browser manual B");
  await page.goto("/bookkeeping/vouchers/new");
  await fillVoucher(page, "100");
  await page.getByLabel("Serie", { exact: true }).selectOption({ label: "B — Browser manual B" });
  const posting = page.waitForResponse((r) => /\/journal-entries\/[^/]+\/post$/.test(r.url()));
  await page.getByRole("button", { name: "Bokför verifikation", exact: true }).click();
  await page.getByRole("button", { name: "Bekräfta bokföring" }).click();
  const result = await posting;
  expect(result.status()).toBe(201);
  expect(await result.json()).toMatchObject({ voucherNumber: 1, voucherSeries: { code: "B" } });
});
test("balanced IB UI → authoritative trial balance and balance sheet", async ({ page }) => {
  const org = await onboardWorkspace("Browser IB");
  await open(page, org, "settings/opening-balances");
  await page.getByLabel("IB debet 1930").fill("1000,00");
  await page.getByLabel("IB kredit 2091").fill("1000,00");
  await page.getByRole("button", { name: "Spara ingående balans" }).click();
  await expect(page.getByText("Ingående balans sparad.")).toBeVisible();
  await page.goto("/reports/trial-balance");
  await page.getByLabel("Räkenskapsår", { exact: true }).selectOption(org.yearId);
  await page.getByLabel("Från datum").fill(year + "-01-01");
  await page.getByLabel("Till datum").fill(year + "-12-31");
  await page.getByRole("button", { name: "Visa rapport", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("1000.00");
  const response = await api.get(
    `/api/reports/balance-sheet?organizationId=${org.id}&fiscalYear=${org.yearId}&reportDate=${year}-12-31`
  );
  expect(response.status()).toBe(200);
  expect((await response.json()).totals.assets).toBe("1000.00");
});
test("carry-forward UI preview and confirmation → balanced target IB", async ({ page }) => {
  const org = await onboardWorkspace("Browser carry");
  const base = `/api/organizations/${org.id}`;
  const current = await (await api.get(`${base}/opening-balances?fiscalYear=${org.yearId}`)).json();
  expect(
    (
      await api.post(`${base}/opening-balances`, {
        data: {
          fiscalYearId: org.yearId,
          expectedFingerprint: current.fingerprint,
          rows: [
            { accountId: org.accounts["1930"], debit: "1000", credit: "0" },
            { accountId: org.accounts["2091"], debit: "0", credit: "1000" }
          ]
        }
      })
    ).status()
  ).toBe(201);
  await posted(org, "100");
  for (const period of await db.accountingPeriod.findMany({ where: { fiscalYearId: org.yearId } }))
    expect(
      (
        await api.post(`/api/accounting-periods/${period.id}/lock`, {
          data: { organizationId: org.id, confirm: true }
        })
      ).status()
    ).toBe(201);
  expect(
    (
      await api.post(`/api/fiscal-years/${org.yearId}/close`, {
        data: { organizationId: org.id, confirm: true }
      })
    ).status()
  ).toBe(201);
  const next = String(Number(year) + 1);
  const target = await (
    await api.post("/api/fiscal-years", {
      data: {
        organizationId: org.id,
        name: next,
        startDate: next + "-01-01",
        endDate: next + "-12-31"
      }
    })
  ).json();
  await open(page, org, "settings/opening-balances");
  await page.getByLabel("Källår").selectOption(org.yearId);
  await page.getByLabel("Målår").selectOption(target.id);
  await page.getByLabel("Resultatkonto i eget kapital").selectOption(org.accounts["2091"]!);
  await page.getByRole("button", { name: "Förhandsgranska årsöverföring" }).click();
  await expect(page.getByText("Totalt debet 1100.00 · kredit 1100.00")).toBeVisible();
  await page.getByRole("button", { name: "Bekräfta årsöverföring", exact: true }).click();
  await page.getByRole("button", { name: "Genomför årsöverföring", exact: true }).click();
  await expect(page.getByText(/Årsöverföringen är bekräftad/)).toBeVisible();
  const tb = await api.get(
    `/api/reports/trial-balance?organizationId=${org.id}&fiscalYear=${target.id}&fromDate=${next}-01-01&toDate=${next}-12-31`
  );
  expect(tb.status()).toBe(200);
  expect((await tb.json()).totals.closingDebit).toBe("1100.00");
});
test("dimension register UI → typeahead → posted snapshots → report and SIE", async ({ page }) => {
  const org = await onboardWorkspace("Browser dimensions");
  for (const [kind, code, name] of [
    ["projects", "P_UI", "Östprojekt"],
    ["cost-centers", "K_UI", "Ängelholm"]
  ]) {
    await open(page, org, `registers/${kind}`);
    await page.getByLabel("Kod", { exact: true }).fill(code!);
    await page.getByLabel("Namn", { exact: true }).fill(name!);
    await page.getByRole("button", { name: "Spara registerpost" }).click();
    await expect(page.getByRole("table")).toContainText(name!);
  }
  await page.goto("/bookkeeping/vouchers/new");
  await fillVoucher(page, "100");
  await page.getByLabel("Projekt rad 1").fill("Öst");
  await page.getByRole("option", { name: "P_UI · Östprojekt" }).click();
  await page.getByLabel("Kostnadsställe rad 1").fill("Ängel");
  await page.getByRole("option", { name: "K_UI · Ängelholm" }).click();
  const posting = page.waitForResponse((r) => /\/journal-entries\/[^/]+\/post$/.test(r.url()));
  await page.getByRole("button", { name: "Bokför verifikation", exact: true }).click();
  await page.getByRole("button", { name: "Bekräfta bokföring" }).click();
  const response = await posting;
  expect(response.status()).toBe(201);
  const entry = await response.json();
  expect((await storedEntry(entry.id)).lines[0]?.projectSnapshot).toMatchObject({
    code: "P_UI",
    name: "Östprojekt"
  });
  await page.goto("/reports/general-ledger");
  await page.getByLabel("Räkenskapsår", { exact: true }).selectOption(org.yearId);
  await page.getByLabel("Från datum").fill(year + "-01-01");
  await page.getByLabel("Till datum").fill(year + "-12-31");
  await page.getByLabel("Projekt", { exact: true }).fill("P_UI");
  await page.getByRole("option", { name: "P_UI · Östprojekt" }).click();
  await page.getByRole("button", { name: "Visa rapport", exact: true }).click();
  await expect(
    page.getByRole("article").filter({ hasText: "1930 — Bank" }).getByRole("table")
  ).toContainText("100.00");
  const sie = await api.get(`/api/exports/sie?organizationId=${org.id}&fiscalYear=${org.yearId}`);
  expect(sie.status()).toBe(200);
  const parsed = parseSie4(await sie.body());
  expect(parsed.errors).toEqual([]);
  expect(parsed.objects).toEqual(
    expect.arrayContaining([
      { dimension: "6", id: "P_UI", name: "Östprojekt" },
      { dimension: "1", id: "K_UI", name: "Ängelholm" }
    ])
  );
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
  await page.getByLabel("Momsmetadata rad 1").click();
  await page.getByLabel("Momsmetadata rad 2").click();
  await page.getByLabel("Momsroll rad 1").selectOption("BASE");
  await page.getByLabel("Momsroll rad 2").selectOption("TAX");
  const posting = page.waitForResponse((r) => r.url().endsWith(`/journal-entries/${id}/post`));
  await page.getByRole("button", { name: "Bokför verifikation", exact: true }).click();
  await page.getByRole("button", { name: "Bekräfta bokföring" }).click();
  expect((await posting).status()).toBe(201);
  const stored = await storedEntry(id);
  expect(stored.lines[0]!.vatRole).toBe("BASE");
  expect(stored.lines[1]!.vatRole).toBe("TAX");
  expect(stored.lines[1]!.vatSnapshot).toMatchObject({
    rate: "25.00",
    configurationVersion: "SE-DOMESTIC-2026-01"
  });
  await page.goto("/app/reports/vat");
  await page.getByLabel("Räkenskapsår", { exact: true }).selectOption(org.yearId);
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
  await page.getByLabel("Räkenskapsår", { exact: true }).selectOption(goldenOrg.yearId);
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
  await expect(page.getByLabel("Räkenskapsår", { exact: true })).toHaveValue(b.yearId);
});

test("browser registration, persisted cookies, logout home and protected redirect", async ({
  page,
  context
}, testInfo) => {
  await context.clearCookies();
  await page.goto("/register");
  await page.getByLabel("Namn").fill("Browser user");
  await page.getByLabel("E-postadress").fill(randomUUID() + "@example.test");
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Skapa konto", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByLabel("Företagsnamn")).toBeVisible();
  await noPageOverflow(page, "onboarding");
  await accessible(page);
  await page.screenshot({ path: testInfo.outputPath("onboarding-mobile.png"), fullPage: true });
  await page.getByLabel("Företagsnamn").fill("Browser starter company");
  await page.getByLabel("Organisationsnummer").fill("556123-4567");
  await page.getByRole("button", { name: "Skapa arbetsyta" }).click();
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
      local: Object.keys(localStorage).filter(
        (key) =>
          key !== "ledgerapp:active-organization" && !key.startsWith("ledgerapp:fiscal-year:")
      ),
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
  await page.getByRole("button", { name: "Bekräfta bokföring" }).evaluate((button) => {
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
  await page.getByRole("button", { name: "Bekräfta bokföring" }).click();
  await expect(page.getByText("Bokförda belopp är låsta.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Debet rad 1")).toBeDisabled();
  expect((await storedEntry(id)).lines[0]!.debitAmount.toFixed(2)).toBe("250.00");
});

test("organization accounts and vouchers switch without old tenant data", async ({ page }) => {
  await open(page, a, "registers/accounts");
  await expect(page.getByRole("table").getByText("E2E A-1930", { exact: true })).toBeVisible();
  await selectOrg(page, b);
  await expect(page.getByRole("table").getByText("E2E B-1930", { exact: true })).toBeVisible();
  await expect(page.getByRole("table").getByText("E2E A-1930", { exact: true })).toHaveCount(0);
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
    await page.getByLabel("Räkenskapsår", { exact: true }).selectOption(reports.yearId);
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
    await expect(page.getByLabel("Räkenskapsår", { exact: true })).toHaveValue(b.yearId);
    await expect(page.locator("article")).toHaveCount(0);
  }
});

test("late report response cannot overwrite new organization's cleared state", async ({ page }) => {
  await open(page, reports, "reports/income-statement");
  await page.getByLabel("Räkenskapsår", { exact: true }).selectOption(reports.yearId);
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
  await expect(page.getByLabel("Räkenskapsår", { exact: true })).toHaveValue(b.yearId);
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
  await page.getByRole("button", { name: "Bekräfta bokföring" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/locked|låst/i);
  expect((await storedEntry(entry.id)).status).toBe("DRAFT");
});

test("real 400 / 403 / 404 boundaries plus explicit injected 500 and network UX", async ({
  page
}) => {
  test.setTimeout(120_000);
  // The expanded synthetic BAS suite adds legitimate organization/year reads.
  // Reserve a real limiter window before this error-boundary test; do not mock
  // successful reads, relax API throttling or retry any accounting write.
  const readWindow = await api.get(`/api/fiscal-years?organizationId=${a.id}`);
  if (
    readWindow.status() === 429 ||
    Number(readWindow.headers()["x-ratelimit-remaining"] ?? 100) < 10
  ) {
    // Individual hit expirations can return only a few slots at the advertised
    // reset. One complete TTL frees the window without weakening the API limiter.
    await new Promise((resolve) => setTimeout(resolve, 60_000));
    expect((await api.get(`/api/fiscal-years?organizationId=${a.id}`)).status()).toBe(200);
  } else expect(readWindow.status()).toBe(200);
  expect(
    (await api.post("/api/accounts", { data: { organizationId: a.id, number: "bad" } })).status()
  ).toBe(400);
  expect((await api.get("/api/journal-entries/" + randomUUID())).status()).toBe(404);
  const ownerId = ((await (await api.get("/api/auth/me")).json()) as { user: { id: string } }).user
    .id;
  // A read-only fixture must retain another real owner; never bypass the
  // database's last-owner invariant to manufacture authorization tests.
  const remainingOwner = await db.user.create({
    data: { email: `${randomUUID()}@example.test`, displayName: "Remaining browser fixture owner" }
  });
  await db.organizationMember.create({
    data: { organizationId: b.id, userId: remainingOwner.id, role: "OWNER" }
  });
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
  await page.getByLabel("Räkenskapsår", { exact: true }).selectOption(a.yearId);
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
const reviewRoutes = [
  ["bookkeeping/vouchers", "Verifikationer"],
  ["bookkeeping/vouchers/new", "Ny verifikation"],
  ["bookkeeping/posting-templates", "Konteringsmallar"],
  ["bookkeeping/attachments", "Bilagor"],
  ["reports/general-ledger", "Huvudbok"],
  ["reports/trial-balance", "Saldobalans"],
  ["reports/voucher-list", "Verifikationslista"],
  ["reports/income-statement", "Resultaträkning"],
  ["reports/balance-sheet", "Balansräkning"],
  ["reports/vat", "Momsrapport"],
  ["registers/accounts", "Konton"],
  ["registers/projects", "Projekt"],
  ["registers/cost-centers", "Kostnadsställen"],
  ["settings/organization", "Företag"],
  ["settings/fiscal-years", "Räkenskapsår"],
  ["settings/opening-balances", "Ingående balans"],
  ["settings/voucher-series", "Verifikationsserier"],
  ["settings/users", "Användare"],
  ["settings/import-export", "Import / export"],
  ["settings/processing-history", "Behandlingshistorik"]
] as const;

async function noPageOverflow(page: Page, route: string) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    route
  ).toBe(true);
}
async function accessible(page: Page) {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map((n) => ({ target: n.target, summary: n.failureSummary }))
    }))
  ).toEqual([]);
}

for (const width of [1440, 1024, 768, 390]) {
  test(`premium workspace routes, keyboard navigation and reports at ${width}px`, async ({
    page
  }, testInfo) => {
    test.setTimeout(180_000);
    // This route sweep is intentionally faster than normal human use. Reserve a
    // real read window; never disable the API limiter or retry accounting writes.
    const probe = await api.get(`/api/fiscal-years?organizationId=${goldenOrg.id}`);
    const remaining = probe.headers()["x-ratelimit-remaining"];
    if (probe.status() === 429 || (remaining !== undefined && Number(remaining) < 30)) {
      const seconds = Number(
        probe.headers()["retry-after"] ?? probe.headers()["x-ratelimit-reset"] ?? 60
      );
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(60, Math.max(1, seconds)) * 1000)
      );
      expect((await api.get(`/api/fiscal-years?organizationId=${goldenOrg.id}`)).status()).toBe(
        200
      );
    } else expect(probe.status()).toBe(200);
    await page.setViewportSize({ width, height: 1000 });
    await open(page, goldenOrg, "");
    await expect(
      page.getByRole("heading", { name: "Översikt", exact: true, level: 1 })
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Ekonomisk översikt" })).toBeVisible();
    await noPageOverflow(page, "dashboard");
    await accessible(page);
    await page.screenshot({ path: testInfo.outputPath("dashboard.png"), fullPage: true });
    for (const [route, label] of reviewRoutes) {
      if (width < 1024) {
        await page.getByRole("button", { name: "Öppna navigering" }).click();
        const drawer = page.getByRole("dialog", { name: "Navigering" });
        await expect(drawer).toBeVisible();
        await page.keyboard.press("Tab");
        expect(await drawer.evaluate((d) => d.contains(document.activeElement))).toBe(true);
        await drawer.getByRole("link", { name: label, exact: true }).click();
        await expect(drawer).not.toBeVisible();
      } else {
        await page
          .locator("aside.app-sidebar")
          .getByRole("link", { name: label, exact: true })
          .click();
      }
      await expect(page).toHaveURL(new RegExp("/app/" + route + "$"));
      await expect(page.locator("main h1")).toHaveCount(1);
      await expect(page.getByText(/^Hämtar/i)).toHaveCount(0);
      await noPageOverflow(page, route);
      await page.screenshot({
        path: testInfo.outputPath(route.replaceAll("/", "-") + "-review.png"),
        fullPage: true
      });
      if (route === "bookkeeping/vouchers/new") {
        await fillVoucher(page, "10.01", "3010");
        await expect(page.getByLabel("Debet rad 1")).toHaveCSS("min-width", "112px");
        await expect(page.getByLabel("Kredit rad 2")).toHaveCSS("min-width", "112px");
        await page.getByRole("button", { name: "Bokför verifikation", exact: true }).click();
        const confirmation = page.getByRole("dialog", { name: "Bokför verifikationen?" });
        await expect(confirmation).toContainText("10,01");
        await confirmation.getByRole("button", { name: "Avbryt", exact: true }).click();
        await expect(page.getByLabel("Debet rad 1")).toHaveValue("10.01");
        await page
          .getByRole("button", { name: "Spara utkast", exact: true })
          .scrollIntoViewIfNeeded();
        await expect(
          page.getByRole("button", { name: "Spara utkast", exact: true })
        ).toBeInViewport();
      }
      if (
        [
          "registers/accounts",
          "bookkeeping/vouchers/new",
          "settings/import-export",
          "settings/users"
        ].includes(route)
      ) {
        await accessible(page);
        await page.screenshot({
          path: testInfo.outputPath(route.replaceAll("/", "-") + ".png"),
          fullPage: true
        });
      }
      if (
        [
          "reports/general-ledger",
          "reports/trial-balance",
          "reports/income-statement",
          "reports/balance-sheet",
          "reports/vat"
        ].includes(route)
      ) {
        await page.getByLabel("Räkenskapsår", { exact: true }).selectOption(goldenOrg.yearId);
        if (route === "reports/balance-sheet")
          await page.getByLabel("Rapportdatum").fill(year + "-12-31");
        else {
          await page.getByLabel("Från datum").fill(year + "-01-01");
          await page.getByLabel("Till datum").fill(year + "-12-31");
        }
        const loaded = page.waitForResponse(
          (r) => r.url().includes("/api/reports/") && r.status() === 200
        );
        await page.getByRole("button", { name: "Visa rapport" }).click();
        await loaded;
        await expect(page.getByRole("button", { name: "Exportera CSV" })).toBeVisible();
        await noPageOverflow(page, route + " loaded");
        await page.screenshot({
          path: testInfo.outputPath(route.replaceAll("/", "-") + "-loaded.png"),
          fullPage: true
        });
        if (route === "reports/trial-balance") {
          await accessible(page);
          await page.screenshot({ path: testInfo.outputPath("trial-balance.png"), fullPage: true });
          await page.emulateMedia({ media: "print" });
          await expect(page.locator("aside.app-sidebar")).not.toBeVisible();
          await expect(page.getByRole("table")).toBeVisible();
          await page.emulateMedia({ media: "screen" });
        }
      }
    }
    if (width < 1024) {
      const opener = page.getByRole("button", { name: "Öppna navigering" });
      await opener.click();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Navigering" })).not.toBeVisible();
      await expect(opener).toBeFocused();
    } else {
      await page.getByRole("button", { name: "Fäll ihop navigering" }).click();
      await expect(page.getByRole("button", { name: "Expandera navigering" })).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem("ledgerapp:sidebar:v1"))).toBe(
        "collapsed"
      );
    }
  });
}

test("public landing and authentication remain usable and accessible on mobile", async ({
  browser,
  baseURL
}, testInfo) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    for (const route of ["/", "/login", "/register"]) {
      await page.goto(route);
      await expect(page.locator("h1")).toHaveCount(1);
      await noPageOverflow(page, route);
      await accessible(page);
      await page.screenshot({
        path: testInfo.outputPath(route === "/" ? "home.png" : route.slice(1) + ".png"),
        fullPage: true
      });
    }
    await expect(page.getByRole("button", { name: "Skapa konto", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Visa lösenord" }).click();
    await expect(page.getByLabel("Lösenord", { exact: true })).toHaveAttribute("type", "text");
  } finally {
    await context.close();
  }
});
