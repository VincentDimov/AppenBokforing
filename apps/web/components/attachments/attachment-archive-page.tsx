"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { workspaceRequest } from "@/lib/workspace-api";
import { getAttachmentDownload } from "@/lib/api/attachments";
interface Item {
  id: string;
  originalName: string;
  createdAt: string;
  mimeType: string;
  kind?: string;
  size: string;
  sha256: string;
  uploadedBy: { id: string; displayName: string } | null;
  journalEntry: {
    id: string;
    status: string;
    voucherNumber: number | null;
    entryDate: string;
    description: string;
    voucherSeries: { code: string };
  } | null;
}
export function AttachmentArchivePage() {
  const { activeOrganizationId } = useAuth();
  if (!activeOrganizationId) return <p>Välj organisation.</p>;
  return <Archive key={activeOrganizationId} org={activeOrganizationId} />;
}
function Archive({ org }: { org: string }) {
  const [filters, setFilters] = useState<Record<string, string>>({}),
    [page, setPage] = useState<{ items: Item[]; nextCursor: string | null } | null>(null);
  const [cursor, setCursor] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    setPage(null);
    setMessage("");
    setBusy(true);
    workspaceRequest<{ items: Item[]; nextCursor: string | null }>(
      `/organizations/${org}/attachments?${new URLSearchParams({ ...filters, ...(cursor ? { cursor } : {}) })}`,
      { signal: controller.signal }
    )
      .then((page) => {
        if (!controller.signal.aborted) setPage(page);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setMessage(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [org, filters, cursor]);
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setCursor("");
    setFilters(
      Object.fromEntries(
        [...data.entries()]
          .map(([key, value]) => [key, String(value).trim()])
          .filter(([, value]) => value)
      )
    );
  }
  async function download(id: string) {
    try {
      const link = await getAttachmentDownload(id);
      if (mounted.current) window.location.assign(link.downloadUrl);
    } catch (error) {
      if (mounted.current)
        setMessage(error instanceof Error ? error.message : "Kunde inte ladda ner bilagan.");
    }
  }
  return (
    <section className="space-y-4 rounded-xl bg-white p-6">
      <h1 className="text-2xl font-semibold">Bilagearkiv</h1>
      <p>
        Organisationens privata bilagor och dokument, även utan verifikationskoppling. Nedladdning
        kräver aktuell behörighet. Ingen osäker HTML-/PDF-inbäddning eller permanent publik länk.
      </p>
      <form onSubmit={search} className="flex flex-wrap gap-3">
        <label>
          Verifikationskoppling{" "}
          <select name="hasVoucher" className="border p-2">
            <option value="">Alla dokument</option>
            <option value="true">Med verifikation</option>
            <option value="false">Utan verifikation</option>
          </select>
        </label>
        <label>
          Filnamn (minst 3 tecken) <input name="search" className="border p-2" maxLength={160} />
        </label>
        <label>
          Uppladdad från <input name="fromDate" type="date" className="border p-2" />
        </label>
        <label>
          Uppladdad till <input name="toDate" type="date" className="border p-2" />
        </label>
        <label>
          Filtyp{" "}
          <select name="mimeType" aria-label="Filtyp" className="border p-2">
            <option value="">Alla</option>
            <option value="application/pdf">PDF</option>
            <option value="image/jpeg">JPEG</option>
            <option value="image/png">PNG</option>
            <option value="image/webp">WEBP</option>
          </select>
        </label>
        <label>
          Verifikationsstatus{" "}
          <select name="status" aria-label="Verifikationsstatus" className="border p-2">
            <option value="">Alla</option>
            <option>DRAFT</option>
            <option>POSTED</option>
            <option>REVERSED</option>
          </select>
        </label>
        <label>
          Serie <input name="series" className="w-20 border p-2" pattern="[A-Z0-9_-]{1,16}" />
        </label>
        <label>
          Verifikationsnummer{" "}
          <input name="voucherNumber" className="w-24 border p-2" type="number" min="1" />
        </label>
        <label>
          Uppladdare (ID) <input name="uploadedBy" className="border p-2" />
        </label>
        <button className="rounded border p-2">Sök bilagor</button>
      </form>
      <p role="status">{busy ? "Läser bilagor…" : message}</p>
      {!busy && page?.items.length === 0 && (
        <p>Inga bilagor matchar urvalet. Bilagor laddas upp på en sparad utkastverifikation.</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Filnamn</th>
              <th>Uppladdad</th>
              <th>Verifikation / datum</th>
              <th>Status</th>
              <th>Uppladdare</th>
              <th>Storlek / typ</th>
              <th>Åtgärd</th>
            </tr>
          </thead>
          <tbody>
            {page?.items.map((item) => (
              <tr key={item.id} className="border-t">
                <td>{item.originalName}</td>
                <td>{item.createdAt.slice(0, 10)}</td>
                <td>
                  {item.journalEntry ? (
                    <Link
                      className="underline"
                      href={`/bookkeeping/vouchers/${item.journalEntry.id}`}
                    >
                      {item.journalEntry.voucherSeries.code}{" "}
                      {item.journalEntry.voucherNumber ?? "utkast"} ·{" "}
                      {item.journalEntry.entryDate.slice(0, 10)}
                    </Link>
                  ) : (
                    "Ej kopplad till verifikation"
                  )}
                </td>
                <td>{item.journalEntry?.status ?? "—"}</td>
                <td>{item.uploadedBy?.displayName ?? "Okänd"}</td>
                <td>
                  {item.size} byte · {item.mimeType}
                  {item.kind ? ` · ${item.kind}` : ""}
                </td>
                <td>
                  <button className="p-2 underline" onClick={() => void download(item.id)}>
                    Ladda ner {item.originalName}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={!cursor || busy}
          className="border p-2"
          onClick={() => setCursor("")}
        >
          Första sidan
        </button>
        <button
          type="button"
          disabled={!page?.nextCursor || busy}
          className="border p-2"
          onClick={() => setCursor(page!.nextCursor!)}
        >
          Nästa sida
        </button>
      </div>
    </section>
  );
}
