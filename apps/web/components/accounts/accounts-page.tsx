"use client";

import { Plus, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";

import { AccountEditor } from "@/components/accounts/account-editor";
import { AccountsTable } from "@/components/accounts/accounts-table";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { AccountsApiError, getAccounts, type Account } from "@/lib/api/accounts";

type EditorState = { account: Account | null } | null;

const accountManagers = new Set(["OWNER", "ADMIN", "ACCOUNTANT"]);

export function AccountsPage() {
  const { activeOrganization, activeOrganizationId, organizationsStatus } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [editor, setEditor] = useState<EditorState>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const canManage = activeOrganization ? accountManagers.has(activeOrganization.role) : false;

  useEffect(() => {
    setEditor(null);
  }, [activeOrganizationId]);

  useEffect(() => {
    if (!activeOrganizationId) {
      setAccounts([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    void getAccounts(activeOrganizationId, deferredSearch, controller.signal)
      .then((loadedAccounts) => setAccounts(loadedAccounts))
      .catch((caughtError: unknown) => {
        if (caughtError instanceof DOMException && caughtError.name === "AbortError") {
          return;
        }

        setAccounts([]);
        setError(
          caughtError instanceof AccountsApiError
            ? caughtError.message
            : "Kontoplanen kunde inte laddas. Försök igen."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [activeOrganizationId, deferredSearch, refreshKey]);

  async function handleSaved() {
    setEditor(null);
    setRefreshKey((current) => current + 1);
  }

  if (organizationsStatus === "loading" || organizationsStatus === "idle") {
    return <AccountsPageMessage message="Laddar organisationskontext…" />;
  }

  if (!activeOrganization) {
    return (
      <AccountsPageMessage
        message={
          organizationsStatus === "error"
            ? "Kontoplanen kan inte laddas förrän organisationerna är tillgängliga."
            : "Välj eller skapa en organisation för att hantera kontoplanen."
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="flex flex-col justify-between gap-5 border-b border-[#ccdce4] pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[0.13em] text-[#638292] uppercase">
            Register
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[#12374c] sm:text-4xl">
            Konton
          </h1>
          <p className="mt-3 text-base leading-7 text-[#58717e]">
            Kontoplan för{" "}
            <span className="font-medium text-[#294f62]">{activeOrganization.name}</span>.
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setEditor({ account: null })} size="wide" type="button">
            <Plus aria-hidden="true" className="size-4" />
            Nytt konto
          </Button>
        ) : null}
      </header>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <section className="border border-[#d6e3e9] bg-white shadow-[0_8px_22px_rgba(16,47,66,0.035)]">
          <div className="flex flex-col gap-4 border-b border-[#e1ebef] p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <label className="relative block w-full sm:max-w-md">
              <span className="sr-only">Sök kontonummer eller namn</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6b8997]"
              />
              <input
                className="h-10 w-full rounded-lg border border-[#cbdbe3] bg-white py-2 pl-9 pr-10 text-sm text-[#17384b] outline-none transition placeholder:text-[#8097a2] focus:border-[#4a8fa9] focus:ring-4 focus:ring-[#d8edf5]"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Sök kontonummer eller namn"
                type="search"
                value={search}
              />
              {search ? (
                <button
                  aria-label="Rensa sökning"
                  className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-[#6b8997] hover:bg-[#e8f2f6] hover:text-[#17384b]"
                  onClick={() => setSearch("")}
                  type="button"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              ) : null}
            </label>
            <p className="shrink-0 text-sm text-[#668291]">
              {isLoading
                ? "Söker…"
                : `${accounts.length} ${accounts.length === 1 ? "konto" : "konton"}`}
            </p>
          </div>

          {error ? (
            <div className="m-5 border-l-2 border-[#c76b52] bg-[#fff6f2] px-4 py-4 text-sm leading-6 text-[#914a38] sm:m-6">
              <p>{error}</p>
              <Button
                className="mt-3"
                onClick={() => setRefreshKey((current) => current + 1)}
                size="sm"
                type="button"
                variant="outline"
              >
                Försök igen
              </Button>
            </div>
          ) : null}

          {!error && isLoading && accounts.length === 0 ? (
            <div className="px-5 py-12 text-sm text-[#668291] sm:px-6">Hämtar kontoplan…</div>
          ) : null}

          {!error && !isLoading && accounts.length === 0 ? (
            <div className="px-5 py-12 text-sm leading-6 text-[#668291] sm:px-6">
              {search
                ? "Inga konton matchar din sökning."
                : "Det finns inga konton ännu. Skapa ett konto för att börja bygga kontoplanen."}
            </div>
          ) : null}

          {accounts.length > 0 ? (
            <AccountsTable
              accounts={accounts}
              canManage={canManage}
              onEdit={(account) => setEditor({ account })}
            />
          ) : null}
        </section>

        {editor ? (
          <AccountEditor
            account={editor.account}
            key={editor.account?.id ?? "new-account"}
            onCancel={() => setEditor(null)}
            onSaved={handleSaved}
            organizationId={activeOrganizationId}
            organizationName={activeOrganization.name}
          />
        ) : (
          <section className="border border-[#d6e3e9] bg-[#f7fafb] p-6 text-sm leading-6 text-[#58717e]">
            <p className="font-semibold text-[#234b60]">Kontoplanen är organisationsgemensam</p>
            <p className="mt-2">
              Samma konto används över räkenskapsår. Årsvis aktivering modelleras separat när det
              blir ett verkligt behov.
            </p>
            {!canManage ? (
              <p className="mt-4 border-t border-[#dce7ec] pt-4 text-[#6a808c]">
                Du har läsbehörighet till kontoplanen. Ändringar kräver owner-, admin- eller
                accountant-roll.
              </p>
            ) : null}
          </section>
        )}
      </div>
    </div>
  );
}

function AccountsPageMessage({ message }: Readonly<{ message: string }>) {
  return (
    <section className="mx-auto max-w-4xl border border-[#d6e3e9] bg-white p-6 text-sm leading-6 text-[#58717e] shadow-[0_8px_22px_rgba(16,47,66,0.035)] sm:p-8">
      {message}
    </section>
  );
}
