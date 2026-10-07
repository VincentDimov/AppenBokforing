import type { JournalEntry } from "@/lib/api/journal-entries";

export const demoEntry: JournalEntry = {
  version: 1,
  id: "entry-a",
  organizationId: "org-a",
  status: "DRAFT",
  source: "MANUAL",
  description: "Original draft",
  transactionDate: "2026-10-06",
  accountingPeriod: {
    id: "period-a",
    periodNumber: 10,
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    status: "OPEN"
  },
  fiscalYear: {
    id: "year-a",
    name: "2026",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    status: "OPEN"
  },
  voucherSeries: { id: "series-a", code: "A", name: "Manual" },
  voucherNumber: null,
  createdAt: "2026-10-06T00:00:00Z",
  updatedAt: "2026-10-06T00:00:00Z",
  postedAt: null,
  reversedByEntry: null,
  reversedByEntryId: null,
  reversesEntry: null,
  reversesEntryId: null,
  totals: { debit: "1000.00", credit: "1000.00", difference: "0.00" },
  lines: [0, 1].map((index) => ({
    id: `line-${index}`,
    lineNumber: index + 1,
    account: {
      id: `account-${index}`,
      number: index ? "3001" : "1930",
      name: index ? "Sales" : "Bank"
    },
    debit: index ? "0.00" : "1000.00",
    credit: index ? "1000.00" : "0.00",
    description: null,
    project: null,
    costCenter: null,
    vatCode: null
  }))
};
export const demoOptions = {
  accountingPeriod: demoEntry.accountingPeriod,
  fiscalYear: demoEntry.fiscalYear,
  voucherSeries: [demoEntry.voucherSeries!]
};
export function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body } as Response;
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
