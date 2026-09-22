"use client";

import { useState } from "react";

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
const inputClass = "h-10 rounded-md border border-[#b9cbd4] bg-white px-3 text-sm";

export function IncomeStatementPage() {
  const { activeOrganizationId } = useAuth();
  const [fiscalYear, setFiscalYear] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [project, setProject] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [report, setReport] = useState<IncomeStatement | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    const response = await fetch(`/api/reports/income-statement?${query}`, {
      credentials: "include",
      cache: "no-store"
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      setError(
        typeof body === "object" &&
          body !== null &&
          "message" in body &&
          typeof body.message === "string"
          ? body.message
          : "Rapporten kunde inte laddas."
      );
      return;
    }
    setError(null);
    setReport(body as IncomeStatement);
  }

  return (
    <div className="mx-auto max-w-5xl print:max-w-none">
      <header className="border-b border-[#ccdce4] pb-6">
        <p className="text-xs font-semibold tracking-[.1em] uppercase text-[#638292]">Rapporter</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#12374c]">Resultaträkning</h1>
      </header>
      <section className="mt-6 grid gap-3 border border-[#d6e3e9] bg-white p-5 md:grid-cols-3">
        <input
          aria-label="Räkenskapsår"
          className={inputClass}
          placeholder="Räkenskapsår-ID"
          value={fiscalYear}
          onChange={(event) => setFiscalYear(event.target.value)}
        />
        <input
          aria-label="Från datum"
          className={inputClass}
          type="date"
          value={fromDate}
          onChange={(event) => setFromDate(event.target.value)}
        />
        <input
          aria-label="Till datum"
          className={inputClass}
          type="date"
          value={toDate}
          onChange={(event) => setToDate(event.target.value)}
        />
        <input
          aria-label="Projekt"
          className={inputClass}
          placeholder="Projektkod"
          value={project}
          onChange={(event) => setProject(event.target.value)}
        />
        <input
          aria-label="Kostnadsställe"
          className={inputClass}
          placeholder="Kostnadsställe"
          value={costCenter}
          onChange={(event) => setCostCenter(event.target.value)}
        />
        <div className="flex gap-2">
          <Button type="button" onClick={() => void run()}>
            Visa rapport
          </Button>
          <Button type="button" variant="outline" disabled={!report} onClick={() => window.print()}>
            Skriv ut / PDF
          </Button>
        </div>
      </section>
      <p className="mt-2 text-xs text-[#638292]">
        PDF-knappen använder webbläsarens utskriftsdialog; en servergenererad PDF-adapter kan senare
        anslutas utan att ändra rapportkontraktet.
      </p>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {report ? (
        <section className="mt-6 bg-white print:mt-0">
          {report.groups.map((group) => (
            <article key={group.key} className="mb-6 border border-[#d6e3e9]">
              <h2 className="border-b p-4 font-semibold text-[#17384b]">{group.label}</h2>
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
            </article>
          ))}
          <div className="border-2 border-[#17384b] p-4 font-semibold">
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
