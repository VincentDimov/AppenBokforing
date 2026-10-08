import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OpeningBalancesPage } from "./opening-balances-page";
jest.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ activeOrganization: { id: "org", role: "OWNER" } })
}));
jest.mock("@/lib/use-fiscal-years", () => ({
  useFiscalYears: () => ({
    selected: "year",
    select: jest.fn(),
    years: [{ id: "year", name: "2026", status: "OPEN" }],
    error: ""
  })
}));
describe("opening balance editor", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          url.includes("opening-balances")
            ? {
                fingerprint: "abc",
                editable: true,
                accounts: [
                  { id: "bank", accountNumber: "1930", name: "Bank" },
                  { id: "equity", accountNumber: "2091", name: "Kapital" }
                ],
                rows: []
              }
            : []
      })
    );
  });
  it("requires exact balance before saving and sends the reviewed fingerprint", async () => {
    render(<OpeningBalancesPage />);
    const debit = await screen.findByLabelText("IB debet 1930");
    fireEvent.change(debit, { target: { value: "10.01" } });
    expect(screen.getByRole("button", { name: "Spara ingående balans" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("IB kredit 2091"), { target: { value: "10.01" } });
    fireEvent.click(screen.getByRole("button", { name: "Spara ingående balans" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/organizations/org/opening-balances",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"expectedFingerprint":"abc"')
        })
      )
    );
  });
  it("rejects a two-sided row even when totals match", async () => {
    render(<OpeningBalancesPage />);
    fireEvent.change(await screen.findByLabelText("IB debet 1930"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("IB kredit 1930"), { target: { value: "10" } });
    expect(screen.getByRole("button", { name: "Spara ingående balans" })).toBeDisabled();
  });
});
