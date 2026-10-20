import { loadCatalogList } from "./catalog-list";
import type { CatalogItem, CatalogResult } from "./bas-catalog";
import { workspaceRequest } from "@/lib/workspace-api";

jest.mock("@/lib/workspace-api", () => ({ workspaceRequest: jest.fn() }));
const request = jest.mocked(workspaceRequest);
const query = new URLSearchParams({
  organizationId: "org-a",
  tab: "all",
  q: "Test",
  sort: "name-desc"
});
function fixture(page: number, total = 1282): CatalogResult {
  return {
    framework: "K3",
    catalog: { id: "catalog-a", version: "TEST", sourceVersion: "TEST", totalAccounts: total },
    blockedReason: null,
    page,
    pageSize: 100,
    total,
    counts: { active: 0, available: total, main: 0, sub: total },
    items: Array.from(
      { length: Math.min(100, Math.max(0, total - (page - 1) * 100)) },
      (_, i) =>
        ({
          number: String(1000 + (page - 1) * 100 + i)
        }) as CatalogItem
    )
  };
}
beforeEach(() => request.mockReset());
function mockPages(total = 1282) {
  request.mockImplementation(async (path) =>
    fixture(Number(new URL(path, "http://localhost").searchParams.get("page")), total)
  );
}
it("loads all 1282 rows in API order and preserves every filter on every request", async () => {
  mockPages();
  const progress = jest.fn();
  const result = await loadCatalogList(query, new AbortController().signal, progress);
  expect(result.items).toHaveLength(1282);
  expect(result.items.at(-1)?.number).toBe("2281");
  expect(request).toHaveBeenCalledTimes(13);
  for (const [path, init] of request.mock.calls) {
    const params = new URL(path, "http://localhost").searchParams;
    for (const [key, value] of query) expect(params.get(key)).toBe(value);
    expect(params.get("pageSize")).toBe("100");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  }
  expect(progress).toHaveBeenLastCalledWith(1282, 1282);
  expect(query.has("page")).toBe(false);
});
it("handles empty and single-batch charts without extra requests", async () => {
  mockPages(0);
  expect((await loadCatalogList(query, new AbortController().signal, jest.fn())).items).toEqual([]);
  expect(request).toHaveBeenCalledTimes(1);
  request.mockClear();
  mockPages(5);
  expect(
    (await loadCatalogList(query, new AbortController().signal, jest.fn())).items
  ).toHaveLength(5);
  expect(request).toHaveBeenCalledTimes(1);
});
it("never runs more than three batch requests concurrently", async () => {
  let active = 0;
  let peak = 0;
  request.mockImplementation(async (path) => {
    active++;
    peak = Math.max(peak, active);
    await Promise.resolve();
    active--;
    return fixture(Number(new URL(path, "http://localhost").searchParams.get("page")), 450);
  });
  expect(
    (await loadCatalogList(query, new AbortController().signal, jest.fn())).items
  ).toHaveLength(450);
  expect(peak).toBe(3);
});
it("does not start or publish further reads after cancellation", async () => {
  const controller = new AbortController();
  request.mockImplementation(async () => {
    controller.abort();
    return fixture(1);
  });
  const progress = jest.fn();
  await expect(loadCatalogList(query, controller.signal, progress)).rejects.toHaveProperty(
    "name",
    "AbortError"
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(progress).not.toHaveBeenCalled();
});
it.each(["total", "version", "framework", "counts", "duplicates", "incomplete"])(
  "rejects %s changes rather than showing a partial or mixed list",
  async (change) => {
    request.mockImplementation(async (path) => {
      const page = Number(new URL(path, "http://localhost").searchParams.get("page"));
      const result = fixture(page, 205);
      if (page === 2) {
        if (change === "total") result.total = 204;
        if (change === "version") result.catalog!.id = "catalog-b";
        if (change === "framework") result.framework = "K2";
        if (change === "counts") result.counts.active = 1;
        if (change === "duplicates") result.items = fixture(1, 205).items;
        if (change === "incomplete") result.items.pop();
      }
      return result;
    });
    await expect(loadCatalogList(query, new AbortController().signal, jest.fn())).rejects.toThrow(
      /ändrades/
    );
  }
);
it("keeps server errors explicit and never returns the first page as the full list", async () => {
  request.mockResolvedValueOnce(fixture(1, 205)).mockRejectedValue(new Error("429 read limit"));
  await expect(loadCatalogList(query, new AbortController().signal, jest.fn())).rejects.toThrow(
    "429 read limit"
  );
});
it("rejects unbounded totals before starting any additional requests", async () => {
  request.mockResolvedValue(fixture(1, 20001));
  await expect(loadCatalogList(query, new AbortController().signal, jest.fn())).rejects.toThrow(
    /ändrades/
  );
  expect(request).toHaveBeenCalledTimes(1);
});
