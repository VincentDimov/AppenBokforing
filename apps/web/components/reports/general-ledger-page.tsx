"use client";

import { useState } from "react";
import { ReportTools } from "./report-tools";
import { FiscalYearSelect } from "./fiscal-year-select";
import { PageHeader, EmptyState, LoadingState } from "@/components/ui/workspace";
import { DimensionTypeahead } from "@/components/journal-entries/dimension-typeahead";

import { useReportRequest } from "@/lib/use-report-request";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";

interface LedgerTransaction {
  date: string;
  description: string;
  debit: string;
  credit: string;
  runningBalance: string;
  voucher: string | null;
}

interface LedgerAccount {
  account: { id: string; name: string; number: string };
  closingBalance: string;
  openingBalance: string;
  transactions: LedgerTransaction[];
}

interface GeneralLedgerReport {
  accounts: LedgerAccount[];
  fiscalYear: { id: string; name: string };
}

const inputClassName =
  "h-10 rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-border focus:ring-2 focus:ring-focus";

export function GeneralLedgerPage() {
  const { activeOrganizationId } = useAuth();
  return <OrganizationGeneralLedgerPage key={activeOrganizationId ?? "no-organization"} />;
}

function OrganizationGeneralLedgerPage() {
  const { activeOrganizationId } = useAuth();
  const [fiscalYear, setFiscalYear] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [accountFrom, setAccountFrom] = useState("");
  const [accountTo, setAccountTo] = useState("");
  const [project, setProject] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const { report, error, setError, load, loadedUrl, loading } =
    useReportRequest<GeneralLedgerReport>();

  async function run() {
    if (!activeOrganizationId || !fiscalYear || !fromDate || !toDate) {
      setError("Välj räkenskapsår och datumintervall.");
      return;
    }
    const parameters = new URLSearchParams({
      organizationId: activeOrganizationId,
      fiscalYear,
      fromDate,
      toDate,
      ...(accountFrom ? { accountFrom } : {}),
      ...(accountTo ? { accountTo } : {}),
      ...(project ? { project } : {}),
      ...(costCenter ? { costCenter } : {})
    });
    await load(`/api/reports/general-ledger?${parameters}`);
  }

  return (
    <div className="mx-auto max-w-6xl print:max-w-none">
      <PageHeader
        title="Huvudbok"
        context="Rapporter"
        description="Välj räkenskapsår och urval. Rapporten baseras på bokförda transaktioner."
      />
      <ReportTools report={report} url={loadedUrl} />
      <section className="report-filters mt-6 grid gap-3 border border-border bg-white p-5 md:grid-cols-4">
        <FiscalYearSelect className={inputClassName} value={fiscalYear} onChange={setFiscalYear} />
        <label>
          Från konto
          <input
            aria-label="Från konto"
            className={inputClassName}
            inputMode="numeric"
            placeholder="Från konto"
            value={accountFrom}
            onChange={(event) => setAccountFrom(event.target.value)}
          />
        </label>
        <label>
          Till konto
          <input
            aria-label="Till konto"
            className={inputClassName}
            inputMode="numeric"
            placeholder="Till konto"
            value={accountTo}
            onChange={(event) => setAccountTo(event.target.value)}
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
        <div className="flex gap-2">
          <Button onClick={() => void run()} type="button">
            Visa rapport
          </Button>
        </div>
      </section>
      <p className="mt-2 text-xs text-muted">
        Om året har IB kan projekt/kostnadsställe inte användas: IB saknar dimensionsfördelning.
        Utan IB filtreras endast bokförda rörelser.
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
        <section className="mt-6 print:mt-0">
          <div className="mb-4 flex justify-end print:hidden">
            <Button onClick={() => window.print()} type="button" variant="outline">
              Skriv ut
            </Button>
          </div>
          {report.accounts.map((account) => (
            <article key={account.account.id} className="mb-6 border border-border bg-white">
              <h2 className="border-b p-4 font-semibold text-ink">
                {account.account.number} — {account.account.name}
              </h2>
              <p className="p-4 text-sm">Ingående saldo: {account.openingBalance}</p>
              <div className="table-frame" tabIndex={0}>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Verifikation</th>
                      <th>Beskrivning</th>
                      <th className="text-right">Debet</th>
                      <th className="text-right">Kredit</th>
                      <th className="text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {account.transactions.map((transaction, index) => (
                      <tr key={`${transaction.voucher}-${index}`}>
                        <td>{transaction.date}</td>
                        <td>{transaction.voucher}</td>
                        <td>{transaction.description}</td>
                        <td className="text-right tabular-nums">{transaction.debit}</td>
                        <td className="text-right tabular-nums">{transaction.credit}</td>
                        <td className="text-right tabular-nums">{transaction.runningBalance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="p-4 text-sm font-semibold">Utgående saldo: {account.closingBalance}</p>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
