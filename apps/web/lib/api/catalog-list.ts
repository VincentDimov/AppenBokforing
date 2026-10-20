import { workspaceRequest } from "@/lib/workspace-api";
import type { CatalogResult } from "./bas-catalog";

export type CatalogListResult = Omit<CatalogResult, "page" | "pageSize">;
const pageSize = 100;
const maxPages = 200; // The existing API's validated page limit.
const concurrency = 3;
const changedMessage = "Kontoplanen ändrades under hämtningen. Försök igen.";

/** Keep bounded API reads, but expose one complete ordered list to the UI. */
export async function loadCatalogList(
  query: URLSearchParams,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void
): Promise<CatalogListResult> {
  function checkAborted() {
    if (signal.aborted) throw new DOMException("Avbruten hämtning", "AbortError");
  }
  async function read(page: number) {
    checkAborted();
    const params = new URLSearchParams(query);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    const result = await workspaceRequest<CatalogResult>(`/accounts/catalog?${params}`, { signal });
    checkAborted();
    if (
      result.page !== page ||
      result.pageSize !== pageSize ||
      !Number.isInteger(result.total) ||
      result.total < 0 ||
      result.total > pageSize * maxPages ||
      !Array.isArray(result.items) ||
      result.items.length !== Math.min(pageSize, Math.max(0, result.total - (page - 1) * pageSize))
    )
      throw new Error(changedMessage);
    return result;
  }

  const first = await read(1);
  const items = [...first.items];
  const pages = Math.ceil(first.total / pageSize);
  onProgress(items.length, first.total);
  for (let page = 2; page <= pages; page += concurrency) {
    // Bounded concurrency avoids a request burst for large custom charts.
    const batch = await Promise.all(
      Array.from({ length: Math.min(concurrency, pages - page + 1) }, (_, i) => read(page + i))
    );
    for (const result of batch) {
      if (
        result.total !== first.total ||
        result.catalog?.id !== first.catalog?.id ||
        result.framework !== first.framework ||
        result.counts.active !== first.counts.active ||
        result.counts.available !== first.counts.available ||
        result.counts.main !== first.counts.main ||
        result.counts.sub !== first.counts.sub
      )
        throw new Error(changedMessage);
      items.push(...result.items);
    }
    checkAborted();
    onProgress(items.length, first.total);
  }
  if (new Set(items.map((row) => row.number)).size !== first.total) throw new Error(changedMessage);
  return {
    framework: first.framework,
    catalog: first.catalog,
    blockedReason: first.blockedReason,
    counts: first.counts,
    total: first.total,
    items
  };
}
