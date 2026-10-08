"use client";

import { useState } from "react";
import { ReportTools } from "./report-tools";
import { FiscalYearSelect } from "./fiscal-year-select";
import { PageHeader, EmptyState, LoadingState } from "@/components/ui/workspace";

import { useReportRequest } from "@/lib/use-report-request";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";

type BalanceSheet = {
  fiscalYear: { id: string; name: string };
  reportDate: string;
  comparisonDate: string | null;
  groups: {
    key: string;
    label: string;
    accounts: { number: string; name: string; amount: string; comparisonAmount: string }[];
    total: string;
    comparisonTotal: string;
  }[];
  totals: {
    assets: string;
    equityAndLiabilities: string;
    difference: string;
    comparisonAssets: string;
    comparisonEquityAndLiabilities: string;
    comparisonDifference: string;
  };
};

const inputClass = "h-10 rounded-md border border-border bg-white px-3 text-sm";

export function BalanceSheetPage() {
  const { activeOrganizationId } = useAuth();
  return <OrganizationBalanceSheetPage key={activeOrganizationId ?? "no-organization"} />;
}

function OrganizationBalanceSheetPage() {
  const { activeOrganizationId } = useAuth();
  const [fiscalYear, setFiscalYear] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [comparisonDate, setComparisonDate] = useState("");
  const { report, error, setError, load, loadedUrl, loading } = useReportRequest<BalanceSheet>();

  async function run() {
    if (!activeOrganizationId || !fiscalYear || !reportDate)
      return setError("Välj räkenskapsår och rapportdatum.");
    const query = new URLSearchParams({
      organizationId: activeOrganizationId,
      fiscalYear,
      reportDate,
      ...(comparisonDate ? { comparisonDate } : {})
    });
    await load(`/api/reports/balance-sheet?${query}`);
  }

  return (
    <div className="mx-auto max-w-5xl print:max-w-none">
      <PageHeader
        title="Balansräkning"
        context="Rapporter"
        description="Välj räkenskapsår och urval. Rapporten baseras på bokförda transaktioner."
      />
      <ReportTools report={report} url={loadedUrl} />
      <section className="report-filters mt-6 grid gap-3 border border-border bg-white p-5 md:grid-cols-4">
        <FiscalYearSelect className={inputClass} value={fiscalYear} onChange={setFiscalYear} />
        <label>
          Rapportdatum
          <input
            aria-label="Rapportdatum"
            className={inputClass}
            type="date"
            value={reportDate}
            onChange={(event) => setReportDate(event.target.value)}
          />
        </label>
        <label>
          Jämförelsedatum
          <input
            aria-label="Jämförelsedatum"
            className={inputClass}
            type="date"
            value={comparisonDate}
            onChange={(event) => setComparisonDate(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void run()}>
            Visa rapport
          </Button>
          <Button type="button" variant="outline" disabled={!report} onClick={() => window.print()}>
            Skriv ut / PDF
          </Button>
        </div>
      </section>
      <p className="mt-2 text-xs text-muted">
        Jämförelse visar samma rapport upp till valt jämförelsedatum. PDF använder webbläsarens
        utskriftsdialog.
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
        <section className="mt-6 bg-white print:mt-0">
          <div className="mb-5 border border-border p-4 text-sm text-secondary">
            <span>
              {report.fiscalYear.name} · Per {report.reportDate}
            </span>
            {report.comparisonDate ? (
              <span className="float-right">Jämförelse: {report.comparisonDate}</span>
            ) : null}
          </div>
          {report.groups.map((group) => (
            <article key={group.key} className="mb-6 border border-border">
              <h2 className="border-b p-4 font-semibold text-ink">{group.label}</h2>
              <div className="table-frame" tabIndex={0}>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="p-3 text-left">Konto</th>
                      <th className="p-3 text-right">Belopp</th>
                      {report.comparisonDate ? (
                        <th className="p-3 text-right">Jämförelse</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {group.accounts.map((account) => (
                      <tr key={account.number}>
                        <td className="p-3">
                          {account.number === "ÅRETS_RESULTAT"
                            ? account.name
                            : `${account.number} ${account.name}`}
                        </td>
                        <td className="p-3 text-right">{account.amount}</td>
                        {report.comparisonDate ? (
                          <td className="p-3 text-right">{account.comparisonAmount}</td>
                        ) : null}
                      </tr>
                    ))}
                    <tr className="border-t font-semibold">
                      <td className="p-3">Summa {group.label.toLowerCase()}</td>
                      <td className="p-3 text-right">{group.total}</td>
                      {report.comparisonDate ? (
                        <td className="p-3 text-right">{group.comparisonTotal}</td>
                      ) : null}
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>
          ))}
          <div
            className={`border-2 p-4 font-semibold ${report.totals.difference === "0.00" ? "border-border text-success" : "border-danger text-danger"}`}
          >
            <span>Tillgångar: {report.totals.assets}</span>
            <span className="float-right">
              Eget kapital och skulder: {report.totals.equityAndLiabilities}
            </span>
            <p className="mt-2 text-sm">Kontrolldifferens: {report.totals.difference}</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
