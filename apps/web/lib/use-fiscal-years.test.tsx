import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FiscalYearProvider, useFiscalYears } from "./use-fiscal-years";
import { deferred, jsonResponse } from "@/test/accounting-fixtures";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  localStorage.clear();
});
function Consumer({ org, label }: { org: string; label: string }) {
  const years = useFiscalYears(org);
  return <p aria-label={label}>{years.activeYear?.name ?? "Inget år"}</p>;
}
it("shares one calendar request across shell consumers", async () => {
  const fetchMock = jest.fn().mockResolvedValue(
    jsonResponse([
      {
        id: "a-year",
        name: "År A",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "OPEN"
      }
    ])
  );
  global.fetch = fetchMock;
  render(
    <FiscalYearProvider organizationId="a">
      <Consumer org="a" label="Toppbar" />
      <Consumer org="a" label="Rapport" />
    </FiscalYearProvider>
  );
  await waitFor(() => expect(screen.getByLabelText("Rapport")).toHaveTextContent("År A"));
  expect(screen.getByLabelText("Toppbar")).toHaveTextContent("År A");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("clears tenant state immediately and ignores a late previous-tenant calendar", async () => {
  const pending = deferred<Response>();
  global.fetch = jest.fn().mockImplementation((url) =>
    String(url).endsWith("=a")
      ? pending.promise
      : Promise.resolve(
          jsonResponse([
            {
              id: "b-year",
              name: "År B",
              startDate: "2026-01-01",
              endDate: "2026-12-31",
              status: "OPEN"
            }
          ])
        )
  );
  const view = render(
    <FiscalYearProvider organizationId="a">
      <Consumer org="a" label="År" />
    </FiscalYearProvider>
  );
  view.rerender(
    <FiscalYearProvider organizationId="b">
      <Consumer org="b" label="År" />
    </FiscalYearProvider>
  );
  expect(screen.getByLabelText("År")).toHaveTextContent("Inget år");
  await waitFor(() => expect(screen.getByLabelText("År")).toHaveTextContent("År B"));
  await act(async () =>
    pending.resolve(
      jsonResponse([
        {
          id: "a-year",
          name: "År A",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          status: "OPEN"
        }
      ])
    )
  );
  expect(screen.getByLabelText("År")).toHaveTextContent("År B");
});
it("reloads calendar metadata only after an explicit invalidation event", async () => {
  const fetchMock = jest.fn().mockResolvedValue(jsonResponse([]));
  global.fetch = fetchMock;
  render(
    <FiscalYearProvider organizationId="a">
      <Consumer org="a" label="År" />
    </FiscalYearProvider>
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  act(() => window.dispatchEvent(new Event("ledgerapp:fiscal-years-changed")));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
});
it("makes a failed calendar read recoverable without automatic retry or mutation", async () => {
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ message: "ThrottlerException" })
    })
    .mockResolvedValue(jsonResponse([]));
  global.fetch = fetchMock;
  function RetryConsumer() {
    const value = useFiscalYears("a");
    return (
      <div>
        <p role="alert">{value.error}</p>
        <button onClick={value.retry}>Läs igen</button>
      </div>
    );
  }
  render(
    <FiscalYearProvider organizationId="a">
      <RetryConsumer />
    </FiscalYearProvider>
  );
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("För många försök"));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Läs igen" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByRole("alert")).toBeEmptyDOMElement());
  expect(fetchMock.mock.calls.every(([, init]) => !init.method || init.method === "GET")).toBe(
    true
  );
});
