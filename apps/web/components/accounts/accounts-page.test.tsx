import { jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import { AccountsPage } from "@/components/accounts/accounts-page";
import { AuthProvider } from "@/components/auth/auth-provider";
import type { Account } from "@/lib/api/accounts";

const fetchMock = jest.fn<typeof fetch>();
const originalFetch = global.fetch;

const account: Account = {
  accountType: "ASSET",
  active: true,
  createdAt: "2026-09-14T10:00:00.000Z",
  description: "Primärt bankkonto",
  id: "account-a",
  name: "Företagskonto",
  normalBalance: "DEBIT",
  number: "1930",
  organizationId: "organization-a",
  updatedAt: "2026-09-14T10:00:00.000Z",
  vatCode: {
    active: true,
    code: "MOMS25-UT",
    id: "vat-a",
    name: "Utgående moms 25 %",
    rate: "25.00",
    type: "OUTPUT"
  }
};

function jsonResponse(payload: unknown): Response {
  return {
    json: async () => payload,
    ok: true,
    status: 200
  } as Response;
}

function setAuthenticatedFetchResponses(role: "OWNER" | "READ_ONLY") {
  fetchMock.mockImplementation(async (input) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url === "/api/auth/me") {
      return jsonResponse({
        user: {
          displayName: "Demo User",
          email: "demo@example.test",
          id: "user-a"
        }
      });
    }

    if (url === "/api/organizations") {
      return jsonResponse([
        {
          defaultCurrency: "SEK",
          id: "organization-a",
          name: "Nordisk Demo AB",
          role,
          slug: "nordisk-demo"
        }
      ]);
    }

    if (url.startsWith("/api/accounts?")) {
      return jsonResponse([account]);
    }

    throw new Error(`Unexpected request: ${url}`);
  });
}

function renderAccountsPage() {
  return render(
    <AuthProvider>
      <AccountsPage />
    </AuthProvider>
  );
}

describe("AccountsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    Object.defineProperty(global, "fetch", {
      configurable: true,
      value: fetchMock,
      writable: true
    });
  });

  afterAll(() => {
    Object.defineProperty(global, "fetch", {
      configurable: true,
      value: originalFetch,
      writable: true
    });
  });

  it("loads the selected organization's accounts and sends a trimmed search query", async () => {
    setAuthenticatedFetchResponses("OWNER");

    renderAccountsPage();

    expect(await screen.findByRole("cell", { name: "1930" })).toBeInTheDocument();
    expect(screen.getByText("Företagskonto")).toBeInTheDocument();
    expect(screen.getByText("MOMS25-UT")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nytt konto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redigera konto 1930" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/accounts?organizationId=organization-a",
      expect.objectContaining({
        cache: "no-store",
        credentials: "include"
      })
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Sök kontonummer eller namn" }), {
      target: { value: "  Företag  " }
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/accounts?organizationId=organization-a&q=F%C3%B6retag",
        expect.objectContaining({
          cache: "no-store",
          credentials: "include"
        })
      );
    });
  });

  it("allows read-only members to view accounts but hides account write actions", async () => {
    setAuthenticatedFetchResponses("READ_ONLY");

    renderAccountsPage();

    expect(await screen.findByRole("cell", { name: "1930" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nytt konto" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Redigera konto 1930" })).not.toBeInTheDocument();
    expect(screen.getByText(/Du har läsbehörighet till kontoplanen/i)).toBeInTheDocument();
  });
});
