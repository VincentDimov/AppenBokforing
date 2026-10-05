import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FiscalYears } from "./fiscal-years";
jest.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ activeOrganizationId: "org", activeOrganization: { role: mockRole } })
}));
let mockRole = "OWNER";
const years = [
  {
    id: "year",
    name: "2026",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    status: "OPEN",
    accountingPeriods: [
      {
        id: "period",
        periodNumber: 1,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        status: "OPEN"
      }
    ]
  }
];
describe("fiscal years confirmation", () => {
  beforeEach(() => {
    mockRole = "OWNER";
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
    };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => years });
  });
  it("does not lock on the first click, and sends explicit confirmation only after acceptance", async () => {
    render(<FiscalYears />);
    fireEvent.click(await screen.findByRole("button", { name: "Lås period" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Lås period" }));
    fireEvent.click(screen.getByRole("button", { name: "Bekräfta" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/accounting-periods/period/lock",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ confirm: true, organizationId: "org" })
        })
      )
    );
  });
  it("allows read-only users to see the calendar without write controls", async () => {
    mockRole = "READ_ONLY";
    render(<FiscalYears />);
    await screen.findByText("2026 · Öppet");
    expect(screen.queryByRole("button", { name: "Lås period" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skapa räkenskapsår" })).not.toBeInTheDocument();
  });
});
