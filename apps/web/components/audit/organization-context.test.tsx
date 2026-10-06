import { act, render, screen } from "@testing-library/react";
import { ProcessingHistory } from "./processing-history";
import { FiscalYears } from "../fiscal-years/fiscal-years";
import { deferred, jsonResponse } from "@/test/accounting-fixtures";

let organizationId = "org-a";
jest.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ activeOrganizationId: organizationId, activeOrganization: { role: "OWNER" } })
}));
const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
const originalFetch = global.fetch;
const fixture = (Page: typeof FiscalYears, marker: string) =>
  Page === FiscalYears
    ? [
        {
          id: "year",
          name: marker,
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          status: "OPEN",
          accountingPeriods: []
        }
      ]
    : {
        page: 1,
        hasMore: false,
        events: [
          {
            id: "event",
            timestamp: "2026-10-06T00:00:00Z",
            actor: { displayName: marker },
            actorUserId: "actor",
            action: "POST",
            entityType: "JOURNAL_ENTRY",
            entityId: "entry",
            metadata: {},
            requestId: "request"
          }
        ]
      };
beforeEach(() => {
  organizationId = "org-a";
  fetchMock.mockReset();
  global.fetch = fetchMock;
});
afterAll(() => {
  global.fetch = originalFetch;
});
describe.each([FiscalYears, ProcessingHistory])("organization-bound settings %p", (Page) => {
  it("removes A data immediately on organization switch", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(fixture(Page, organizationId === "org-a" ? "Context-A" : "Context-B"))
    );
    const view = render(<Page />);
    await screen.findByText(/Context-A/);
    organizationId = "org-b";
    view.rerender(<Page />);
    expect(screen.queryByText(/Context-A/)).not.toBeInTheDocument();
    await screen.findByText(/Context-B/);
  });
  it("ignores a late A response after B has loaded", async () => {
    const pending = deferred<Response>();
    fetchMock.mockImplementation(async (url) =>
      String(url).includes("organizationId=org-a")
        ? pending.promise
        : jsonResponse(fixture(Page, "Context-B"))
    );
    const view = render(<Page />);
    organizationId = "org-b";
    view.rerender(<Page />);
    await screen.findByText(/Context-B/);
    await act(async () => pending.resolve(jsonResponse(fixture(Page, "Context-A"))));
    expect(screen.queryByText(/Context-A/)).not.toBeInTheDocument();
    expect(screen.getByText(/Context-B/)).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
