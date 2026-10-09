import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountsPage } from "./accounts-page";
import type { CatalogItem } from "@/lib/api/bas-catalog";
let role = "OWNER";
jest.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ activeOrganization: { id: "org-synthetic", name: "Synthetic company", role } })
}));
const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(),
  original = global.fetch;
let items: CatalogItem[],
  framework = "K2";
const response = (payload: unknown) =>
  ({ ok: true, status: 200, json: async () => payload }) as Response;
beforeEach(() => {
  role = "OWNER";
  framework = "K2";
  items = [
    {
      accountId: "local-1900",
      catalogAccountId: "catalog-1900",
      number: "1900",
      name: "Synthetic default",
      officialName: "Synthetic default",
      accountType: "ASSET",
      category: "GROUP_ACCOUNT",
      accountGroup: "19",
      groupName: "Synthetic group",
      parentAccountNumber: null,
      isK2Restricted: false,
      active: true,
      provenanceId: "catalog-1900",
      vatCode: null
    },
    {
      accountId: null,
      catalogAccountId: "catalog-1911",
      number: "1911",
      name: "Synthetic optional",
      officialName: "Synthetic optional",
      accountType: "ASSET",
      category: "SUBACCOUNT",
      accountGroup: "19",
      groupName: "Synthetic group",
      parentAccountNumber: "1900",
      isK2Restricted: false,
      active: false,
      provenanceId: null,
      vatCode: null
    },
    {
      accountId: null,
      catalogAccountId: "catalog-2080",
      number: "2080",
      name: "Synthetic restricted",
      officialName: "Synthetic restricted",
      accountType: "EQUITY",
      category: "MAIN_ACCOUNT",
      accountGroup: "20",
      groupName: "Synthetic group",
      parentAccountNumber: null,
      isK2Restricted: true,
      active: false,
      provenanceId: null,
      vatCode: null
    }
  ];
  fetchMock.mockReset();
  global.fetch = fetchMock;
  fetchMock.mockImplementation(async (url, init) => {
    if (String(url).startsWith("/api/accounts/catalog?")) {
      const params = new URL(String(url), "http://localhost").searchParams;
      const tab = params.get("tab");
      return response({
        framework,
        catalog: {
          id: "version-synthetic",
          version: "SYNTHETIC-ONLY",
          sourceVersion: "fixture",
          totalAccounts: 3
        },
        blockedReason: null,
        items: items.filter((row) =>
          tab === "active" ? row.active : tab === "available" ? !row.active : true
        ),
        total: 3,
        page: 1,
        pageSize: 50,
        counts: {
          active: items.filter((row) => row.active).length,
          available: items.filter((row) => !row.active).length,
          main: 2,
          sub: 1
        }
      });
    }
    if (url === "/api/accounts/catalog/activation-preview")
      return response({
        selected: 1,
        alreadyActive: 0,
        canAdd: 1,
        notAllowed: 0,
        rows: [
          {
            id: "catalog-1911",
            number: "1911",
            name: "Synthetic optional",
            alreadyActive: false,
            allowed: true,
            reason: null
          }
        ]
      });
    if (url === "/api/accounts/catalog/activate") {
      items = items.map((row) =>
        row.number === "1911" ? { ...row, active: true, accountId: "local-1911" } : row
      );
      return response({ activated: 1 });
    }
    if (url === "/api/accounts/catalog/framework") {
      framework = JSON.parse(String(init?.body)).framework;
      return response({ framework });
    }
    throw new Error(`Unexpected synthetic request ${url}`);
  });
});
afterAll(() => {
  global.fetch = original;
});
it("shows real catalog counts, filters and the reviewed parent relationship", async () => {
  render(<AccountsPage />);
  await screen.findByText("Synthetic default");
  fireEvent.click(screen.getByRole("button", { name: "Alla BAS-konton" }));
  expect(await screen.findByText(/tillhör 1900/)).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Markera konto 2080" })).toBeDisabled();
  expect(screen.getByText(/Huvud- och gruppkonton: 2/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Kontoklass"), { target: { value: "8" } });
  await waitFor(() =>
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("accountClass=8"),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  );
});
it("requires server preview and explicit confirmation before a bulk write", async () => {
  render(<AccountsPage />);
  await screen.findByText("Synthetic default");
  fireEvent.click(screen.getByRole("button", { name: "Tillgängliga BAS-konton" }));
  await screen.findByText("Synthetic optional");
  fireEvent.click(screen.getByRole("checkbox", { name: "Markera konto 1911" }));
  fireEvent.click(screen.getByRole("button", { name: "Lägg till markerade (1)" }));
  await screen.findByRole("dialog", { name: "Bekräfta BAS-aktivering" });
  expect(fetchMock.mock.calls.some(([url]) => url === "/api/accounts/catalog/activate")).toBe(
    false
  );
  expect(screen.getByText(/Kan läggas till: 1/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Bekräfta aktivering" }));
  await screen.findByText("1 konton aktiverade.");
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/accounts/catalog/activate",
    expect.objectContaining({
      body: JSON.stringify({ organizationId: "org-synthetic", catalogAccountIds: ["catalog-1911"] })
    })
  );
});
it("hides writes and framework administration from read-only users", async () => {
  role = "READ_ONLY";
  render(<AccountsPage />);
  await screen.findByText("Synthetic default");
  expect(screen.queryByRole("button", { name: "Nytt konto" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ändra K-regelverk" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Lägg till markerade/ })).not.toBeInTheDocument();
});
it("requires a typed organization name for explicit K3 configuration", async () => {
  render(<AccountsPage />);
  await screen.findByText("Synthetic default");
  fireEvent.click(screen.getByRole("button", { name: "Ändra K-regelverk" }));
  fireEvent.change(screen.getByLabelText("Regelverk"), { target: { value: "K3" } });
  expect(screen.getByRole("button", { name: "Bekräfta K-regelverk" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Skriv företagsnamnet Synthetic company"), {
    target: { value: "Synthetic company" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Bekräfta K-regelverk" }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/accounts/catalog/framework",
      expect.objectContaining({
        body: JSON.stringify({
          organizationId: "org-synthetic",
          framework: "K3",
          confirmation: "Synthetic company"
        })
      })
    )
  );
});
