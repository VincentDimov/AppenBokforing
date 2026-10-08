"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useFiscalYears } from "@/lib/use-fiscal-years";
import { workspaceRequest } from "@/lib/workspace-api";
import { bytesBase64, downloadBinary } from "@/lib/binary-download";
interface Preview {
  mode: "PREVIEW" | "CONFIRMED";
  organization: { name?: string; number?: string } | null;
  fiscalYear: { start: string; end: string } | null;
  fiscalYears: { index: string; start: string; end: string }[];
  accountsFound: number;
  openingBalancesFound: number;
  vouchersFound: number;
  objectsFound: number;
  warnings: string[];
  validationErrors: string[];
  previewToken: string;
  accountsCreated?: number;
  accountsReused?: number;
  openingBalances: { account: string; amount: string }[];
}
interface HistoryItem {
  id: string;
  sourceFileName?: string | null;
  sourceSha256?: string | null;
  status: string;
  importedEntryCount?: number;
  exportedEntryCount?: number;
  createdAt: string;
  fiscalYear: { name: string } | null;
  importedBy?: { displayName: string } | null;
  exportedBy?: { displayName: string } | null;
  summary?: { warnings?: string[] } | null;
}
export function SiePage() {
  const { activeOrganization } = useAuth();
  if (!activeOrganization) return <p>Välj organisation.</p>;
  return (
    <Workspace
      key={activeOrganization.id}
      org={activeOrganization.id}
      role={activeOrganization.role}
    />
  );
}
function Workspace({ org, role }: { org: string; role: string }) {
  const calendar = useFiscalYears(org),
    [file, setFile] = useState<{ name: string; size: number; contentBase64: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null),
    [reviewed, setReviewed] = useState(false);
  const [history, setHistory] = useState<{ imports: HistoryItem[]; exports: HistoryItem[] } | null>(
    null
  );
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const inFlight = useRef(false),
    request = useRef<AbortController | null>(null),
    fileGeneration = useRef(0);
  const canWrite = ["OWNER", "ADMIN", "ACCOUNTANT"].includes(role);
  useEffect(() => {
    setPreview(null);
    setReviewed(false);
    request.current?.abort();
    setBusy(false);
  }, [calendar.selected]);
  useEffect(() => {
    const controller = new AbortController();
    workspaceRequest<{ imports: HistoryItem[]; exports: HistoryItem[] }>(
      `/organizations/${org}/sie/history`,
      { signal: controller.signal }
    )
      .then((value) => {
        if (!controller.signal.aborted) setHistory(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMessage("Kunde inte läsa SIE-historiken.");
      });
    return () => controller.abort();
  }, [org, revision]);
  useEffect(
    () => () => {
      fileGeneration.current++;
      request.current?.abort();
    },
    []
  );
  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const source = event.target.files?.[0],
      generation = ++fileGeneration.current;
    request.current?.abort();
    setFile(null);
    setPreview(null);
    setReviewed(false);
    setMessage("");
    if (!source) return;
    if (source.size > 131072 || !/\.(sie|se4)$/i.test(source.name)) {
      setMessage("Välj en .sie/.se4-fil på högst 128 KiB.");
      return;
    }
    try {
      const bytes = new Uint8Array(await source.arrayBuffer());
      if (generation === fileGeneration.current)
        setFile({ name: source.name, size: bytes.length, contentBase64: bytesBase64(bytes) });
    } catch {
      if (generation === fileGeneration.current) setMessage("Filen kunde inte läsas.");
    }
  }
  async function submit(confirm = false) {
    if (
      inFlight.current ||
      !file ||
      !calendar.selected ||
      (confirm && (!reviewed || !preview || preview.validationErrors.length))
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await workspaceRequest<Preview>("/imports/sie", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          organizationId: org,
          fiscalYearId: calendar.selected,
          fileName: file.name,
          contentBase64: file.contentBase64,
          ...(confirm ? { confirm: true, previewToken: preview!.previewToken } : {})
        })
      });
      if (!controller.signal.aborted) {
        setPreview(result);
        setReviewed(false);
        if (confirm) {
          setFile(null);
          setRevision((value) => value + 1);
        }
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(error instanceof Error ? error.message : "SIE-åtgärden misslyckades.");
    } finally {
      inFlight.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function exportFile() {
    if (inFlight.current || !calendar.selected) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      await downloadBinary(
        `/api/exports/sie?${new URLSearchParams({ organizationId: org, fiscalYear: calendar.selected })}`,
        "ledgerapp.sie",
        controller.signal
      );
      if (!controller.signal.aborted) setRevision((value) => value + 1);
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(error instanceof Error ? error.message : "Exporten misslyckades.");
    } finally {
      inFlight.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="space-y-5 rounded-xl bg-white p-6">
      <h1 className="text-2xl font-semibold">SIE import / export</h1>
      <p>
        SIE 4B, begränsad PC8-subset. Dimension 1 (kostnadsställe) och 6 (projekt) stöds. Andra
        materiella poster kan blockera import/export. Momsklassificering måste granskas separat;
        ingen certifiering påstås.
      </p>
      <label>
        Räkenskapsår för SIE{" "}
        <select
          aria-label="Räkenskapsår för SIE"
          className="m-2 border p-2"
          disabled={busy}
          value={calendar.selected}
          onChange={(event) => calendar.select(event.target.value)}
        >
          <option value="">Välj år</option>
          {calendar.years.map((year) => (
            <option key={year.id} value={year.id}>
              {year.name} ({year.startDate.slice(0, 10)}–{year.endDate.slice(0, 10)})
            </option>
          ))}
        </select>
      </label>
      <p role="alert">{message || calendar.error}</p>
      <section className="rounded border p-4">
        <h2 className="text-xl font-semibold">Importera SIE</h2>
        {canWrite ? (
          <fieldset disabled={busy}>
            <label className="block my-3">
              SIE-fil{" "}
              <input
                aria-label="SIE-fil"
                type="file"
                accept=".sie,.se4"
                onChange={(event) => void choose(event)}
              />
            </label>
            {file && (
              <p>
                {file.name} · {file.size} byte
              </p>
            )}
            <button
              type="button"
              className="my-3 rounded border p-2"
              disabled={!file || !calendar.selected}
              onClick={() => void submit()}
            >
              Förhandsgranska SIE
            </button>
          </fieldset>
        ) : (
          <p>Din roll kan läsa historik och exportera, men inte importera.</p>
        )}
        {preview && (
          <section aria-label="SIE-förhandsgranskning" className="space-y-3 border-t pt-3">
            <h3>{preview.mode === "CONFIRMED" ? "Import slutförd" : "Granska före import"}</h3>
            <p>
              Företag i fil: {preview.organization?.name ?? "Ej angivet"} ·{" "}
              {preview.organization?.number ?? "Ej angivet"}
            </p>
            <p>
              Filens räkenskapsår:{" "}
              {preview.fiscalYear
                ? `${preview.fiscalYear.start}–${preview.fiscalYear.end}`
                : "Saknas"}
            </p>
            <p>
              Konton: {preview.accountsFound} · Ingående balanser: {preview.openingBalancesFound} ·
              Verifikationer: {preview.vouchersFound} · Dimensioner: {preview.objectsFound}
            </p>
            {preview.mode === "CONFIRMED" && (
              <p>
                Konton skapade: {preview.accountsCreated}; återanvända: {preview.accountsReused}
              </p>
            )}
            <h4>INFO — Ingående balanser</h4>
            <ul>
              {preview.openingBalances.map((row, index) => (
                <li key={`${row.account}:${index}`}>
                  {row.account}: {row.amount}
                </li>
              ))}
            </ul>
            <h4>VARNINGAR</h4>
            <ul>
              {preview.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
            <h4>BLOCKERANDE FEL / ej stödda poster</h4>
            <ul>
              {preview.validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
            {preview.mode === "PREVIEW" && canWrite && (
              <fieldset disabled={busy || preview.validationErrors.length > 0}>
                <label className="block">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(event) => setReviewed(event.target.checked)}
                  />{" "}
                  Jag har granskat förhandsvisningen och vill importera filen.
                </label>
                <button
                  type="button"
                  disabled={!reviewed || !file}
                  className="my-3 rounded bg-[#17384b] p-3 text-white"
                  onClick={() => void submit(true)}
                >
                  Bekräfta import
                </button>
              </fieldset>
            )}
            {preview.mode === "CONFIRMED" && (
              <nav className="flex gap-4">
                <Link href="/bookkeeping/vouchers">Verifikationer</Link>
                <Link href="/reports/trial-balance">Saldobalans</Link>
                <Link href="/reports/general-ledger">Huvudbok</Link>
              </nav>
            )}
          </section>
        )}
      </section>
      <section className="rounded border p-4">
        <h2 className="text-xl font-semibold">Exportera SIE</h2>
        <p>
          Exporten innehåller IB och bokförda verifikationer för valt år. Original och rättelser
          bevaras. Filen förblir PC8-bytes.
        </p>
        <button
          type="button"
          className="my-3 rounded border p-2"
          disabled={busy || !calendar.selected}
          onClick={() => void exportFile()}
        >
          Ladda ner SIE
        </button>
      </section>
      <section className="rounded border p-4">
        <h2 className="text-xl font-semibold">Historik</h2>
        <p>
          Senaste 100 importer och exporter. Endast lyckade bekräftelser skrivs atomärt till
          historiken. Källfilen lagras inte automatiskt.
        </p>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Tid</th>
              <th>Typ / fil</th>
              <th>År</th>
              <th>Aktör</th>
              <th>Status / antal</th>
              <th>SHA-256 / varningar</th>
            </tr>
          </thead>
          <tbody>
            {history?.imports.map((row) => (
              <tr key={row.id}>
                <td>{row.createdAt}</td>
                <td>{row.sourceFileName ?? "SIE-import"}</td>
                <td>{row.fiscalYear?.name}</td>
                <td>{row.importedBy?.displayName}</td>
                <td>
                  {row.status} · {row.importedEntryCount}
                </td>
                <td className="max-w-72 break-all">
                  {row.sourceSha256}
                  <ul>
                    {row.summary?.warnings?.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
            {history?.exports.map((row) => (
              <tr key={row.id}>
                <td>{row.createdAt}</td>
                <td>SIE-export</td>
                <td>{row.fiscalYear?.name}</td>
                <td>{row.exportedBy?.displayName}</td>
                <td>
                  {row.status} · {row.exportedEntryCount}
                </td>
                <td>Export kontrollerad av servern</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  );
}
