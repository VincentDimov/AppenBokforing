"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Feedback, LoadingState, PageHeader, StatusBadge } from "@/components/ui/workspace";
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
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
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
  }, [id, org, attempt]);
  if (!data)
    return (
      <section>
        <PageHeader title="Verifikationsrapport" context="Rapporter" />
        {error ? (
          <Feedback
            kind="error"
            action={
              <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
                Försök igen
              </Button>
            }
          >
            {error}
          </Feedback>
        ) : (
          <LoadingState label="Hämtar verifikationsrapport…" />
        )}
      </section>
    );
  const { entry, attachments } = data;
  return (
    <article className="report-paper mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={`Verifikationsrapport · ${entry.voucherSeries?.code ?? ""} ${entry.voucherNumber ?? "utkast"}`}
        context="Rapporter"
        description={entry.description}
        action={
          <Button variant="outline" className="print:hidden" onClick={() => window.print()}>
            Skriv ut / Spara PDF
          </Button>
        }
      />
      <header className="space-y-3">
        <p>
          {activeOrganization?.name} ·{" "}
          {activeOrganization?.organizationNumber ?? "Organisationsnummer saknas"}
        </p>
        <p className="text-xs text-muted">
          Företagsuppgifter är aktuella registeruppgifter, inte historisk snapshot.
        </p>
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">Räkenskapsår</dt>
            <dd>{entry.fiscalYear.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Verifikationsdatum</dt>
            <dd>{entry.transactionDate.slice(0, 10)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Status</dt>
            <dd className="mt-1">
              <StatusBadge status={entry.status} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Bokföringstid</dt>
            <dd>
              {entry.postedAt
                ? new Date(entry.postedAt).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" })
                : "Ej bokförd"}
            </dd>
          </div>
        </dl>
        <details className="text-xs text-secondary print:hidden">
          <summary>Tekniska detaljer</summary>
          <p className="mt-2 break-all">Verifikations-ID: {entry.id}</p>
          <p>Skapad: {entry.createdAt}</p>
          <p>Bokförd: {entry.postedAt ?? "Ej bokförd"}</p>
          <p>
            Årets start: {entry.fiscalYear.startDate.slice(0, 10)} · Slut:{" "}
            {entry.fiscalYear.endDate.slice(0, 10)}
          </p>
        </details>
      </header>
      {entry.status === "DRAFT" && <p>UTKAST — inte bokförd redovisning.</p>}
      {entry.lines.some((line) => line.legacyAccountLabel) && (
        <p>
          Äldre bokföring saknar kontonamn-snapshot. Namnet är skyddat mot framtida ändring men
          tidigare namn kan inte bevisas.
        </p>
      )}
      <div className="table-frame" tabIndex={0}>
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
                <th
                  key={label}
                  className={label === "Debet" || label === "Kredit" ? "text-right" : undefined}
                >
                  {label}
                </th>
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
                <td>
                  {line.costCenter ? `${line.costCenter.code} · ${line.costCenter.name}` : "—"}
                </td>
                <td className="text-right tabular-nums">{line.debit}</td>
                <td className="text-right tabular-nums">{line.credit}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="report-totals">
            <tr>
              <th colSpan={5}>Summa</th>
              <td className="text-right tabular-nums">{entry.totals.debit}</td>
              <td className="text-right tabular-nums">{entry.totals.credit}</td>
            </tr>
          </tfoot>
        </table>
      </div>
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
