"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/ui/workspace";
import { useAuth } from "@/components/auth/auth-provider";
import { useFiscalYears } from "@/lib/use-fiscal-years";
import { workspaceRequest } from "@/lib/workspace-api";
interface Series {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  nextVoucherNumber: number;
  _count: { journalEntries: number };
}
export function VoucherSeriesPage() {
  const { activeOrganization } = useAuth();
  if (!activeOrganization) return <p>Välj organisation.</p>;
  return (
    <SeriesManagement
      key={activeOrganization.id}
      org={activeOrganization.id}
      role={activeOrganization.role}
      defaultCode={activeOrganization.defaultVoucherSeriesCode ?? "A"}
    />
  );
}
function SeriesManagement({
  org,
  role,
  defaultCode
}: {
  org: string;
  role: string;
  defaultCode: string;
}) {
  const { reloadOrganizations } = useAuth();
  const years = useFiscalYears(org);
  const currentYear = useRef(years.selected);
  currentYear.current = years.selected;
  const [series, setSeries] = useState<Series[]>([]);
  const [editing, setEditing] = useState<Series | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const canWrite = ["OWNER", "ADMIN", "ACCOUNTANT"].includes(role);
  const base = `/organizations/${org}/voucher-series`;
  useEffect(() => {
    setSeries([]);
    setEditing(null);
    if (!years.selected) return;
    const controller = new AbortController();
    workspaceRequest<Series[]>(`${base}?fiscalYear=${years.selected}`, {
      signal: controller.signal
    })
      .then((rows) => {
        if (!controller.signal.aborted && Array.isArray(rows)) setSeries(rows);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setMessage(error.message);
      });
    return () => controller.abort();
  }, [base, years.selected]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const submittedYear = years.selected;
    setBusy(true);
    setMessage("");
    try {
      await workspaceRequest(`${base}${editing ? `/${editing.id}` : ""}`, {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({
          code: form.get("code"),
          name: form.get("name"),
          description: form.get("description"),
          ...(editing
            ? { isActive: form.get("active") === "on" }
            : { fiscalYearId: years.selected })
        })
      });
      const updated = await workspaceRequest<Series[]>(`${base}?fiscalYear=${submittedYear}`);
      if (currentYear.current !== submittedYear) return;
      setSeries(updated);
      setEditing(null);
      setMessage("Serien sparad.");
    } catch (error) {
      if (currentYear.current === submittedYear)
        setMessage(error instanceof Error ? error.message : "Kunde inte spara.");
    } finally {
      setBusy(false);
    }
  }
  async function setDefault(code: string) {
    setBusy(true);
    try {
      await workspaceRequest(`/organizations/${org}`, {
        method: "PATCH",
        body: JSON.stringify({ defaultVoucherSeriesCode: code })
      });
      await reloadOrganizations();
      setMessage("Standardserie sparad.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunde inte spara.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-6">
      <PageHeader
        title="Verifikationsserier"
        context="Inställningar"
        description="Varje serie och år har en egen nummerföljd."
      />
      <label className="my-4 block">
        Räkenskapsår
        <select
          className="ml-3 border p-2"
          value={years.selected}
          onChange={(event) => years.select(event.target.value)}
        >
          {years.years.map((year) => (
            <option key={year.id} value={year.id}>
              {year.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        Nummer tilldelas först vid bokföring. Varje serie och år har egen följd. Ingen manuell
        räknarändring.
      </p>
      <p role="status">{message || years.error}</p>
      <div className="table-frame" tabIndex={0}>
        <table className="my-5 w-full text-left">
          <thead>
            <tr>
              <th>Kod</th>
              <th>Namn</th>
              <th>Status</th>
              <th>Nästa nummer</th>
              <th>Användning</th>
              <th>Åtgärd</th>
            </tr>
          </thead>
          <tbody>
            {series.map((item) => (
              <tr className="border-t" key={item.id}>
                <td>
                  {item.code}
                  {item.code === defaultCode && " · standard"}
                </td>
                <td className="p-3">{item.name}</td>
                <td>{item.isActive ? "Aktiv" : "Inaktiv"}</td>
                <td>{item.nextVoucherNumber}</td>
                <td>{item._count.journalEntries}</td>
                <td>
                  {canWrite && <button onClick={() => setEditing(item)}>Redigera</button>}
                  {["OWNER", "ADMIN"].includes(role) && item.isActive && (
                    <button
                      className="ml-3"
                      disabled={busy}
                      onClick={() => void setDefault(item.code)}
                    >
                      Använd som standard
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canWrite && (
        <form
          className="space-y-3 register-editor"
          key={editing?.id ?? `new:${years.selected}`}
          onSubmit={save}
        >
          <h2 className="text-lg font-semibold">{editing ? "Redigera serie" : "Ny serie"}</h2>
          <fieldset
            className="space-y-3"
            disabled={busy || !years.selected || years.activeYear?.status === "CLOSED"}
          >
            <label className="block">
              Seriekod
              <input
                className="ml-3 border p-2"
                name="code"
                defaultValue={editing?.code ?? ""}
                pattern="[A-Za-z0-9_-]{1,16}"
                required
              />
            </label>
            <label className="block">
              Serienamn
              <input
                className="ml-3 border p-2"
                name="name"
                defaultValue={editing?.name ?? ""}
                required
                maxLength={160}
              />
            </label>
            <label className="block">
              Beskrivning
              <input
                className="ml-3 border p-2"
                name="description"
                defaultValue={editing?.description ?? ""}
                maxLength={500}
              />
            </label>
            {editing && (
              <label className="block">
                <input name="active" type="checkbox" defaultChecked={editing.isActive} /> Aktiv
              </label>
            )}
            <button className="rounded bg-accent p-3 text-white">Spara serie</button>
            {editing && (
              <button className="ml-3" type="button" onClick={() => setEditing(null)}>
                Avbryt
              </button>
            )}
          </fieldset>
        </form>
      )}
    </section>
  );
}
