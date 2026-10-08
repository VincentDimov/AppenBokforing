"use client";

import { useState } from "react";
import { ReportTools } from "./report-tools";
import { FiscalYearSelect } from "./fiscal-year-select";
import { PageHeader, EmptyState, LoadingState } from "@/components/ui/workspace";

import { useReportRequest } from "@/lib/use-report-request";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";

type VatReport = {
  codes: {
    id: string;
    code: string;
    inputAmount: string;
    name: string;
    outputAmount: string;
    rate: string;
    type: string;
    configurationVersion: string;
    taxableBase: string;
  }[];
  anomalies: { account: string; code: string; message: string; voucher: string | null }[];
  fromDate: string;
  toDate: string;
  swedishReturn: {
    configurationVersion: string;
    warnings: string[];
    boxes: { box: string; name: string; amount: string }[];
  };
  totals: {
    inputVat: string;
    outputVat: string;
    vatPosition: string;
    outputBase: string;
    inputBase: string;
    nonVatBase: string;
  };
};
const inputClass = "h-10 rounded-md border border-border bg-white px-3 text-sm";

export function VatReportPage() {
  const { activeOrganizationId } = useAuth();
  return <OrganizationVatReportPage key={activeOrganizationId ?? "no-organization"} />;
}

function OrganizationVatReportPage() {
  const { activeOrganizationId } = useAuth();
  const [fiscalYear, setFiscalYear] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const { report, error, setError, load, loadedUrl, loading } = useReportRequest<VatReport>();
  async function run() {
    if (!activeOrganizationId || !fiscalYear || !fromDate || !toDate)
      return setError("Välj räkenskapsår och datumintervall.");
    const query = new URLSearchParams({
      organizationId: activeOrganizationId,
      fiscalYear,
      fromDate,
      toDate
    });
    await load(`/api/reports/vat?${query}`);
  }

  return (
    <div className="mx-auto max-w-5xl print:max-w-none">
      <PageHeader
        title="Momsrapport"
        context="Rapporter"
        description="Välj räkenskapsår och urval. Rapporten baseras på bokförda transaktioner."
      />
      <ReportTools report={report} url={loadedUrl} />
      <section className="report-filters mt-6 grid gap-3 border border-border bg-white p-5 md:grid-cols-4">
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
        Rapporten bygger på organisationens konfigurerade momskoder och kräver manuell kontroll före
        deklaration.
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
        <section className="mt-6 space-y-6 bg-white print:mt-0">
          <p>
            Period: {report.fromDate} – {report.toDate}. Granskning krävs; ingen deklarationsfil
            eller efterlevnadsgaranti.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary label="Försäljningsunderlag" value={report.totals.outputBase} />
            <Summary label="Inköpsunderlag" value={report.totals.inputBase} />
            <Summary label="Underlag utan moms" value={report.totals.nonVatBase} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary label="Ingående moms" value={report.totals.inputVat} />
            <Summary label="Utgående moms" value={report.totals.outputVat} />
            <Summary label="Momsposition" value={report.totals.vatPosition} />
          </div>
          <article className="border border-border">
            <h2 className="border-b p-4 font-semibold text-ink">
              Konfigurerade momskoder med bokförda belopp
            </h2>
            <div className="table-frame" tabIndex={0}>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="p-3 text-left">Kod</th>
                    <th className="p-3 text-left">Namn</th>
                    <th className="p-3 text-right">Sats</th>
                    <th className="p-3 text-right">Underlag</th>
                    <th className="p-3 text-right">Ingående</th>
                    <th className="p-3 text-right">Utgående</th>
                  </tr>
                </thead>
                <tbody>
                  {report.codes.map((code) => (
                    <tr key={`${code.id ?? code.code}-${code.configurationVersion}-${code.rate}`}>
                      <td className="p-3 font-medium">{code.code}</td>
                      <td className="p-3">{code.name}</td>
                      <td className="p-3 text-right">{code.rate} %</td>
                      <td className="p-3 text-right">{code.taxableBase}</td>
                      <td className="p-3 text-right">{code.inputAmount}</td>
                      <td className="p-3 text-right">{code.outputAmount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
          <article className="border p-4">
            <h2>
              Svenska rapportfält – begränsad mappning ({report.swedishReturn?.configurationVersion}
              )
            </h2>
            {report.swedishReturn?.boxes.map((box) => (
              <p key={box.box}>
                Fält {box.box}: {box.name} — {box.amount}
              </p>
            ))}
            {report.swedishReturn?.warnings.map((warning, index) => (
              <p role="alert" key={index}>
                {warning}
              </p>
            ))}
          </article>
          <article className="border border-border bg-warning-soft">
            <h2 className="border-b border-border p-4 font-semibold text-warning">
              Avvikelser att granska ({report.anomalies.length})
            </h2>
            {report.anomalies.length === 0 ? (
              <p className="p-4 text-sm text-success">
                Inga metadata- eller balansavvikelser hittades i urvalet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {report.anomalies.map((anomaly, index) => (
                  <li
                    className="p-4 text-sm"
                    key={`${anomaly.code}-${anomaly.voucher ?? ""}-${index}`}
                  >
                    <span className="font-semibold">{anomaly.code}</span>
                    <span className="ml-2">{anomaly.message}</span>
                    <span className="ml-2 text-warning">
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
    <div className="border border-border p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink">{value}</p>
    </div>
  );
}
