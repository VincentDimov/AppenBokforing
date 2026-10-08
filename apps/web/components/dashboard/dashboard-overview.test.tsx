import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { DashboardOverview, barWidth, type DashboardData } from "./dashboard-overview";
import { workspaceRequest } from "@/lib/workspace-api";
let org = "org-a",
  role = "OWNER";
jest.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ activeOrganizationId: org, activeOrganization: { id: org, name: org, role } })
}));
jest.mock("@/lib/use-fiscal-years", () => ({
  useFiscalYears: () => ({
    selected: "year",
    years: [{ id: "year", name: "2026" }],
    activeYear: { id: "year", name: "2026", startDate: "2026-01-01", endDate: "2026-12-31" },
    select: jest.fn(),
    error: ""
  })
}));
jest.mock("@/lib/workspace-api", () => ({ workspaceRequest: jest.fn() }));
const request = jest.mocked(workspaceRequest);
function data(organizationId = "org-a"): DashboardData {
  return {
    organizationId,
    fiscalYear: { id: "year", name: "2026" },
    fromDate: "2026-01-01",
    toDate: "2026-12-31",
    kpis: {
      revenue: "4500.00",
      expenses: "2500.00",
      result: "2000.00",
      inputVat: "0.00",
      outputVat: "0.00",
      vatPosition: "0.00",
      drafts: 1,
      posted: 7
    },
    vatStatus: { anomalies: 0, warnings: [], configurationVersion: "test" },
    chart: [{ month: "2026-06", revenue: "-500.00", expenses: "0.00", result: "-500.00" }],
    recent: [],
    hasOpeningBalances: false,
    generatedAt: "2026-10-08"
  };
}
beforeEach(() => {
  org = "org-a";
  role = "OWNER";
  request.mockReset();
});
it("renders exact server values and actual chart, no demo metrics", async () => {
  request.mockResolvedValue(data());
  render(<DashboardOverview />);
  expect(
    within(await screen.findByRole("region", { name: "Ekonomisk översikt" })).getByText(
      "4500.00 SEK"
    )
  ).toBeVisible();
  expect(screen.getByRole("table")).toHaveTextContent("-500.00");
  expect(screen.queryByText("Exempeldata")).toBeNull();
  expect(screen.getByRole("link", { name: "Ny verifikation" })).toBeVisible();
  expect(barWidth("-9007199254740993.01", 900719925474099301n)).toBe("100.00%");
});
it("read-only role has no mutation quick actions; request errors are visible", async () => {
  role = "READ_ONLY";
  request.mockRejectedValue(new Error("Rapportfel"));
  render(<DashboardOverview />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Rapportfel");
  expect(screen.queryByRole("link", { name: "Ny verifikation" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Importera SIE" })).toBeNull();
});
it("organization and period changes discard late data and old KPIs", async () => {
  let complete: (value: DashboardData) => void = () => {};
  request
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        })
    )
    .mockResolvedValue(data("org-b"));
  const view = render(<DashboardOverview />);
  org = "org-b";
  view.rerender(<DashboardOverview />);
  await screen.findByText("4500.00 SEK");
  expect(request.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  await act(async () => complete({ ...data(), kpis: { ...data().kpis, revenue: "888888.00" } }));
  expect(screen.queryByText("888888.00 SEK")).toBeNull();
  fireEvent.change(screen.getByLabelText("Dashboardperiod"), { target: { value: "custom" } });
  expect(screen.queryByText("4500.00 SEK")).toBeNull();
});
