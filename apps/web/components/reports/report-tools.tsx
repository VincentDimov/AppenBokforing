"use client";
import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { downloadReportCsv } from "@/lib/report-csv";
export function ReportTools({ report, url }: { report: unknown; url: string }) {
  const { activeOrganization } = useAuth();
  const [error, setError] = useState("");
  if (!report || !url || !activeOrganization) return null;
  return (
    <section className="report-metadata my-4 border-b pb-3">
      <p>
        {activeOrganization.name} ·{" "}
        {activeOrganization.organizationNumber ?? "Organisationsnummer saknas"}
      </p>
      <p className="text-sm">
        Urval:{" "}
        {[...new URL(url, "https://local.invalid").searchParams.entries()]
          .filter(([key]) => key !== "organizationId")
          .map(([key, value]) => `${key}: ${value}`)
          .join(" · ")}
      </p>
      <button
        type="button"
        className="mt-2 rounded border px-3 py-2 print:hidden"
        onClick={() => {
          try {
            downloadReportCsv(report, url, activeOrganization);
            setError("");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Export misslyckades.");
          }
        }}
      >
        Exportera CSV
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
