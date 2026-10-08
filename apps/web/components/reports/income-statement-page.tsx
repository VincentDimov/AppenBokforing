"use client";

import { useState } from "react";
import { ReportTools } from "./report-tools";
import { FiscalYearSelect } from "./fiscal-year-select";
import { PageHeader, EmptyState, LoadingState } from "@/components/ui/workspace";
import { DimensionTypeahead } from "@/components/journal-entries/dimension-typeahead";

import { useReportRequest } from "@/lib/use-report-request";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";

interface ReportAccount {
  number: string;
  name: string;
  periodAmount: string;
  yearToDateAmount: string;
}
interface ReportGroup {
  key: string;
  label: string;
  accounts: ReportAccount[];
  periodTotal: string;
  yearToDateTotal: string;
}
interface IncomeStatement {
  groups: ReportGroup[];
  totals: { periodResult: string; yearToDateResult: string };
}
const inputClass = "h-10 rounded-md border border-border bg-white px-3 text-sm";

export function IncomeStatementPage() {
  const { activeOrganizationId } = useAuth();
  return <OrganizationIncomeStatementPage key={activeOrganizationId ?? "no-organization"} />;
}

function OrganizationIncomeStatementPage() {
  const { activeOrganizationId } = useAuth();
  const [fiscalYear, setFiscalYear] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [project, setProject] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const { report, error, setError, load, loadedUrl, loading } = useReportRequest<IncomeStatement>();

  async function run() {
    if (!activeOrganizationId || !fiscalYear || !fromDate || !toDate)
      return setError("Välj räkenskapsår och datumintervall.");
    const query = new URLSearchParams({
      organizationId: activeOrganizationId,
      fiscalYear,
      fromDate,
      toDate,
      ...(project ? { project } : {}),
      ...(costCenter ? { costCenter } : {})
    });
    await load(`/api/reports/income-statement?${query}`);
  }

  return (
    <div className="mx-auto max-w-5xl print:max-w-none">
      <PageHeader
        title="Resultaträkning"
        context="Rapporter"
        description="Välj räkenskapsår och urval. Rapporten baseras på bokförda transaktioner."
      />
      <ReportTools report={report} url={loadedUrl} />
      <section className="report-filters mt-6 grid gap-3 border border-border bg-white p-5 md:grid-cols-3">
        <FiscalYearSelect className={inputClass} value={fiscalYear} onChange={setFiscalYear} />
        <label>
          Från datum
          <input
            aria-label="Från datum"
            className={inputClass}
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </label>
        <label>
          Till datum
          <input
            aria-label="Till datum"
            className={inputClass}
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </label>
        <label>
          Projekt
          <DimensionTypeahead
            org={activeOrganizationId}
            kind="projects"
            label="Projekt"
            value={project}
            onChange={setProject}
            disabled={false}
          />
        </label>
        <label>
          Kostnadsställe
          <DimensionTypeahead
            org={activeOrganizationId}
            kind="cost-centers"
            label="Kostnadsställe"
            value={costCenter}
            onChange={setCostCenter}
            disabled={false}
          />
        </label>
        <div className="flex gap-2">
          <Button type="button" onClick={() => void run()}>
            Visa rapport
          </Button>
          <Button type="button" variant="outline" disabled={!report} onClick={() => window.print()}>
            Skriv ut / PDF
          </Button>
        </div>
      </section>
      <p className="mt-2 text-xs text-muted">
        Skriv ut / PDF öppnar webbläsarens utskriftsdialog. Välj Spara som PDF för en fil.
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
          {report.groups.map((group) => (
            <article key={group.key} className="mb-6 border border-border">
              <h2 className="border-b p-4 font-semibold text-ink">{group.label}</h2>
              <div className="table-frame" tabIndex={0}>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="p-3 text-left">Konto</th>
                      <th className="p-3 text-right">Period</th>
                      <th className="p-3 text-right">Ackumulerat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.accounts.map((account) => (
                      <tr key={account.number}>
                        <td className="p-3">
                          {account.number} {account.name}
                        </td>
                        <td className="p-3 text-right">{account.periodAmount}</td>
                        <td className="p-3 text-right">{account.yearToDateAmount}</td>
                      </tr>
                    ))}
                    <tr className="border-t font-semibold">
                      <td className="p-3">Summa {group.label.toLowerCase()}</td>
                      <td className="p-3 text-right">{group.periodTotal}</td>
                      <td className="p-3 text-right">{group.yearToDateTotal}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>
          ))}
          <div className="border-2 border-border p-4 font-semibold">
            <span>Periodens resultat: {report.totals.periodResult}</span>
            <span className="float-right">
              Ackumulerat resultat: {report.totals.yearToDateResult}
            </span>
          </div>
        </section>
      ) : null}
    </div>
  );
}
