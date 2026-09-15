"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getJournalEntries,
  type JournalEntry,
  type JournalEntryStatus
} from "@/lib/api/journal-entries";
import { formatOre, parseMoneyToOre } from "@/lib/vouchers";

const writeRoles = new Set(["OWNER", "ADMIN", "ACCOUNTANT"]);

export function VoucherListPage() {
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
      .then(setEntries)
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
      <header className="flex flex-col justify-between gap-5 border-b border-[#ccdce4] pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[0.13em] text-[#638292] uppercase">
            Bokföring
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[#12374c] sm:text-4xl">
            Verifikationer
          </h1>
          <p className="mt-3 text-base leading-7 text-[#58717e]">
            Granska utkast och bokförda verifikationer för{" "}
            <span className="font-medium text-[#294f62]">{activeOrganization.name}</span>.
          </p>
        </div>
        {canWrite ? (
          <Button asChild size="wide">
            <Link href="/app/bookkeeping/vouchers/new">
              <Plus aria-hidden="true" className="size-4" />
              Ny verifikation
            </Link>
          </Button>
        ) : null}
      </header>

      <section className="mt-6 border border-[#d6e3e9] bg-white shadow-[0_8px_22px_rgba(16,47,66,0.035)]">
        <div className="flex flex-col gap-4 border-b border-[#e1ebef] p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <label className="relative block w-full sm:max-w-md">
            <span className="sr-only">Sök verifikation</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6b8997]"
            />
            <input
              className="h-10 w-full rounded-lg border border-[#cbdbe3] bg-white py-2 pl-9 pr-3 text-sm text-[#17384b] outline-none transition placeholder:text-[#8097a2] focus:border-[#4a8fa9] focus:ring-4 focus:ring-[#d8edf5]"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Sök datum, beskrivning eller nummer"
              type="search"
              value={search}
            />
          </label>
          <p className="shrink-0 text-sm text-[#668291]">
            {isLoading ? "Hämtar…" : `${filteredEntries.length} verifikationer`}
          </p>
        </div>

        {error ? (
          <p className="m-5 border-l-2 border-[#c76b52] bg-[#fff6f2] px-4 py-4 text-sm leading-6 text-[#914a38] sm:m-6">
            {error}
          </p>
        ) : null}
        {!error && isLoading && entries.length === 0 ? (
          <p className="px-5 py-12 text-sm text-[#668291] sm:px-6">Hämtar verifikationer…</p>
        ) : null}
        {!error && !isLoading && filteredEntries.length === 0 ? (
          <p className="px-5 py-12 text-sm leading-6 text-[#668291] sm:px-6">
            {search
              ? "Inga verifikationer matchar sökningen."
              : "Inga verifikationer ännu. Skapa ett utkast för att börja bokföra."}
          </p>
        ) : null}
        {filteredEntries.length > 0 ? <VoucherTable entries={filteredEntries} /> : null}
      </section>
    </div>
  );
}

function VoucherTable({ entries }: Readonly<{ entries: JournalEntry[] }>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] text-left text-sm">
        <thead className="border-b border-[#e5edf1] bg-[#f7fafb] text-xs font-semibold tracking-[0.08em] text-[#6c8490] uppercase">
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
              className="border-b border-[#edf2f4] last:border-b-0 hover:bg-[#f9fcfd]"
              key={entry.id}
            >
              <td className="whitespace-nowrap px-5 py-4 text-[#66808d] sm:px-6">
                {entry.transactionDate}
              </td>
              <td className="whitespace-nowrap px-5 py-4 font-semibold text-[#1f4960]">
                <Link
                  className="hover:text-[#0d2f42] hover:underline"
                  href={`/app/bookkeeping/vouchers/${entry.id}`}
                >
                  {entry.voucherNumber
                    ? `${entry.voucherSeries?.code ?? ""}${entry.voucherNumber}`
                    : "Utkast"}
                </Link>
              </td>
              <td className="max-w-96 truncate px-5 py-4 text-[#466471]">{entry.description}</td>
              <td className="whitespace-nowrap px-5 py-4 text-right font-medium tabular-nums text-[#1d5267]">
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

function StatusBadge({ status }: Readonly<{ status: JournalEntryStatus }>) {
  if (status === "POSTED") {
    return <Badge variant="success">Bokförd</Badge>;
  }

  if (status === "REVERSED") {
    return <Badge variant="outline">Makulerad</Badge>;
  }

  return <Badge variant="warning">Utkast</Badge>;
}

function VoucherListMessage({ message }: Readonly<{ message: string }>) {
  return (
    <section className="mx-auto max-w-4xl border border-[#d6e3e9] bg-white p-6 text-sm leading-6 text-[#58717e] shadow-[0_8px_22px_rgba(16,47,66,0.035)] sm:p-8">
      {message}
    </section>
  );
}
