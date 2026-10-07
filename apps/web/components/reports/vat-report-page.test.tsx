import { fireEvent, render, screen } from "@testing-library/react";
import { VatReportPage } from "./vat-report-page";
import { vatGolden } from "../../../../tests/fixtures/vat-golden";
import { jsonResponse } from "@/test/accounting-fixtures";
jest.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ activeOrganizationId: "vat-org" })
}));
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});
it("renders literal Golden bases/taxes/period and insists on review", async () => {
  global.fetch = jest.fn().mockResolvedValue(
    jsonResponse({
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
      codes: [],
      anomalies: [],
      totals: vatGolden.totals,
      swedishReturn: {
        configurationVersion: "SE-DOMESTIC-2026-01",
        warnings: ["Unsupported scenario requires review"],
        boxes: []
      }
    })
  );
  render(<VatReportPage />);
  fireEvent.change(screen.getByLabelText("Räkenskapsår"), { target: { value: "year" } });
  fireEvent.change(screen.getByLabelText("Från datum"), { target: { value: "2026-01-01" } });
  fireEvent.change(screen.getByLabelText("Till datum"), { target: { value: "2026-01-31" } });
  fireEvent.click(screen.getByRole("button", { name: "Visa rapport" }));
  expect(await screen.findByText("4000.00")).toBeInTheDocument();
  expect(screen.getByText("490.00")).toBeInTheDocument();
  expect(screen.getByText("250.00")).toBeInTheDocument();
  expect(screen.getByText("240.00")).toBeInTheDocument();
  expect(screen.getByText(/Period: 2026-01-01/)).toHaveTextContent("Granskning krävs");
  expect(screen.getByRole("alert")).toHaveTextContent("Unsupported scenario");
});
