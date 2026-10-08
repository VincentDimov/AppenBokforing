jest.mock("@/lib/use-fiscal-years", () => ({
  useFiscalYears: () => ({
    selected: "",
    error: "",
    years: [
      {
        id: "golden-year",
        name: "2026",
        status: "OPEN",
        startDate: "2026-01-01",
        endDate: "2026-12-31"
      }
    ]
  })
}));
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TrialBalancePage } from "./trial-balance-page";
import { goldenAccounting as golden } from "../../../../tests/fixtures/accounting-golden";
import { jsonResponse } from "@/test/accounting-fixtures";

jest.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ activeOrganizationId: "golden-org", activeOrganization: { name: "Golden" } })
}));
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});
function run() {
  fireEvent.change(screen.getByLabelText("Räkenskapsår"), { target: { value: "golden-year" } });
  fireEvent.change(screen.getByLabelText("Från datum"), {
    target: { value: golden.year.startDate }
  });
  fireEvent.change(screen.getByLabelText("Till datum"), { target: { value: golden.year.endDate } });
  fireEvent.click(screen.getByRole("button", { name: "Visa rapport" }));
}
it("renders the six Golden account sides and totals without client arithmetic", async () => {
  const fetchMock = jest.fn().mockResolvedValue(
    jsonResponse({
      fiscalYear: { id: "golden-year", name: golden.year.name },
      fromDate: golden.year.startDate,
      toDate: golden.year.endDate,
      accounts: golden.expected.accounts.map((a) => ({
        ...a,
        id: a.number,
        name: golden.accounts.find((c) => c.number === a.number)!.name
      })),
      totals: golden.expected.fullYearTotals
    })
  );
  global.fetch = fetchMock;
  render(<TrialBalancePage />);
  run();
  const table = await screen.findByRole("table");
  expect(within(table).getByRole("row", { name: /1930 Bank/ })).toHaveTextContent("11000.00");
  const total = within(table).getByRole("row", { name: /Totalt/ });
  expect(
    within(total)
      .getAllByRole("cell")
      .map((cell) => cell.textContent)
  ).toEqual(["12000.00", "12000.00", "16000.00", "16000.00", "13500.00", "13500.00"]);
  expect(String(fetchMock.mock.calls[0][0])).toContain("organizationId=golden-org");
});
it("shows invalid-IB errors without displaying a report", async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValue(
      jsonResponse({ message: "Fiscal-year opening debit and credit totals do not balance." }, 422)
    );
  render(<TrialBalancePage />);
  run();
  expect(await screen.findByRole("alert")).toHaveTextContent("do not balance");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
