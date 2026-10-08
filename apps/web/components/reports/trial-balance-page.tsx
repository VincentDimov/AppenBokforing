"use client";

import { useState } from "react";
import { ReportTools } from "./report-tools";
import { FiscalYearSelect } from "./fiscal-year-select";
import { PageHeader, EmptyState, LoadingState } from "@/components/ui/workspace";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { useReportRequest } from "@/lib/use-report-request";

const columns = [
  ["openingDebit", "IB debet"],
  ["openingCredit", "IB kredit"],
  ["periodDebit", "Period debet"],
  ["periodCredit", "Period kredit"],
  ["closingDebit", "UB debet"],
  ["closingCredit", "UB kredit"]
] as const;
type Amounts = Record<(typeof columns)[number][0], string>;
interface TrialBalanceReport {
  fiscalYear: { id: string; name: string };
  fromDate: string;
  toDate: string;
  accounts: (Amounts & { id: string; number: string; name: string })[];
  totals: Amounts;
}
const inputClassName =
  "h-10 rounded-md border border-border bg-white px-3 text-sm focus:ring-2 focus:ring-focus";

export function TrialBalancePage() {
  const { activeOrganizationId } = useAuth();
  return <OrganizationTrialBalancePage key={activeOrganizationId ?? "no-organization"} />;
}

function OrganizationTrialBalancePage() {
  const { activeOrganizationId, activeOrganization } = useAuth();
  const [fiscalYear, setFiscalYear] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const { report, error, setError, load, loadedUrl, loading } =
    useReportRequest<TrialBalanceReport>();
  async function run() {
    if (!activeOrganizationId || !fiscalYear || !fromDate || !toDate) {
      setError("Välj räkenskapsår och datumintervall.");
      return;
    }
    await load(
      "/api/reports/trial-balance?" +
        new URLSearchParams({
          organizationId: activeOrganizationId,
          fiscalYear,
          fromDate,
          toDate
        })
    );
  }
  return (
    <div className="mx-auto max-w-6xl print:max-w-none">
      <PageHeader
        title="Saldobalans"
        context="Rapporter"
        description="Välj räkenskapsår och urval. Rapporten baseras på bokförda transaktioner."
      />
      <ReportTools report={report} url={loadedUrl} />
      <section
        className="report-filters mt-6 grid gap-3 border border-border bg-white p-5 md:grid-cols-4 print:hidden"
        aria-label="Rapportfilter"
      >
        <FiscalYearSelect className={inputClassName} value={fiscalYear} onChange={setFiscalYear} />
        <label>
          Från datum
          <input
            aria-label="Från datum"
            className={inputClassName}
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </label>
        <label>
          Till datum
          <input
            aria-label="Till datum"
            className={inputClassName}
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </label>
        <Button type="button" onClick={() => void run()}>
          Visa rapport
        </Button>
      </section>
      <p className="mt-2 text-xs text-muted print:hidden">
        IB är årets ingående saldo plus bokförda rörelser före intervallet. Inga dimensionsfilter.
      </p>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {loading && <LoadingState label="Hämtar rapport…" />}
      {!report && !error && !loading && (
        <EmptyState
          title="Din rapport visas här"
          description="Välj år och datum, och tryck på Visa rapport."
        />
      )}
      {report ? (
        <section className="mt-6 border border-border bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-semibold">
              {activeOrganization?.name} · {report.fiscalYear.name} · {report.fromDate} –{" "}
              {report.toDate}
            </h2>
            <Button
              type="button"
              variant="outline"
              className="print:hidden"
              onClick={() => window.print()}
            >
              Skriv ut
            </Button>
          </div>
          <div className="overflow-x-auto">
            <div className="table-frame" tabIndex={0}>
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Saldobalans med ingående saldo, periodens rörelser och utgående saldo
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="p-2 text-left">
                      Konto
                    </th>
                    <th scope="col" className="p-2 text-left">
                      Namn
                    </th>
                    {columns.map(([key, label]) => (
                      <th scope="col" key={key} className="p-2 text-right">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.accounts.map((account) => (
                    <tr key={account.id} className="border-t">
                      <th scope="row" className="p-2 text-left font-normal">
                        {account.number}
                      </th>
                      <td className="p-2">{account.name}</td>
                      {columns.map(([key]) => (
                        <td key={key} className="p-2 text-right tabular-nums">
                          {account[key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <th scope="row" colSpan={2} className="p-2 text-left">
                      Totalt
                    </th>
                    {columns.map(([key]) => (
                      <td key={key} className="p-2 text-right tabular-nums">
                        {report.totals[key]}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          {report.accounts.length === 0 ? (
            <p className="mt-4">Inga konton finns för organisationen.</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
