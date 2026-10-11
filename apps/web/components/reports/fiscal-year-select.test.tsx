import { fireEvent, render, screen } from "@testing-library/react";
import { FiscalYearSelect } from "./fiscal-year-select";
const retry = jest.fn();
let error = "För många försök. Vänta en stund och försök igen.";
jest.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ activeOrganizationId: "a" })
}));
jest.mock("@/lib/use-fiscal-years", () => ({
  useFiscalYears: () => ({ years: [], selected: "", error, retry })
}));
beforeEach(() => {
  error = "För många försök. Vänta en stund och försök igen.";
  retry.mockClear();
});
it("disables an empty failed selector and offers explicit read-only recovery", () => {
  render(<FiscalYearSelect value="" onChange={jest.fn()} />);
  expect(screen.getByLabelText("Räkenskapsår")).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("För många försök");
  fireEvent.click(screen.getByRole("button", { name: "Läs räkenskapsår igen" }));
  expect(retry).toHaveBeenCalledTimes(1);
});
it("does not offer a retry for a successfully loaded empty calendar", () => {
  error = "";
  render(<FiscalYearSelect value="" onChange={jest.fn()} />);
  expect(screen.getByLabelText("Räkenskapsår")).toBeDisabled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
