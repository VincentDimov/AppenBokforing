"use client";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { downloadReportCsv } from "@/lib/report-csv";
export function ReportTools({ report, url }: { report: unknown; url: string }) {
  const { activeOrganization } = useAuth();
  const [error, setError] = useState("");
  if (!report || !url || !activeOrganization) return null;
  const labels: Record<string, string> = {
    fromDate: "Från",
    toDate: "Till",
    reportDate: "Rapportdatum",
    comparisonDate: "Jämförelse",
    accountFrom: "Från konto",
    accountTo: "Till konto",
    project: "Projekt",
    costCenter: "Kostnadsställe"
  };
  const data = report as { fiscalYear?: { name?: string }; generatedAt?: string };
  return (
    <section className="report-metadata my-4 border-b pb-3">
      <p>
        {activeOrganization.name} ·{" "}
        {activeOrganization.organizationNumber ?? "Organisationsnummer saknas"}
      </p>
      <p className="text-sm">
        Urval:{" "}
        {[...new URL(url, "https://local.invalid").searchParams.entries()]
          .filter(([key]) => key !== "organizationId" && key !== "fiscalYear")
          .map(([key, value]) => `${labels[key] ?? key}: ${value}`)
          .join(" · ")}
      </p>
      {data.fiscalYear?.name && <p className="text-sm">Räkenskapsår: {data.fiscalYear.name}</p>}
      <Button
        variant="outline"
        type="button"
        className="mt-3 print:hidden"
        onClick={() => {
          try {
            downloadReportCsv(report, url, activeOrganization);
            setError("");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Export misslyckades.");
          }
        }}
      >
        <Download aria-hidden="true" className="size-4" /> Exportera CSV
      </Button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
