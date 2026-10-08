"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useFiscalYears, type FiscalYearChoice } from "@/lib/use-fiscal-years";
import { workspaceRequest } from "@/lib/workspace-api";
import { PageHeader, StatusBadge } from "@/components/ui/workspace";
import { Button } from "@/components/ui/button";
export interface DashboardData {
  organizationId: string;
  fiscalYear: { id: string; name: string };
  fromDate: string;
  toDate: string;
  kpis: {
    revenue: string;
    expenses: string;
    result: string;
    inputVat: string;
    outputVat: string;
    vatPosition: string;
    drafts: number;
    posted: number;
  };
  vatStatus: { anomalies: number; warnings: string[]; configurationVersion: string };
  chart: { month: string; revenue: string; expenses: string; result: string }[];
  recent: {
    id: string;
    description: string;
    status: string;
    entryDate: string;
    voucherNumber: number | null;
    voucherSeries: { code: string } | null;
    reversesEntryId: string | null;
    reversedByEntry: { id: string } | null;
  }[];
  hasOpeningBalances: boolean;
  generatedAt: string;
}
function interval(year: FiscalYearChoice, preset: string, from: string, to: string) {
  const start = year.startDate.slice(0, 10),
    end = year.endDate.slice(0, 10);
  if (preset === "custom") return { fromDate: from, toDate: to };
  if (preset === "fiscal-year") return { fromDate: start, toDate: end };
  const now = new Date(),
    offset = preset === "previous-month" ? -1 : 0;
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth() + offset, 1))
    .toISOString()
    .slice(0, 10);
  const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + offset + 1, 0))
    .toISOString()
    .slice(0, 10);
  return {
    fromDate: monthStart < start ? start : monthStart,
    toDate: monthEnd > end ? end : monthEnd
  };
}
const magnitude = (amount: string) => {
  const value = BigInt(amount.replace(".", ""));
  return value < 0n ? -value : value;
};
/** Normalize exact cents only for CSS geometry. Financial labels remain server strings. */
export function barWidth(value: string, max: bigint) {
  const ratio = max === 0n ? 0n : (magnitude(value) * 10000n) / max;
  return `${ratio / 100n}.${(ratio % 100n).toString().padStart(2, "0")}%`;
}
export function DashboardOverview() {
  const { activeOrganizationId } = useAuth();
  if (!activeOrganizationId) return <p>Välj organisation för att visa ekonomin.</p>;
  return <Dashboard key={activeOrganizationId} org={activeOrganizationId} />;
}
function Dashboard({ org }: { org: string }) {
  const { activeOrganization } = useAuth(),
    years = useFiscalYears(org);
  const [preset, setPreset] = useState("fiscal-year"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [retry, setRetry] = useState(0);
  const [response, setResponse] = useState<{ key: string; data: DashboardData } | null>(null),
    [error, setError] = useState("");
  const dates = years.activeYear
    ? interval(years.activeYear, preset, from, to)
    : { fromDate: "", toDate: "" };
  const key = `${org}:${years.selected}:${dates.fromDate}:${dates.toDate}`;
  const valid = Boolean(
    years.activeYear &&
    dates.fromDate &&
    dates.toDate &&
    dates.fromDate <= dates.toDate &&
    dates.fromDate >= years.activeYear.startDate.slice(0, 10) &&
    dates.toDate <= years.activeYear.endDate.slice(0, 10)
  );
  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    setError("");
    setResponse(null);
    workspaceRequest<DashboardData>(
      "/dashboard?" +
        new URLSearchParams({ organizationId: org, fiscalYear: years.selected, ...dates }),
      { signal: controller.signal }
    )
      .then((data) => {
        if (!controller.signal.aborted && data.organizationId === org) setResponse({ key, data });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [org, years.selected, dates.fromDate, dates.toDate, key, valid, retry]);
  const data = response?.key === key ? response.data : null,
    canWrite = ["OWNER", "ADMIN", "ACCOUNTANT"].includes(activeOrganization?.role ?? "");
  const maximum =
    data?.chart.reduce(
      (max, row) =>
        [row.revenue, row.expenses, row.result].reduce(
          (v, amount) => (magnitude(amount) > v ? magnitude(amount) : v),
          max
        ),
      0n
    ) ?? 0n;
  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        title="Översikt"
        context="Arbetsyta"
        description={<>{activeOrganization?.name} · Bokförda belopp, SEK</>}
        action={
          canWrite && (
            <Button asChild>
              <Link href="/app/bookkeeping/vouchers/new">Ny verifikation</Link>
            </Button>
          )
        }
      />
      <section className="report-filters flex flex-wrap gap-3 rounded-lg bg-white p-4">
        <label>
          Räkenskapsår{" "}
          <select
            aria-label="Räkenskapsår för dashboard"
            className="border p-2"
            value={years.selected}
            onChange={(e) => years.select(e.target.value)}
          >
            {years.years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Period{" "}
          <select
            aria-label="Dashboardperiod"
            className="border p-2"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
          >
            <option value="fiscal-year">Hela räkenskapsåret</option>
            <option value="current-month">Aktuell månad</option>
            <option value="previous-month">Föregående månad</option>
            <option value="custom">Eget intervall</option>
          </select>
        </label>
        {preset === "custom" && (
          <>
            <label>
              Från datum{" "}
              <input
                aria-label="Dashboard från datum"
                type="date"
                className="border p-2"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              Till datum{" "}
              <input
                aria-label="Dashboard till datum"
                type="date"
                className="border p-2"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </>
        )}
      </section>
      {years.error || error ? (
        <p role="alert">
          {years.error || error}
          <Button onClick={() => setRetry((v) => v + 1)}>Försök igen</Button>
        </p>
      ) : !valid ? (
        <p role="status">
          {years.years.length ? "Välj ett intervall inom räkenskapsåret." : "Läser räkenskapsår…"}
        </p>
      ) : !data ? (
        <p role="status">Hämtar ekonomisk översikt…</p>
      ) : null}
      {data && (
        <>
          <p className="text-sm">
            {data.fromDate} – {data.toDate} · Uppdaterat{" "}
            {new Date(data.generatedAt).toLocaleString("sv-SE", {
              dateStyle: "short",
              timeStyle: "short"
            })}
          </p>
          <section
            aria-label="Ekonomisk översikt"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            {[
              ["Aktuellt resultat", data.kpis.result],
              ["Intäkter", data.kpis.revenue],
              ["Kostnader", data.kpis.expenses],
              ["Ingående moms", data.kpis.inputVat],
              ["Utgående moms", data.kpis.outputVat],
              ["Momsposition", data.kpis.vatPosition]
            ].map(([label, value]) => (
              <article
                key={label}
                aria-label={label}
                className="rounded-lg border border-border bg-white p-5"
              >
                <h2>{label}</h2>
                <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
                  {value} SEK
                </p>
              </article>
            ))}
          </section>
          <p>
            Utkast i urvalet: {data.kpis.drafts} · Bokförda verifikationer i urvalet:{" "}
            {data.kpis.posted}
          </p>
          <section className="rounded-lg border bg-white p-5">
            <h2 className="text-lg font-semibold">Momsstatus</h2>
            <p>
              Konfiguration: {data.vatStatus.configurationVersion}. Momsposition = utgående minus
              ingående moms. Granska rapporten innan den används som deklarationsunderlag.
            </p>
            {data.vatStatus.anomalies > 0 || data.vatStatus.warnings.length > 0 ? (
              <p role="status">
                Behöver granskas: {data.vatStatus.anomalies} anomalier.{" "}
                {data.vatStatus.warnings.join(" ")}
              </p>
            ) : (
              <p>
                Inga identifierade metadataanomalier i urvalet. Kontrollera även underlagen och
                företagets momsinställningar.
              </p>
            )}
            <Link className="underline" href="/app/reports/vat">
              Öppna momsrapport
            </Link>
          </section>
          {data.kpis.posted === 0 && (
            <section className="rounded-lg border bg-white p-5">
              <h2>Inga bokförda transaktioner i urvalet</h2>
              <p>Tomma perioder visas med noll, aldrig med exempelbelopp.</p>
              {canWrite && (
                <Link className="underline" href="/app/bookkeeping/vouchers/new">
                  Skapa första verifikationen
                </Link>
              )}
            </section>
          )}
          <section className="overflow-x-auto rounded-lg border bg-white p-5">
            <h2 className="text-lg font-semibold">Månadsutveckling · hela räkenskapsåret</h2>
            <p className="text-sm">
              Endast bokförda transaktioner. Rättelser ingår med sina tecken. Staplar visar absolut
              storlek; tabellen anger tecken och exakta belopp.
            </p>
            <div className="table-frame mt-4" tabIndex={0}>
              <table aria-label="Verklig månadsutveckling" className="mt-3 w-full text-left">
                <thead>
                  <tr>
                    <th>Månad</th>
                    <th>Intäkter</th>
                    <th>Kostnader</th>
                    <th>Resultat</th>
                    <th>Resultatets storlek</th>
                  </tr>
                </thead>
                <tbody>
                  {data.chart.map((row) => (
                    <tr key={row.month} className="border-t">
                      <th>{row.month}</th>
                      <td className="text-right tabular-nums">{row.revenue}</td>
                      <td className="text-right tabular-nums">{row.expenses}</td>
                      <td className="text-right tabular-nums">{row.result}</td>
                      <td className="w-1/4">
                        <div
                          aria-hidden="true"
                          className={
                            row.result.startsWith("-") ? "h-3 bg-warning" : "h-3 bg-accent"
                          }
                          style={{ width: barWidth(row.result, maximum) }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="rounded-lg border bg-white p-5">
            <h2 className="text-lg font-semibold">Senaste verifikationer</h2>
            {data.recent.length ? (
              <ul className="divide-y">
                {data.recent.map((entry) => (
                  <li key={entry.id} className="py-3">
                    <Link className="underline" href={`/app/bookkeeping/vouchers/${entry.id}`}>
                      {entry.voucherSeries?.code} {entry.voucherNumber ?? "utkast"} ·{" "}
                      {entry.entryDate.slice(0, 10)} · {entry.description}
                    </Link>
                    <span className="ml-2">
                      <StatusBadge status={entry.status} />
                      {entry.reversesEntryId
                        ? " · Rättelse"
                        : entry.reversedByEntry
                          ? " · Har rättelse"
                          : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Inga verifikationer i urvalet.</p>
            )}
          </section>
          {!data.hasOpeningBalances && (
            <p>
              Inga ingående balanser registrerade.
              {canWrite && (
                <Link className="ml-2 underline" href="/app/settings/opening-balances">
                  Hantera ingående balans
                </Link>
              )}
            </p>
          )}
        </>
      )}
      <section aria-label="Snabbval" className="flex flex-wrap gap-4">
        {canWrite && (
          <>
            <Link className="underline" href="/app/bookkeeping/posting-templates">
              Använd bokföringsmall
            </Link>
            <Link className="underline" href="/app/settings/import-export">
              Importera SIE
            </Link>
          </>
        )}
        <Link className="underline" href="/app/reports/trial-balance">
          Visa rapporter
        </Link>
        <Link className="underline" href="/app/bookkeeping/attachments">
          Öppna bilagor
        </Link>
      </section>
    </div>
  );
}
