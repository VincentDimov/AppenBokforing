import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MembersPage } from "./members-page";
import { VoucherSeriesPage } from "./voucher-series-page";
import { DimensionsPage } from "./dimensions-page";
import { jsonResponse } from "@/test/accounting-fixtures";
let role = "OWNER";
jest.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    activeOrganization: { id: "org-a", role, name: "Company" },
    reloadOrganizations: jest.fn()
  })
}));
jest.mock("@/lib/use-fiscal-years", () => ({
  useFiscalYears: () => ({
    years: [{ id: "year-a", name: "2026", status: "OPEN" }],
    selected: "year-a",
    activeYear: { status: "OPEN" },
    error: "",
    select: jest.fn()
  })
}));
const originalFetch = global.fetch;
const fetchMock = jest.fn();
beforeEach(() => {
  role = "OWNER";
  fetchMock.mockReset();
  global.fetch = fetchMock;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
    init?.method
      ? jsonResponse({})
      : jsonResponse(url.endsWith("/members") ? { members: [], invitations: [] } : [])
  );
});
afterAll(() => {
  global.fetch = originalFetch;
});
it.each([MembersPage, VoucherSeriesPage, () => <DimensionsPage kind="projects" />])(
  "hides write flows for read-only users",
  async (Component) => {
    role = "READ_ONLY";
    render(<Component />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  }
);
it("invites through the scoped API and labels dev delivery honestly", async () => {
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
    jsonResponse(
      init?.method
        ? { developmentInvitationUrl: "http://localhost/invitations/accept#secret" }
        : { members: [], invitations: [] }
    )
  );
  render(<MembersPage />);
  fireEvent.change(screen.getByLabelText("E-post", { exact: true }), {
    target: { value: "invite@example.test" }
  });
  fireEvent.change(screen.getByLabelText("Roll", { exact: true }), {
    target: { value: "READ_ONLY" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Bjud in" }));
  await screen.findByLabelText("Endast utveckling/test: inbjudningslänk");
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/organizations/org-a/invitations",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ email: "invite@example.test", role: "READ_ONLY" })
    })
  );
});
it("creates a series without accepting an arbitrary counter", async () => {
  render(<VoucherSeriesPage />);
  fireEvent.change(screen.getByLabelText("Seriekod"), { target: { value: "B" } });
  fireEvent.change(screen.getByLabelText("Serienamn"), { target: { value: "Manual" } });
  fireEvent.click(screen.getByRole("button", { name: "Spara serie" }));
  await screen.findByText("Serien sparad.");
  const mutation = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
  expect(mutation[0]).toBe("/api/organizations/org-a/voucher-series");
  expect(JSON.parse(mutation[1].body)).toEqual({
    fiscalYearId: "year-a",
    code: "B",
    name: "Manual",
    description: ""
  });
});
it("creates a tenant dimension with safe metadata through the API", async () => {
  render(<DimensionsPage kind="cost-centers" />);
  fireEvent.change(screen.getByLabelText("Kod", { exact: true }), { target: { value: "K_1" } });
  fireEvent.change(screen.getByLabelText("Namn", { exact: true }), { target: { value: "Öst" } });
  fireEvent.click(screen.getByRole("button", { name: "Spara registerpost" }));
  await screen.findByText("Registerpost sparad.");
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/organizations/org-a/cost-centers",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ code: "K_1", name: "Öst", description: "" })
    })
  );
});
