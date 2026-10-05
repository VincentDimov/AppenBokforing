"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";

const actions: Record<string, string> = {
  CREATE: "Skapad / tillagd",
  UPDATE: "Ändrad",
  DELETE: "Borttagen",
  POST: "Bokförd",
  REVERSE: "Rättad",
  LOCK: "Låst",
  UNLOCK: "Upplåst",
  IMPORT: "Importerad",
  EXPORT: "Exporterad"
};
const entities: Record<string, string> = {
  ORGANIZATION: "Organisation",
  FISCAL_YEAR: "Räkenskapsår",
  ACCOUNTING_PERIOD: "Redovisningsperiod",
  JOURNAL_ENTRY: "Verifikation",
  ATTACHMENT: "Bilaga",
  SIE_IMPORT: "SIE-import",
  SIE_EXPORT: "SIE-export",
  ORGANIZATION_MEMBER: "Medlemskap",
  USER: "Användare",
  ACCOUNT: "Konto",
  VAT_CODE: "Momskod",
  VOUCHER_SERIES: "Verifikationsserie",
  JOURNAL_LINE: "Verifikationsrad",
  PROJECT: "Projekt",
  COST_CENTER: "Kostnadsställe",
  POSTING_TEMPLATE: "Konteringsmall",
  OPENING_BALANCE: "Ingående balans"
};
type Event = {
  id: string;
  timestamp: string;
  actorUserId: string | null;
  actor: { displayName: string } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  requestId: string | null;
};
type History = { events: Event[]; page: number; hasMore: boolean };
const inputClass = "h-10 w-full rounded-md border border-[#b9cbd4] bg-white px-3 text-sm";

export function ProcessingHistory() {
  const { activeOrganizationId } = useAuth();
  const [filters, setFilters] = useState({
    fromDate: "",
    toDate: "",
    user: "",
    action: "",
    entityType: ""
  });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [storedResult, setResult] = useState<History | null>(null);
  const [loadedOrganizationId, setLoadedOrganizationId] = useState("");
  const result = loadedOrganizationId === activeOrganizationId ? storedResult : null;
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setPage(1);
  }, [activeOrganizationId]);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError("");
    if (!activeOrganizationId) return;
    setLoading(true);
    const query = new URLSearchParams({ organizationId: activeOrganizationId, page: String(page) });
    Object.entries(applied).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    void fetch(`/api/audit-events?${query}`, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Historiken kunde inte hämtas. Kontrollera filtren och försök igen.");
        return response.json() as Promise<History>;
      })
      .then((history) => {
        if (!controller.signal.aborted) {
          setResult(history);
          setLoadedOrganizationId(activeOrganizationId);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Historiken kunde inte hämtas. Kontrollera filtren och försök igen.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [activeOrganizationId, applied, page]);
  return (
    <div className="mx-auto max-w-6xl">
      <header>
        <p className="text-sm text-[#638292]">Inställningar</p>
        <h1 className="mt-2 text-3xl font-semibold">Behandlingshistorik</h1>
        <p className="mt-3 text-sm text-[#527080]">
          Följ organisationens bokföringsåtgärder och behörighetsändringar.
        </p>
      </header>
      <form
        className="mt-6 grid gap-4 rounded-xl border border-[#d6e3e9] bg-white p-5 sm:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setApplied({ ...filters });
        }}
      >
        {(
          [
            ["fromDate", "Från datum", "date"],
            ["toDate", "Till datum", "date"],
            ["user", "Användar-ID", "text"]
          ] as const
        ).map(([key, label, type]) => (
          <label className="space-y-2 text-sm" key={key}>
            <span>{label}</span>
            <input
              className={inputClass}
              type={type}
              value={filters[key]}
              onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}
            />
          </label>
        ))}
        <label className="space-y-2 text-sm">
          <span>Åtgärd</span>
          <select
            className={inputClass}
            value={filters.action}
            onChange={(event) => setFilters({ ...filters, action: event.target.value })}
          >
            <option value="">Alla åtgärder</option>
            {Object.entries(actions).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm">
          <span>Objekttyp</span>
          <select
            className={inputClass}
            value={filters.entityType}
            onChange={(event) => setFilters({ ...filters, entityType: event.target.value })}
          >
            <option value="">Alla objekttyper</option>
            {Object.entries(entities).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" className="self-end">
          Filtrera
        </Button>
      </form>
      {loading ? (
        <p role="status" className="mt-5">
          Hämtar historik…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-5 text-red-700">
          {error}
        </p>
      ) : null}
      {result ? (
        <>
          <div className="mt-6 overflow-x-auto rounded-xl border border-[#d6e3e9] bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f1f6f8]">
                <tr>
                  {["Tidpunkt", "Användare", "Åtgärd", "Objekt", "Detaljer"].map((title) => (
                    <th className="p-4" key={title} scope="col">
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.events.map((event) => (
                  <tr key={event.id} className="border-t border-[#d6e3e9] align-top">
                    <td className="whitespace-nowrap p-4">
                      <time dateTime={event.timestamp}>
                        {new Date(event.timestamp).toLocaleString("sv-SE", {
                          timeZone: "Europe/Stockholm"
                        })}
                      </time>
                    </td>
                    <td className="p-4">
                      {event.actor?.displayName ?? "System / okänd aktör"}
                      <span className="mt-1 block text-xs text-[#638292]">{event.actorUserId}</span>
                    </td>
                    <td className="p-4">{actions[event.action] ?? event.action}</td>
                    <td className="p-4">
                      {entities[event.entityType] ?? event.entityType}
                      <span className="mt-1 block break-all text-xs text-[#638292]">
                        {event.entityId}
                      </span>
                    </td>
                    <td className="p-4">
                      <details>
                        <summary className="cursor-pointer">Visa detaljer</summary>
                        <pre className="mt-2 max-w-sm overflow-auto whitespace-pre-wrap text-xs">
                          {JSON.stringify(event.metadata, null, 2)}
                        </pre>
                        <p className="mt-2 break-all text-xs">
                          Händelse: {event.id}
                          <br />
                          Förfrågan: {event.requestId ?? "Saknas i äldre historik"}
                        </p>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!result.events.length ? (
              <p className="p-6 text-[#527080]">Inga händelser matchar urvalet.</p>
            ) : null}
          </div>
          <div className="mt-4 flex items-center justify-end gap-3">
            <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Föregående
            </Button>
            <span>Sida {result.page}</span>
            <Button variant="outline" disabled={!result.hasMore} onClick={() => setPage(page + 1)}>
              Nästa
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
