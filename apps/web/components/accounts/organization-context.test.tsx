import { act, render, screen } from "@testing-library/react";
import { AccountsPage } from "./accounts-page";
import { VoucherListPage } from "../journal-entries/voucher-list-page";
import { demoEntry, deferred, jsonResponse } from "@/test/accounting-fixtures";

let organizationId = "org-a";
jest.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    activeOrganizationId: organizationId,
    organizationsStatus: "ready",
    activeOrganization: { id: organizationId, name: organizationId, role: "OWNER" }
  })
}));
const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
const originalFetch = global.fetch;
function fixture(Page: typeof AccountsPage, marker: string) {
  return Page === AccountsPage
    ? [
        {
          id: "account",
          name: marker,
          number: "1930",
          organizationId,
          active: true,
          accountType: "ASSET",
          normalBalance: "DEBIT",
          vatCode: null,
          description: null,
          createdAt: "",
          updatedAt: ""
        }
      ]
    : [{ ...demoEntry, organizationId, description: marker }];
}
beforeEach(() => {
  organizationId = "org-a";
  fetchMock.mockReset();
  global.fetch = fetchMock;
});
afterAll(() => {
  global.fetch = originalFetch;
});

describe.each([AccountsPage, VoucherListPage])("organization-bound list %p", (Page) => {
  it("removes loaded A rows as soon as B is selected", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(fixture(Page, organizationId === "org-a" ? "Row-A" : "Row-B"))
    );
    const view = render(<Page />);
    await screen.findByText("Row-A");
    organizationId = "org-b";
    view.rerender(<Page />);
    expect(screen.queryByText("Row-A")).not.toBeInTheDocument();
    await screen.findByText("Row-B");
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
  it("ignores late A rows after B has loaded", async () => {
    const pending = deferred<Response>();
    fetchMock.mockImplementation(async (url) =>
      String(url).includes("organizationId=org-a")
        ? pending.promise
        : jsonResponse(fixture(Page, "Row-B"))
    );
    const view = render(<Page />);
    organizationId = "org-b";
    view.rerender(<Page />);
    await screen.findByText("Row-B");
    await act(async () => pending.resolve(jsonResponse(fixture(Page, "Row-A"))));
    expect(screen.queryByText("Row-A")).not.toBeInTheDocument();
    expect(screen.getByText("Row-B")).toBeInTheDocument();
  });
});
