"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { StatusBadge, EmptyState, LoadingState, PageHeader } from "@/components/ui/workspace";
import { Button } from "@/components/ui/button";
import { getJournalEntries, type JournalEntry } from "@/lib/api/journal-entries";
import { formatOre, parseMoneyToOre } from "@/lib/vouchers";

const writeRoles = new Set(["OWNER", "ADMIN", "ACCOUNTANT"]);

export function VoucherListPage({ reportMode = false }: { reportMode?: boolean } = {}) {
  const { activeOrganizationId } = useAuth();
  return (
    <OrganizationVoucherListPage
      key={activeOrganizationId ?? "no-organization"}
      reportMode={reportMode}
    />
  );
}

function OrganizationVoucherListPage({ reportMode }: { reportMode: boolean }) {
  const { activeOrganization, activeOrganizationId, organizationsStatus } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const canWrite = activeOrganization ? writeRoles.has(activeOrganization.role) : false;

  useEffect(() => {
    if (!activeOrganizationId) {
      setEntries([]);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    void getJournalEntries(activeOrganizationId, controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) setEntries(loaded);
      })
      .catch((caughtError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setEntries([]);
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Verifikationerna kunde inte laddas. Försök igen."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [activeOrganizationId]);

  if (organizationsStatus === "idle" || organizationsStatus === "loading") {
    return <VoucherListMessage message="Laddar organisationskontext…" />;
  }

  if (!activeOrganization) {
    return (
      <VoucherListMessage message="Välj eller skapa en organisation innan du ser verifikationer." />
    );
  }

  const filteredEntries = entries.filter((entry) => {
    if (!deferredSearch) {
      return true;
    }

    const identity = entry.voucherNumber
      ? `${entry.voucherSeries?.code ?? ""}${entry.voucherNumber}`
      : "utkast";

    return [entry.description, entry.transactionDate, identity, entry.status]
      .join(" ")
      .toLowerCase()
      .includes(deferredSearch);
  });

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title={reportMode ? "Verifikationslista" : "Verifikationer"}
        context={reportMode ? "Rapporter" : "Bokföring"}
        description={<>Utkast och bokförda verifikationer för {activeOrganization.name}.</>}
        action={
          reportMode ? (
            <Button variant="outline" onClick={() => window.print()}>
              Skriv ut
            </Button>
          ) : (
            canWrite && (
              <Button asChild>
                <Link href="/app/bookkeeping/vouchers/new">
                  <Plus className="size-4" aria-hidden="true" />
                  Ny verifikation
                </Link>
              </Button>
            )
          )
        }
      />

      <section className="mt-6 border border-border bg-white shadow-none">
        <div className="report-filters flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <label className="relative block w-full sm:max-w-md">
            <span className="sr-only">Sök verifikation</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            />
            <input
              className="h-10 w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm text-ink outline-none transition placeholder:text-muted focus:border-border focus:ring-4 focus:ring-focus"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Sök datum, beskrivning eller nummer"
              type="search"
              value={search}
            />
          </label>
          <p className="shrink-0 text-sm text-muted">
            {isLoading ? "Hämtar…" : `${filteredEntries.length} verifikationer`}
          </p>
        </div>

        {error ? (
          <p className="m-5 border-l-2 border-danger bg-danger-soft px-4 py-4 text-sm leading-6 text-danger sm:m-6">
            {error}
          </p>
        ) : null}
        {!error && isLoading && entries.length === 0 ? (
          <LoadingState label="Hämtar verifikationer…" />
        ) : null}
        {!error && !isLoading && filteredEntries.length === 0 ? (
          <EmptyState
            title={search ? "Inga verifikationer matchar sökningen" : "Inga verifikationer ännu"}
            description={
              search
                ? "Prova ett annat datum, nummer eller en beskrivning."
                : "Börja med ett utkast. Verifikationsnummer tilldelas först när du bokför."
            }
            action={
              !search &&
              canWrite && (
                <Button asChild variant="outline">
                  <Link href="/app/bookkeeping/vouchers/new">Skapa första utkastet</Link>
                </Button>
              )
            }
          />
        ) : null}
        {filteredEntries.length > 0 ? <VoucherTable entries={filteredEntries} /> : null}
      </section>
    </div>
  );
}

function VoucherTable({ entries }: Readonly<{ entries: JournalEntry[] }>) {
  return (
    <div className="table-frame" tabIndex={0}>
      <table className="w-full min-w-[46rem] text-left text-sm">
        <thead className="border-b border-border bg-surface-muted text-xs font-semibold tracking-[0.08em] text-muted uppercase">
          <tr>
            <th className="px-5 py-3.5 font-semibold sm:px-6">Datum</th>
            <th className="px-5 py-3.5 font-semibold">Verifikation</th>
            <th className="px-5 py-3.5 font-semibold">Beskrivning</th>
            <th className="px-5 py-3.5 text-right font-semibold">Debet</th>
            <th className="px-5 py-3.5 text-right font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              className="border-b border-border last:border-b-0 hover:bg-surface-muted"
              key={entry.id}
            >
              <td className="whitespace-nowrap px-5 py-4 text-muted sm:px-6">
                {entry.transactionDate}
              </td>
              <td className="whitespace-nowrap px-5 py-4 font-semibold text-secondary">
                <Link
                  className="hover:text-ink hover:underline"
                  href={`/app/bookkeeping/vouchers/${entry.id}`}
                >
                  {entry.voucherNumber
                    ? `${entry.voucherSeries?.code ?? ""}${entry.voucherNumber}`
                    : "Utkast"}
                </Link>
              </td>
              <td className="max-w-96 truncate px-5 py-4 text-secondary">{entry.description}</td>
              <td className="whitespace-nowrap px-5 py-4 text-right font-medium tabular-nums text-secondary">
                {formatOre(parseMoneyToOre(entry.totals.debit) ?? 0n)}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-right sm:px-6">
                <StatusBadge status={entry.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VoucherListMessage({ message }: Readonly<{ message: string }>) {
  return (
    <section className="mx-auto max-w-4xl border border-border bg-white p-6 text-sm leading-6 text-secondary shadow-none sm:p-8">
      {message}
    </section>
  );
}
