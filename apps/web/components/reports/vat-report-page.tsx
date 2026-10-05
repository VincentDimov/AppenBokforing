"use client";

import { useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";

type VatReport = {
  codes: {
    code: string;
    inputAmount: string;
    name: string;
    outputAmount: string;
    rate: string;
    type: string;
  }[];
  anomalies: { account: string; code: string; message: string; voucher: string | null }[];
  totals: { inputVat: string; outputVat: string; vatPosition: string };
};
const inputClass = "h-10 rounded-md border border-[#b9cbd4] bg-white px-3 text-sm";

export function VatReportPage() {
  const { activeOrganizationId } = useAuth();
  const [fiscalYear, setFiscalYear] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [report, setReport] = useState<VatReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    if (!activeOrganizationId || !fiscalYear || !fromDate || !toDate)
      return setError("Välj räkenskapsår och datumintervall.");
    const query = new URLSearchParams({
      organizationId: activeOrganizationId,
      fiscalYear,
      fromDate,
      toDate
    });
    const response = await fetch(`/api/reports/vat?${query}`, {
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
          : "Momsrapporten kunde inte laddas."
      );
      return;
    }
    setError(null);
    setReport(body as VatReport);
  }
  function exportCsv() {
    if (!report) return;
    const rows = [
      ["VAT-kod", "Namn", "Typ", "Sats", "Ingående", "Utgående"],
      ...report.codes.map((code) => [
        code.code,
        code.name,
        code.type,
        code.rate,
        code.inputAmount,
        code.outputAmount
      ])
    ];
    const content = rows
      .map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(";"))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `momsrapport-${toDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="mx-auto max-w-5xl print:max-w-none">
      <header className="border-b border-[#ccdce4] pb-6">
        <p className="text-xs font-semibold tracking-[.1em] uppercase text-[#638292]">Rapporter</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#12374c]">Momsrapport</h1>
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
        Rapporten bygger på organisationens konfigurerade VAT-koder och kräver manuell kontroll före
        deklaration.
      </p>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {report ? (
        <section className="mt-6 space-y-6 bg-white print:mt-0">
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary label="Ingående VAT" value={report.totals.inputVat} />
            <Summary label="Utgående VAT" value={report.totals.outputVat} />
            <Summary label="VAT-position" value={report.totals.vatPosition} />
          </div>
          <article className="border border-[#d6e3e9]">
            <h2 className="border-b p-4 font-semibold text-[#17384b]">
              Konfigurerade VAT-koder med bokförda belopp
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-3 text-left">Kod</th>
                  <th className="p-3 text-left">Namn</th>
                  <th className="p-3 text-right">Sats</th>
                  <th className="p-3 text-right">Ingående</th>
                  <th className="p-3 text-right">Utgående</th>
                </tr>
              </thead>
              <tbody>
                {report.codes.map((code) => (
                  <tr key={code.code}>
                    <td className="p-3 font-medium">{code.code}</td>
                    <td className="p-3">{code.name}</td>
                    <td className="p-3 text-right">{code.rate} %</td>
                    <td className="p-3 text-right">{code.inputAmount}</td>
                    <td className="p-3 text-right">{code.outputAmount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
          <article className="border border-[#ead4a1] bg-[#fffaf0]">
            <h2 className="border-b border-[#ead4a1] p-4 font-semibold text-[#72520e]">
              Avvikelser att granska ({report.anomalies.length})
            </h2>
            {report.anomalies.length === 0 ? (
              <p className="p-4 text-sm text-[#5d715f]">
                Inga metadata- eller balansavvikelser hittades i urvalet.
              </p>
            ) : (
              <ul className="divide-y divide-[#eadfbe]">
                {report.anomalies.map((anomaly, index) => (
                  <li
                    className="p-4 text-sm"
                    key={`${anomaly.code}-${anomaly.voucher ?? ""}-${index}`}
                  >
                    <span className="font-semibold">{anomaly.code}</span>
                    <span className="ml-2">{anomaly.message}</span>
                    <span className="ml-2 text-[#806f51]">
                      {anomaly.account}
                      {anomaly.voucher ? ` · ${anomaly.voucher}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </section>
      ) : null}
    </div>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#d6e3e9] p-4">
      <p className="text-xs font-medium text-[#638292]">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[#17384b]">{value}</p>
    </div>
  );
}
