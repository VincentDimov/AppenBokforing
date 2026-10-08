import { fireEvent, render, screen } from "@testing-library/react";
import { VoucherReport } from "./voucher-report";
import { getJournalEntry } from "@/lib/api/journal-entries";

jest.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ activeOrganizationId: "org-a", activeOrganization: { name: "Företaget" } })
}));
jest.mock("@/lib/api/journal-entries", () => ({ getJournalEntry: jest.fn() }));
jest.mock("@/lib/api/attachments", () => ({ getJournalEntryAttachments: jest.fn(async () => []) }));
const request = jest.mocked(getJournalEntry);
const entry = {
  id: "technical-voucher-id",
  organizationId: "org-a",
  description: "Kundbetalning",
  status: "POSTED",
  voucherSeries: { code: "A" },
  voucherNumber: 1,
  fiscalYear: { name: "2026", startDate: "2026-01-01", endDate: "2026-12-31" },
  transactionDate: "2026-02-01",
  createdAt: "2026-02-01T12:00:00Z",
  postedAt: "2026-02-01T12:00:01Z",
  lines: [],
  totals: { debit: "123.01", credit: "123.01" }
} as unknown as Awaited<ReturnType<typeof getJournalEntry>>;
beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue(entry);
});

it("shows human status and exact totals while keeping technical IDs behind disclosure", async () => {
  render(<VoucherReport id={entry.id} />);
  await screen.findByText("Bokförd");
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Verifikationsrapport · A 1");
  expect(screen.getAllByText("123.01")).toHaveLength(2);
  const identifier = screen.getByText(/Verifikations-ID:/);
  expect(identifier).not.toBeVisible();
  fireEvent.click(screen.getByText("Tekniska detaljer"));
  expect(identifier).toBeVisible();
});

it("reports a failed read explicitly and retries without a write request", async () => {
  request.mockRejectedValueOnce(new Error("Tillfälligt fel"));
  render(<VoucherReport id={entry.id} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Tillfälligt fel");
  fireEvent.click(screen.getByRole("button", { name: "Försök igen" }));
  await screen.findByText("Bokförd");
  expect(request).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).toBeNull();
});
