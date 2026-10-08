"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { PageHeader } from "@/components/ui/workspace";
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
const inputClass = "h-10 w-full rounded-md border border-border bg-white px-3 text-sm";

export function ProcessingHistory() {
  const { activeOrganizationId } = useAuth();
  return <OrganizationProcessingHistory key={activeOrganizationId ?? "no-organization"} />;
}

function OrganizationProcessingHistory() {
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
      <PageHeader
        title="Behandlingshistorik"
        context="Inställningar"
        description="Följ bokföringsåtgärder och behörighetsändringar. Historiken är skrivskyddad."
      />
      <form
        className="mt-6 grid gap-4 rounded-lg border border-border bg-white p-5 sm:grid-cols-3"
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
        <p role="alert" className="mt-5 text-danger">
          {error}
        </p>
      ) : null}
      {result ? (
        <>
          <div className="table-frame mt-6" tabIndex={0}>
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted">
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
                  <tr key={event.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap p-4">
                      <time dateTime={event.timestamp}>
                        {new Date(event.timestamp).toLocaleString("sv-SE", {
                          timeZone: "Europe/Stockholm"
                        })}
                      </time>
                    </td>
                    <td className="p-4">{event.actor?.displayName ?? "System / okänd aktör"}</td>
                    <td className="p-4">{actions[event.action] ?? event.action}</td>
                    <td className="p-4">{entities[event.entityType] ?? event.entityType}</td>
                    <td className="p-4">
                      <details>
                        <summary className="cursor-pointer">Visa detaljer</summary>
                        <pre className="mt-2 max-w-sm overflow-auto whitespace-pre-wrap text-xs">
                          {JSON.stringify(event.metadata, null, 2)}
                        </pre>
                        <p className="mt-2 break-all text-xs">
                          Aktörs-ID: {event.actorUserId ?? "System"}
                          <br />
                          Objekt-ID: {event.entityId}
                          <br />
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
              <p className="p-6 text-secondary">Inga händelser matchar urvalet.</p>
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
