import { act, renderHook, waitFor } from "@testing-library/react";
import { useAccountBalances } from "./use-account-balances";
import { deferred, jsonResponse } from "@/test/accounting-fixtures";

const originalFetch = global.fetch;
const fetchMock = jest.fn();
const result = (url: string, balance = "12000.25") => {
  const q = new URL(url, "http://local.test").searchParams;
  return {
    organizationId: q.get("organizationId"),
    fiscalYearId: q.get("fiscalYearId"),
    date: q.get("date"),
    accounts: q
      .get("accountIds")!
      .split(",")
      .map((accountId) => ({ accountId, balance }))
  };
};
beforeEach(() => {
  global.fetch = fetchMock;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url) => jsonResponse(result(String(url))));
});
afterAll(() => {
  global.fetch = originalFetch;
});

it("deduplicates rows and does not refetch when only input array identity changes", async () => {
  const view = renderHook(
    ({ ids }) => useAccountBalances("org-a", "year-a", "2026-06-01", ids, "draft"),
    { initialProps: { ids: ["bank", "bank"] } }
  );
  await waitFor(() => expect(view.result.current.values.get("bank")).toBe("12 000,25"));
  view.rerender({ ids: ["bank"] });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0][0])).toContain("accountIds=bank");
});

it("hides old date/tenant balances immediately and ignores a late aborted response", async () => {
  const late = deferred<Response>();
  fetchMock.mockImplementationOnce(() => late.promise);
  const view = renderHook(
    ({ org, date }) => useAccountBalances(org, "year-a", date, ["bank"], "draft"),
    { initialProps: { org: "org-a", date: "2026-06-01" } }
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const firstUrl = String(fetchMock.mock.calls[0][0]);
  view.rerender({ org: "org-b", date: "2026-07-01" });
  expect(view.result.current.values.size).toBe(0);
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  await waitFor(() => expect(view.result.current.values.get("bank")).toBe("12 000,25"));
  await act(async () => late.resolve(jsonResponse(result(firstUrl, "999999.99"))));
  expect(view.result.current.values.get("bank")).toBe("12 000,25");
});

it.each(["-3000.25", "9007199254740993.99"])(
  "keeps signed/large amount %s exact",
  async (balance) => {
    fetchMock.mockImplementation(async (url) => jsonResponse(result(String(url), balance)));
    const view = renderHook(() =>
      useAccountBalances("org-a", "year-a", "2026-06-01", ["bank"], "draft")
    );
    await waitFor(() =>
      expect(view.result.current.values.get("bank")).toBe(
        balance.startsWith("-") ? "−3 000,25" : "9 007 199 254 740 993,99"
      )
    );
  }
);

it("reports errors rather than fabricating zero and supports explicit refresh", async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ message: "Unavailable" }, 503));
  const view = renderHook(() =>
    useAccountBalances("org-a", "year-a", "2026-06-01", ["bank"], "draft")
  );
  await waitFor(() => expect(view.result.current.error).not.toBe(""));
  expect(view.result.current.values.size).toBe(0);
  act(() => view.result.current.refresh());
  await waitFor(() => expect(view.result.current.values.get("bank")).toBe("12 000,25"));
});

it("rejects responses for the wrong tenant", async () => {
  fetchMock.mockImplementation(async (url) =>
    jsonResponse({ ...result(String(url)), organizationId: "foreign" })
  );
  const view = renderHook(() =>
    useAccountBalances("org-a", "year-a", "2026-06-01", ["bank"], "draft")
  );
  await waitFor(() => expect(view.result.current.error).not.toBe(""));
  expect(view.result.current.values.size).toBe(0);
});

it("batches at most 100 account identities per request", async () => {
  const ids = Array.from({ length: 201 }, (_, i) => `account-${i}`);
  const view = renderHook(() => useAccountBalances("org-a", "year-a", "2026-06-01", ids, "draft"));
  await waitFor(() => expect(view.result.current.values.size).toBe(201));
  expect(fetchMock).toHaveBeenCalledTimes(3);
  for (const [url] of fetchMock.mock.calls)
    expect(
      new URL(String(url), "http://local.test").searchParams.get("accountIds")!.split(",").length
    ).toBeLessThanOrEqual(100);
});

it("does not request without a resolved fiscal year or selected account", () => {
  const view = renderHook(() => useAccountBalances("org-a", undefined, "2026-06-01", [], "draft"));
  expect(view.result.current.loading).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});
