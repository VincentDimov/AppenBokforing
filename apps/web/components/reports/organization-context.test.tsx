jest.mock("@/lib/use-fiscal-years", () => ({
  useFiscalYears: () => ({
    selected: "",
    error: "",
    years: [
      { id: "year", name: "2026", status: "OPEN", startDate: "2026-01-01", endDate: "2026-12-31" }
    ]
  })
}));
import { act, fireEvent, render, screen } from "@testing-library/react";
import { GeneralLedgerPage } from "./general-ledger-page";
import { IncomeStatementPage } from "./income-statement-page";
import { BalanceSheetPage } from "./balance-sheet-page";
import { VatReportPage } from "./vat-report-page";
import { TrialBalancePage } from "./trial-balance-page";
import { deferred, jsonResponse } from "@/test/accounting-fixtures";

let organizationId = "org-a";
jest.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ activeOrganizationId: organizationId })
}));
const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
const originalFetch = global.fetch;
const cases = [
  GeneralLedgerPage,
  IncomeStatementPage,
  BalanceSheetPage,
  VatReportPage,
  TrialBalancePage
];
function fixture(marker: string) {
  return {
    fiscalYear: { id: "year", name: "2026" },
    reportDate: "2026-10-06",
    comparisonDate: null,
    accounts: [
      {
        id: "account",
        number: "1930",
        name: marker,
        openingDebit: "0.00",
        openingCredit: "0.00",
        periodDebit: "1.00",
        periodCredit: "0.00",
        closingDebit: "1.00",
        closingCredit: "0.00",
        account: { id: "account", number: "1930", name: marker },
        transactions: [],
        openingBalance: "0.00",
        closingBalance: "1.00"
      }
    ],
    groups: [
      {
        key: "group",
        label: marker,
        accounts: [],
        total: "1.00",
        comparisonTotal: "0.00",
        periodTotal: "1.00",
        yearToDateTotal: "1.00"
      }
    ],
    codes: [
      {
        code: "VAT",
        name: marker,
        type: "INPUT",
        rate: "25",
        inputAmount: "1.00",
        outputAmount: "0.00"
      }
    ],
    anomalies: [],
    totals: {
      openingDebit: "0.00",
      openingCredit: "0.00",
      periodDebit: "1.00",
      periodCredit: "1.00",
      closingDebit: "1.00",
      closingCredit: "1.00",
      assets: "1.00",
      equityAndLiabilities: "1.00",
      difference: "0.00",
      periodResult: "1.00",
      yearToDateResult: "1.00",
      inputVat: "1.00",
      outputVat: "0.00",
      vatPosition: "1.00"
    }
  };
}
function runReport() {
  fireEvent.change(screen.getByLabelText("Räkenskapsår"), { target: { value: "year" } });
  for (const label of ["Från datum", "Till datum", "Rapportdatum"]) {
    const input = screen.queryByLabelText(label);
    if (input) fireEvent.change(input, { target: { value: "2026-10-06" } });
  }
  fireEvent.click(screen.getByRole("button", { name: "Visa rapport" }));
}
beforeEach(() => {
  organizationId = "org-a";
  fetchMock.mockReset();
  global.fetch = fetchMock;
});
afterAll(() => {
  global.fetch = originalFetch;
});

describe.each(cases)("organization-bound %p", (Page) => {
  it("immediately removes A's report and disables stale print/export when switched to B", async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture("Report-A")));
    const view = render(<Page />);
    runReport();
    await screen.findByText(/Report-A/);
    organizationId = "org-b";
    view.rerender(<Page />);
    expect(screen.queryByText(/Report-A/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Räkenskapsår")).toHaveValue("");
    for (const button of screen.queryAllByRole("button", { name: /CSV|Skriv ut/ })) {
      expect(button).toBeDisabled();
    }
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
  it("aborts old requests and ignores a late A response after B has loaded", async () => {
    const pending = deferred<Response>();
    fetchMock.mockImplementation(async (url) =>
      String(url).includes("organizationId=org-a")
        ? pending.promise
        : jsonResponse(fixture("Report-B"))
    );
    const view = render(<Page />);
    runReport();
    organizationId = "org-b";
    view.rerender(<Page />);
    runReport();
    await screen.findByText(/Report-B/);
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    await act(async () => pending.resolve(jsonResponse(fixture("Report-A"))));
    expect(screen.queryByText(/Report-A/)).not.toBeInTheDocument();
    expect(screen.getByText(/Report-B/)).toBeInTheDocument();
  });
  it("ignores out-of-order requests within the same organization", async () => {
    const pending = deferred<Response>();
    fetchMock
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(jsonResponse(fixture("Latest")));
    render(<Page />);
    runReport();
    runReport();
    await screen.findByText(/Latest/);
    await act(async () => pending.resolve(jsonResponse(fixture("Obsolete"))));
    expect(screen.queryByText(/Obsolete/)).not.toBeInTheDocument();
  });
});
