export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";

export interface VatCodeSummary {
  active: boolean;
  code: string;
  id: string;
  name: string;
  rate: string;
  type: "INPUT" | "OUTPUT" | "EXEMPT";
}

export interface Account {
  accountType: AccountType;
  active: boolean;
  createdAt: string;
  description: string | null;
  id: string;
  name: string;
  normalBalance: "DEBIT" | "CREDIT";
  number: string;
  organizationId: string;
  updatedAt: string;
  vatCode: VatCodeSummary | null;
}

export interface AccountInput {
  accountType: AccountType;
  active: boolean;
  description: string | null;
  name: string;
  number: string;
  vatCode: string | null;
}

export class AccountsApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "AccountsApiError";
  }
}

export const accountTypeLabels: Record<AccountType, string> = {
  ASSET: "Tillgång",
  EQUITY: "Eget kapital",
  EXPENSE: "Kostnad",
  LIABILITY: "Skuld",
  REVENUE: "Intäkt"
};

export async function getAccounts(
  organizationId: string,
  q: string,
  signal?: AbortSignal
): Promise<Account[]> {
  const parameters = new URLSearchParams({ organizationId });

  if (q.trim()) {
    parameters.set("q", q.trim());
  }

  const response = await fetch(`/api/accounts?${parameters.toString()}`, {
    cache: "no-store",
    credentials: "include",
    signal
  });

  const payload = await parsePayload(response);

  if (!response.ok) {
    throw new AccountsApiError(getErrorMessage(payload), response.status);
  }

  if (!Array.isArray(payload)) {
    throw new AccountsApiError("Kontolistan kunde inte tolkas.", response.status);
  }

  return payload as Account[];
}

export async function createAccount(organizationId: string, input: AccountInput): Promise<Account> {
  return requestAccount("/api/accounts", "POST", { ...input, organizationId });
}

export async function updateAccount(accountId: string, input: AccountInput): Promise<Account> {
  return requestAccount(`/api/accounts/${accountId}`, "PATCH", input);
}

async function requestAccount(
  url: string,
  method: "PATCH" | "POST",
  body: object
): Promise<Account> {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    method
  });
  const payload = await parsePayload(response);

  if (!response.ok) {
    throw new AccountsApiError(getErrorMessage(payload), response.status);
  }

  if (!payload || typeof payload !== "object" || !("id" in payload)) {
    throw new AccountsApiError("Kontot kunde inte tolkas.", response.status);
  }

  return payload as Account;
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
