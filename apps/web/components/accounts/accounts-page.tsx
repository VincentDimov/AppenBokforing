"use client";

import { Plus, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";

import { AccountEditor } from "@/components/accounts/account-editor";
import { AccountsTable } from "@/components/accounts/accounts-table";
import { useAuth } from "@/components/auth/auth-provider";
import { PageHeader, EmptyState, LoadingState } from "@/components/ui/workspace";
import { Button } from "@/components/ui/button";
import { AccountsApiError, getAccounts, type Account } from "@/lib/api/accounts";

type EditorState = { account: Account | null } | null;

const accountManagers = new Set(["OWNER", "ADMIN", "ACCOUNTANT"]);

export function AccountsPage() {
  const { activeOrganizationId } = useAuth();
  return <OrganizationAccountsPage key={activeOrganizationId ?? "no-organization"} />;
}

function OrganizationAccountsPage() {
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
      .then((loadedAccounts) => {
        if (!controller.signal.aborted) setAccounts(loadedAccounts);
      })
      .catch((caughtError: unknown) => {
        if (controller.signal.aborted) {
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
      <PageHeader
        title="Konton"
        context="Register"
        description={
          <>
            Kontoplan för {activeOrganization.name}. Inaktiva konton bevaras i bokföringshistoriken.
          </>
        }
        action={
          canManage && (
            <Button onClick={() => setEditor({ account: null })} type="button">
              <Plus className="size-4" aria-hidden="true" />
              Nytt konto
            </Button>
          )
        }
      />

      <div className={`mt-6 grid gap-6 ${editor ? "xl:grid-cols-[minmax(0,1fr)_23rem]" : ""}`}>
        <section className="border border-border bg-white shadow-none">
          <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <label className="relative block w-full sm:max-w-md">
              <span className="sr-only">Sök kontonummer eller namn</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              />
              <input
                className="h-10 w-full rounded-lg border border-border bg-white py-2 pl-9 pr-10 text-sm text-ink outline-none transition placeholder:text-muted focus:border-border focus:ring-4 focus:ring-focus"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Sök kontonummer eller namn"
                type="search"
                value={search}
              />
              {search ? (
                <button
                  aria-label="Rensa sökning"
                  className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-accent-soft hover:text-ink"
                  onClick={() => setSearch("")}
                  type="button"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              ) : null}
            </label>
            <p className="shrink-0 text-sm text-muted">
              {isLoading
                ? "Söker…"
                : `${accounts.length} ${accounts.length === 1 ? "konto" : "konton"}`}
            </p>
          </div>

          {error ? (
            <div className="m-5 border-l-2 border-danger bg-danger-soft px-4 py-4 text-sm leading-6 text-danger sm:m-6">
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
            <LoadingState label="Hämtar kontoplan…" />
          ) : null}

          {!error && !isLoading && accounts.length === 0 ? (
            <EmptyState
              title={search ? "Inga konton matchar din sökning." : "Det finns inga konton ännu."}
              description={
                search
                  ? "Prova ett annat kontonummer eller namn."
                  : "Skapa ett konto för att börja bygga kontoplanen."
              }
            />
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
          <p className="text-xs text-muted">
            Kontoplanen är gemensam för företagets räkenskapsår.
            {!canManage && " Du har läsbehörighet till kontoplanen."}
          </p>
        )}
      </div>
    </div>
  );
}

function AccountsPageMessage({ message }: Readonly<{ message: string }>) {
  return (
    <section className="mx-auto max-w-4xl border border-border bg-white p-6 text-sm leading-6 text-secondary shadow-none sm:p-8">
      {message}
    </section>
  );
}
