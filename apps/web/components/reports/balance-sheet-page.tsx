"use client";

import { useState } from "react";

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

const inputClass = "h-10 rounded-md border border-[#b9cbd4] bg-white px-3 text-sm";

export function BalanceSheetPage() {
  const { activeOrganizationId } = useAuth();
  const [fiscalYear, setFiscalYear] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [comparisonDate, setComparisonDate] = useState("");
  const [report, setReport] = useState<BalanceSheet | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!activeOrganizationId || !fiscalYear || !reportDate)
      return setError("Välj räkenskapsår och rapportdatum.");
    const query = new URLSearchParams({
      organizationId: activeOrganizationId,
      fiscalYear,
      reportDate,
      ...(comparisonDate ? { comparisonDate } : {})
    });
    const response = await fetch(`/api/reports/balance-sheet?${query}`, {
      cache: "no-store",
      credentials: "include"
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
    setReport(body as BalanceSheet);
  }

  function exportCsv() {
    if (!report) return;
    const rows = [["Grupp", "Konto", "Namn", "Belopp", "Jämförelse"]];
    for (const group of report.groups) {
      for (const account of group.accounts)
        rows.push([
          group.label,
          account.number,
          account.name,
          account.amount,
          account.comparisonAmount
        ]);
      rows.push([
        group.label,
        "",
        `Summa ${group.label.toLowerCase()}`,
        group.total,
        group.comparisonTotal
      ]);
    }
    const csv = rows
      .map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(";"))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `balansrakning-${report.reportDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-5xl print:max-w-none">
      <header className="border-b border-[#ccdce4] pb-6">
        <p className="text-xs font-semibold tracking-[.1em] uppercase text-[#638292]">Rapporter</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#12374c]">Balansräkning</h1>
      </header>
      <section className="mt-6 grid gap-3 border border-[#d6e3e9] bg-white p-5 md:grid-cols-4">
        <input
          aria-label="Räkenskapsår"
          className={inputClass}
          placeholder="Räkenskapsår-ID"
          value={fiscalYear}
          onChange={(event) => setFiscalYear(event.target.value)}
        />
        <input
          aria-label="Rapportdatum"
          className={inputClass}
          type="date"
          value={reportDate}
          onChange={(event) => setReportDate(event.target.value)}
        />
        <input
          aria-label="Jämförelsedatum"
          className={inputClass}
          type="date"
          value={comparisonDate}
          onChange={(event) => setComparisonDate(event.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void run()}>
            Visa rapport
          </Button>
          <Button type="button" variant="outline" disabled={!report} onClick={() => window.print()}>
            Skriv ut / PDF
          </Button>
          <Button type="button" variant="outline" disabled={!report} onClick={exportCsv}>
            Exportera CSV
          </Button>
        </div>
      </section>
      <p className="mt-2 text-xs text-[#638292]">
        Jämförelse visar samma rapport upp till valt jämförelsedatum. PDF använder webbläsarens
        utskriftsdialog.
      </p>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {report ? (
        <section className="mt-6 bg-white print:mt-0">
          <div className="mb-5 border border-[#d6e3e9] p-4 text-sm text-[#527080]">
            <span>
              {report.fiscalYear.name} · Per {report.reportDate}
            </span>
            {report.comparisonDate ? (
              <span className="float-right">Jämförelse: {report.comparisonDate}</span>
            ) : null}
          </div>
          {report.groups.map((group) => (
            <article key={group.key} className="mb-6 border border-[#d6e3e9]">
              <h2 className="border-b p-4 font-semibold text-[#17384b]">{group.label}</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="p-3 text-left">Konto</th>
                    <th className="p-3 text-right">Belopp</th>
                    {report.comparisonDate ? <th className="p-3 text-right">Jämförelse</th> : null}
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
            </article>
          ))}
          <div
            className={`border-2 p-4 font-semibold ${report.totals.difference === "0.00" ? "border-[#23704d] text-[#155637]" : "border-red-700 text-red-700"}`}
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
