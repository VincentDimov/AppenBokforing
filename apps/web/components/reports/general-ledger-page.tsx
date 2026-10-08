"use client";

import { useState } from "react";
import { ReportTools } from "./report-tools";

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
  "h-10 rounded-md border border-[#b9cbd4] bg-white px-3 text-sm outline-none focus:border-[#245a73] focus:ring-2 focus:ring-[#b8d6e4]";

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
  const { report, error, setError, load, loadedUrl } = useReportRequest<GeneralLedgerReport>();

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
      <header className="border-b border-[#ccdce4] pb-6">
        <p className="text-xs font-semibold tracking-[.1em] uppercase text-[#638292]">Rapporter</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#12374c]">Huvudbok</h1>
      </header>
      <ReportTools report={report} url={loadedUrl} />
      <section className="report-filters mt-6 grid gap-3 border border-[#d6e3e9] bg-white p-5 md:grid-cols-4">
        <input
          aria-label="Räkenskapsår"
          className={inputClassName}
          placeholder="Räkenskapsår-ID"
          value={fiscalYear}
          onChange={(event) => setFiscalYear(event.target.value)}
        />
        <input
          aria-label="Från konto"
          className={inputClassName}
          inputMode="numeric"
          placeholder="Från konto"
          value={accountFrom}
          onChange={(event) => setAccountFrom(event.target.value)}
        />
        <input
          aria-label="Till konto"
          className={inputClassName}
          inputMode="numeric"
          placeholder="Till konto"
          value={accountTo}
          onChange={(event) => setAccountTo(event.target.value)}
        />
        <input
          aria-label="Projekt"
          className={inputClassName}
          placeholder="Projektkod"
          value={project}
          onChange={(event) => setProject(event.target.value)}
        />
        <input
          aria-label="Kostnadsställe"
          className={inputClassName}
          placeholder="Kostnadsställe"
          value={costCenter}
          onChange={(event) => setCostCenter(event.target.value)}
        />
        <input
          aria-label="Från datum"
          className={inputClassName}
          type="date"
          value={fromDate}
          onChange={(event) => setFromDate(event.target.value)}
        />
        <input
          aria-label="Till datum"
          className={inputClassName}
          type="date"
          value={toDate}
          onChange={(event) => setToDate(event.target.value)}
        />
        <div className="flex gap-2">
          <Button onClick={() => void run()} type="button">
            Visa rapport
          </Button>
        </div>
      </section>
      <p className="mt-2 text-xs text-[#638292]">
        Ange räkenskapsårets ID. Om året har IB kan projekt/kostnadsställe inte användas: IB saknar
        dimensionsfördelning. Utan IB filtreras endast bokförda rörelser.
      </p>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {report ? (
        <section className="mt-6 print:mt-0">
          <div className="mb-4 flex justify-end print:hidden">
            <Button onClick={() => window.print()} type="button" variant="outline">
              Skriv ut
            </Button>
          </div>
          {report.accounts.map((account) => (
            <article key={account.account.id} className="mb-6 border border-[#d6e3e9] bg-white">
              <h2 className="border-b p-4 font-semibold text-[#17384b]">
                {account.account.number} — {account.account.name}
              </h2>
              <p className="p-4 text-sm">Ingående saldo: {account.openingBalance}</p>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Verifikation</th>
                    <th>Beskrivning</th>
                    <th>Debet</th>
                    <th>Kredit</th>
                    <th>Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {account.transactions.map((transaction, index) => (
                    <tr key={`${transaction.voucher}-${index}`}>
                      <td>{transaction.date}</td>
                      <td>{transaction.voucher}</td>
                      <td>{transaction.description}</td>
                      <td>{transaction.debit}</td>
                      <td>{transaction.credit}</td>
                      <td>{transaction.runningBalance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="p-4 text-sm font-semibold">Utgående saldo: {account.closingBalance}</p>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
