"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { getJournalEntry, type JournalEntry } from "@/lib/api/journal-entries";
import { getJournalEntryAttachments, type JournalEntryAttachment } from "@/lib/api/attachments";
export function VoucherReport({ id }: { id: string }) {
  const { activeOrganizationId } = useAuth();
  return <Report key={`${activeOrganizationId}:${id}`} id={id} org={activeOrganizationId} />;
}
function Report({ id, org }: { id: string; org: string }) {
  const { activeOrganization } = useAuth();
  const [data, setData] = useState<{
      entry: JournalEntry;
      attachments: JournalEntryAttachment[];
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getJournalEntry(id, controller.signal),
      getJournalEntryAttachments(id, controller.signal)
    ])
      .then(([entry, attachments]) => {
        if (controller.signal.aborted) return;
        if (entry.organizationId !== org)
          throw new Error("Verifikationen tillhör inte aktiv organisation.");
        setData({ entry, attachments });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [id, org]);
  if (!data) return <p role="status">{error || "Läser verifikationsrapport…"}</p>;
  const { entry, attachments } = data;
  return (
    <article className="mx-auto max-w-6xl space-y-5 rounded-xl bg-white p-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Verifikationsrapport · {entry.voucherSeries?.code} {entry.voucherNumber ?? "utkast"}
        </h1>
        <p>
          {activeOrganization?.name} ·{" "}
          {activeOrganization?.organizationNumber ?? "Organisationsnummer saknas"}
        </p>
        <p className="text-xs">
          Företagsuppgifter är aktuella registeruppgifter, inte historisk snapshot.
        </p>
        <p>
          {entry.fiscalYear.name} · {entry.fiscalYear.startDate} – {entry.fiscalYear.endDate}
        </p>
        <p>
          Verifikationsdatum: {entry.transactionDate} · Bokförd: {entry.postedAt ?? "Ej bokförd"} ·
          Status: {entry.status}
        </p>
        <p>
          Skapad: {entry.createdAt} · ID: {entry.id}
        </p>
        <h2 className="mt-3 font-semibold">{entry.description}</h2>
      </header>
      {entry.status === "DRAFT" && <p>UTKAST — inte bokförd redovisning.</p>}
      {entry.lines.some((line) => line.legacyAccountLabel) && (
        <p>
          Äldre bokföring saknar kontonamn-snapshot. Namnet är skyddat mot framtida ändring men
          tidigare namn kan inte bevisas.
        </p>
      )}
      <button
        type="button"
        className="rounded border p-2 print:hidden"
        onClick={() => window.print()}
      >
        Skriv ut / Spara PDF
      </button>
      <table className="w-full text-left">
        <thead>
          <tr>
            {[
              "Konto",
              "Kontonamn",
              "Beskrivning",
              "Projekt",
              "Kostnadsställe",
              "Debet",
              "Kredit"
            ].map((label) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entry.lines.map((line) => (
            <tr key={line.id}>
              <td>{line.account.number}</td>
              <td>{line.account.name}</td>
              <td>{line.description}</td>
              <td>{line.project ? `${line.project.code} · ${line.project.name}` : "—"}</td>
              <td>{line.costCenter ? `${line.costCenter.code} · ${line.costCenter.name}` : "—"}</td>
              <td>{line.debit}</td>
              <td>{line.credit}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="report-totals">
          <tr>
            <th colSpan={5}>Summa</th>
            <td>{entry.totals.debit}</td>
            <td>{entry.totals.credit}</td>
          </tr>
        </tfoot>
      </table>
      {(entry.reversesEntry || entry.reversedByEntry) && (
        <section>
          <h2 className="font-semibold">Rättelsekedja</h2>
          {entry.reversesEntry && (
            <Link className="block underline" href={`/reports/voucher/${entry.reversesEntry.id}`}>
              Ursprunglig verifikation · {entry.reversesEntry.voucherSeries?.code}{" "}
              {entry.reversesEntry.voucherNumber}
            </Link>
          )}
          {entry.reversedByEntry && (
            <Link className="block underline" href={`/reports/voucher/${entry.reversedByEntry.id}`}>
              Rättelseverifikation · {entry.reversedByEntry.voucherSeries?.code}{" "}
              {entry.reversedByEntry.voucherNumber}
            </Link>
          )}
        </section>
      )}
      <section>
        <h2 className="font-semibold">Bilagereferenser</h2>
        {attachments.length ? (
          <ul>
            {attachments.map((file) => (
              <li key={file.id} className="break-all">
                {file.originalName} · ID {file.id} · SHA-256 {file.sha256}
              </li>
            ))}
          </ul>
        ) : (
          <p>Inga bilagor.</p>
        )}
      </section>
    </article>
  );
}
