export type JournalEntryStatus = "DRAFT" | "POSTED" | "REVERSED";

export interface JournalEntryAccount {
  id: string;
  name: string;
  number: string;
}

export interface JournalEntryDimension {
  code: string;
  id: string;
  name: string;
}

export interface JournalEntryVatCode extends JournalEntryDimension {
  rate: string;
}

export interface VoucherSeriesSummary {
  code: string;
  id: string;
  name: string;
}

export interface JournalEntryLine {
  account: JournalEntryAccount;
  costCenter: JournalEntryDimension | null;
  credit: string;
  debit: string;
  description: string | null;
  id: string;
  lineNumber: number;
  project: JournalEntryDimension | null;
  vatCode: JournalEntryVatCode | null;
}

export interface JournalEntry {
  accountingPeriod: {
    endDate: string;
    id: string;
    periodNumber: number;
    startDate: string;
    status: "OPEN" | "LOCKED";
  };
  createdAt: string;
  description: string;
  fiscalYear: {
    endDate: string;
    id: string;
    name: string;
    startDate: string;
    status: "OPEN" | "CLOSED";
  };
  id: string;
  lines: JournalEntryLine[];
  organizationId: string;
  postedAt: string | null;
  status: JournalEntryStatus;
  totals: { credit: string; debit: string; difference: string };
  transactionDate: string;
  updatedAt: string;
  voucherNumber: number | null;
  voucherSeries: VoucherSeriesSummary | null;
}

export interface JournalEntryLineInput {
  accountId: string;
  costCenterCode?: string | null;
  credit: string;
  debit: string;
  description?: string | null;
  projectCode?: string | null;
  vatCode?: string | null;
}

export interface JournalEntryInput {
  description: string;
  lines: JournalEntryLineInput[];
  organizationId: string;
  transactionDate: string;
  voucherSeriesId: string;
}

export interface JournalEntryOptions {
  accountingPeriod: JournalEntry["accountingPeriod"];
  fiscalYear: JournalEntry["fiscalYear"];
  voucherSeries: VoucherSeriesSummary[];
}

export class JournalEntriesApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "JournalEntriesApiError";
  }
}

export async function getJournalEntries(
  organizationId: string,
  signal?: AbortSignal
): Promise<JournalEntry[]> {
  const parameters = new URLSearchParams({ organizationId });
  const response = await fetch(`/api/journal-entries?${parameters.toString()}`, {
    cache: "no-store",
    credentials: "include",
    signal
  });
  const payload = await parsePayload(response);

  if (!response.ok) {
    throw new JournalEntriesApiError(getErrorMessage(payload), response.status);
  }

  if (!Array.isArray(payload)) {
    throw new JournalEntriesApiError("Verifikationslistan kunde inte tolkas.", response.status);
  }

  return payload as JournalEntry[];
}

export async function getJournalEntry(
  journalEntryId: string,
  signal?: AbortSignal
): Promise<JournalEntry> {
  return requestJournalEntry(`/api/journal-entries/${journalEntryId}`, "GET", undefined, signal);
}

export async function getJournalEntryOptions(
  organizationId: string,
  transactionDate: string,
  signal?: AbortSignal
): Promise<JournalEntryOptions> {
  const parameters = new URLSearchParams({ organizationId, transactionDate });
  const response = await fetch(`/api/journal-entries/options?${parameters.toString()}`, {
    cache: "no-store",
    credentials: "include",
    signal
  });
  const payload = await parsePayload(response);

  if (!response.ok) {
    throw new JournalEntriesApiError(getErrorMessage(payload), response.status);
  }

  if (!payload || typeof payload !== "object" || !("voucherSeries" in payload)) {
    throw new JournalEntriesApiError("Kalenderalternativen kunde inte tolkas.", response.status);
  }

  return payload as JournalEntryOptions;
}

export function createJournalEntry(input: JournalEntryInput): Promise<JournalEntry> {
  return requestJournalEntry("/api/journal-entries", "POST", input);
}

export function updateJournalEntry(
  journalEntryId: string,
  input: Omit<JournalEntryInput, "organizationId">
): Promise<JournalEntry> {
  return requestJournalEntry(`/api/journal-entries/${journalEntryId}`, "PATCH", input);
}

export function postJournalEntry(journalEntryId: string): Promise<JournalEntry> {
  return requestJournalEntry(`/api/journal-entries/${journalEntryId}/post`, "POST");
}

async function requestJournalEntry(
  url: string,
  method: "GET" | "PATCH" | "POST",
  body?: object,
  signal?: AbortSignal
): Promise<JournalEntry> {
  const response = await fetch(url, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    credentials: "include",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" } }),
    method,
    signal
  });
  const payload = await parsePayload(response);

  if (!response.ok) {
    throw new JournalEntriesApiError(getErrorMessage(payload), response.status);
  }

  if (!payload || typeof payload !== "object" || !("id" in payload)) {
    throw new JournalEntriesApiError("Verifikationen kunde inte tolkas.", response.status);
  }

  return payload as JournalEntry;
}

async function parsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function getErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("message" in payload)) {
    return "Något gick fel. Försök igen.";
  }

  const message = payload.message;

  return Array.isArray(message)
    ? message.filter((item): item is string => typeof item === "string").join(" ")
    : typeof message === "string"
      ? message
      : "Något gick fel. Försök igen.";
}
