import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OnboardingPage } from "./onboarding-page";
const refresh = jest.fn();
const replace = jest.fn();
jest.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ refresh }) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
describe("onboarding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      value: () => "b4250280-41ed-4ab3-83aa-6880a91d4656"
    });
  });
  it("persists and activates the real organization before navigating", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ organization: { id: "new-org" } }) });
    render(<OnboardingPage />);
    fireEvent.change(screen.getByLabelText("Företagsnamn"), { target: { value: "Nytt bolag" } });
    fireEvent.click(screen.getByRole("button", { name: "Skapa arbetsyta" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(localStorage.getItem("ledgerapp:active-organization")).toBe("new-org");
    expect(replace).toHaveBeenCalledWith("/app");
  });
  it("keeps input and shows API rejection", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({ message: "Ogiltigt räkenskapsår" }) });
    render(<OnboardingPage />);
    fireEvent.change(screen.getByLabelText("Företagsnamn"), { target: { value: "Bevara mig" } });
    fireEvent.click(screen.getByRole("button", { name: "Skapa arbetsyta" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Företagsnamn")).toHaveValue("Bevara mig");
    expect(replace).not.toHaveBeenCalled();
  });
});
